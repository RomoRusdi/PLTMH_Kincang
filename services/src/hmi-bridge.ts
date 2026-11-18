import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import mqtt from 'mqtt'
import { log, mqttOptions, telemetryTopic } from './config.js'

// ============================================================================
// Penghubung data HMI Haiwell → web. HMI mengirim sendiri lewat WiFi ke broker
// MQTT (fitur "MQTT" bawaan Haiwell), format:
//   topic   data/<project identifier>/haiwell/<machine code>
//   payload {"_terminalTime":"2026-11-18 13:02:53.782","_groupName":"Kincang","MODNET_PLC_KW_TOTAL":"683"}
// Program ini subscribe ke topic itu, mengubah nilai ke satuan teknik (scale),
// merata-ratakan per window_ms, lalu meneruskan ke broker lokal dengan format
// gateway sehingga ingest yang sudah berjalan menyimpannya ke Supabase.
// Hanya MEMBACA dari broker HMI; tidak pernah mengirim apa pun ke HMI.
//
//   npm run hmi-bridge                         jalan terus
//   HMI_BRIDGE_DRY_RUN=1 npm run hmi-bridge    hanya tampilkan, tidak diteruskan
// ============================================================================

interface ValueMap {
  key: string
  tag: string
  /** Nilai teknik = nilai HMI × scale. null = belum dipastikan (mode lihat saja). */
  scale: number | null
  min: number
  max: number
}

interface BridgeConfig {
  station_id: string
  gateway_id: string
  source: { url: string; topic: string; group?: string }
  window_ms: number
  max_clock_skew_s: number
  values: ValueMap[]
}

const configPath = resolve(process.env.HMI_BRIDGE_CONFIG ?? 'config/hmi-kincang.json')
const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^﻿/, '')) as BridgeConfig
const unscaled = config.values.filter((v) => v.scale == null).map((v) => v.key)
const DRY_RUN = process.env.HMI_BRIDGE_DRY_RUN === '1' || unscaled.length > 0
const ONCE_WINDOWS = Number(process.env.HMI_BRIDGE_WINDOWS ?? 0)

if (unscaled.length) {
  log('hmi', `Skala belum diisi untuk ${unscaled.join(', ')} di ${configPath}: mode LIHAT SAJA, data tidak diteruskan ke web`)
}

/** _terminalTime HMI adalah jam lokal WIB tanpa zona waktu. */
function hmiTime(text: unknown): number | null {
  if (typeof text !== 'string') return null
  const ms = Date.parse(text.replace(' ', 'T') + '+07:00')
  return Number.isFinite(ms) ? ms : null
}

// ---------------------------------------------------------------------------
// Jendela rata-rata
// ---------------------------------------------------------------------------
interface Window { start: number; sums: Map<string, number>; counts: Map<string, number>; raw: Map<string, number[]>; rejected: number; messages: number }
const newWindow = (start: number): Window => ({ start, sums: new Map(), counts: new Map(), raw: new Map(), rejected: 0, messages: 0 })
const windowStartOf = (ms: number) => Math.floor(ms / config.window_ms) * config.window_ms
let current = newWindow(windowStartOf(Date.now()))
let seq = 0
let windowsDone = 0
let sourceConnected = false
let lastSkewLog = 0

// ---------------------------------------------------------------------------
// Broker lokal (ke ingest)
// ---------------------------------------------------------------------------
const local = DRY_RUN ? null : mqtt.connect(mqttOptions().url, {
  clientId: 'rfg-hmi-bridge',
  username: mqttOptions().username,
  password: mqttOptions().password,
  reconnectPeriod: 5000,
})
local?.on('connect', () => log('hmi', `Terhubung ke broker lokal ${mqttOptions().url}`))
local?.on('error', (error) => log('hmi', `Broker lokal error: ${error.message}`))

// ---------------------------------------------------------------------------
// Broker HMI (sumber)
// ---------------------------------------------------------------------------
const source = mqtt.connect(config.source.url, {
  // Broker publik: client ID acak agar tidak bentrok dengan klien lain.
  clientId: `rfg-hmi-${config.station_id.slice(0, 8)}-${Math.random().toString(16).slice(2, 8)}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 15000,
})
source.on('connect', () => {
  sourceConnected = true
  log('hmi', `Terhubung ke ${config.source.url}, subscribe ${config.source.topic}`)
  source.subscribe(config.source.topic, { qos: 0 }, (error) => { if (error) log('hmi', `Subscribe gagal: ${error.message}`) })
})
source.on('close', () => { if (sourceConnected) log('hmi', 'Koneksi ke broker HMI terputus, mencoba lagi'); sourceConnected = false })
source.on('error', (error) => log('hmi', `Broker HMI error: ${error.message}`))

source.on('message', (_topic, buffer) => {
  const now = Date.now()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(buffer.toString())
  } catch {
    current.rejected += 1
    return
  }
  if (config.source.group && data._groupName !== config.source.group) { current.rejected += 1; return }
  const sent = hmiTime(data._terminalTime)
  if (sent != null && Math.abs(now - sent) > config.max_clock_skew_s * 1000) {
    // Pesan lama/terlambat atau jam HMI melenceng jauh: jangan dipakai.
    current.rejected += 1
    if (now - lastSkewLog > 600_000) {
      lastSkewLog = now
      log('hmi', `Pesan diabaikan: jam HMI ${String(data._terminalTime)} berbeda ${Math.round((now - sent) / 1000)} detik dari jam komputer`)
    }
    return
  }
  current.messages += 1
  for (const map of config.values) {
    const raw = Number(data[map.key])
    if (data[map.key] == null || !Number.isFinite(raw)) continue
    const rawList = current.raw.get(map.key) ?? []
    rawList.push(raw)
    current.raw.set(map.key, rawList)
    if (map.scale == null) continue
    const value = raw * map.scale
    if (value < map.min || value > map.max) { current.rejected += 1; continue }
    current.sums.set(map.tag, (current.sums.get(map.tag) ?? 0) + value)
    current.counts.set(map.tag, (current.counts.get(map.tag) ?? 0) + 1)
  }
})

const startedAt = Date.now()

function closeWindow(window: Window) {
  // Jendela pertama saat program baru menyala belum sempat menerima data.
  if (window.start < startedAt && window.messages === 0) return
  const values = config.values.map((map) => {
    const count = window.counts.get(map.tag) ?? 0
    return count > 0
      ? { tag: map.tag, value: Number(((window.sums.get(map.tag) ?? 0) / count).toPrecision(6)), quality: 'good' as const }
      : { tag: map.tag, value: null, quality: (sourceConnected ? 'bad' : 'comm_failure') as 'bad' | 'comm_failure' }
  })
  const rawText = config.values.map((map) => {
    const list = window.raw.get(map.key) ?? []
    if (!list.length) return `${map.key}: -`
    const mean = list.reduce((a, b) => a + b, 0) / list.length
    return `${map.key}: ${list.length} data, mentah rata ${mean.toFixed(1)} (min ${Math.min(...list)}, maks ${Math.max(...list)})`
  }).join('; ')
  const valueText = values.map((v) => `${v.tag}=${v.value ?? v.quality}`).join(', ')
  const when = new Date(window.start).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })

  if (DRY_RUN) {
    log('hmi', `[lihat] ${when} WIB: ${rawText}${unscaled.length ? '' : ` → ${valueText}`}${window.rejected ? `, ${window.rejected} ditolak` : ''}`)
  } else {
    seq = (seq + 1) % Number.MAX_SAFE_INTEGER
    const payload = { station_id: config.station_id, gateway_id: config.gateway_id, ts: new Date(window.start).toISOString(), seq, values }
    local!.publish(telemetryTopic(config.station_id), JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) log('hmi', `Gagal meneruskan ${when}: ${error.message}`)
    })
    log('hmi', `#${seq} ${when} WIB: ${valueText} (${window.messages} pesan${window.rejected ? `, ${window.rejected} ditolak` : ''})`)
  }
}

function scheduleClose() {
  const next = current.start + config.window_ms
  setTimeout(() => {
    const done = current
    current = newWindow(next)
    closeWindow(done)
    windowsDone += 1
    if (ONCE_WINDOWS && windowsDone >= ONCE_WINDOWS) {
      source.end(true)
      local?.end(false, {}, () => process.exit(0))
      if (!local) process.exit(0)
      return
    }
    scheduleClose()
  }, Math.max(0, next - Date.now()))
}

log('hmi', `Stasiun ${config.station_id}: ${config.values.map((v) => `${v.key} × ${v.scale ?? '?'} → ${v.tag}`).join(', ')}; rata-rata tiap ${config.window_ms / 1000} detik${DRY_RUN ? ' (tidak diteruskan)' : ''}`)
scheduleClose()
