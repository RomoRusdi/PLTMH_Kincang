import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import mqtt from 'mqtt'
import { log, mqttOptions, telemetryTopic } from './config.js'

// ============================================================================
// Penghubung data HMI Haiwell → web. HMI mengirim sendiri lewat WiFi ke broker
// MQTT (fitur "MQTT" bawaan Haiwell), format:
//   topic   data/<project identifier>/<nama>/<machine code>
//   payload {"_terminalTime":"2026-11-18 13:02:53.782","_groupName":"DataLog","MODNET_PLC_KW_TOTAL":"683", ...}
// Program ini subscribe ke topic itu, mengubah nilai ke satuan teknik (scale),
// meringkas per window_ms dengan median, lalu meneruskan ke broker lokal dengan
// format gateway sehingga ingest yang sudah berjalan menyimpannya ke Supabase.
//
// Waktu data memakai _terminalTime dari HMI, bukan waktu pesan diterima: saat
// broker terputus HMI mengirim ulang data yang tertahan (bisa terlambat
// beberapa menit), dan data itu tetap tersimpan di jam aslinya.
// Hanya MEMBACA dari broker HMI; tidak pernah mengirim apa pun ke HMI.
//
//   npm run hmi-bridge                         jalan terus
//   HMI_BRIDGE_DRY_RUN=1 npm run hmi-bridge    hanya tampilkan, tidak diteruskan
// ============================================================================

interface ValueMap {
  /** Satu key, atau beberapa key yang dirata-ratakan per pesan (mis. tiga fasa). */
  keys: string[]
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
  /** Data dengan jam HMI lebih dari ini di depan jam komputer ditolak (ingest juga menolak > 5 menit). */
  max_clock_skew_s: number
  /** Data tertahan yang lebih tua dari ini tidak dipakai lagi. */
  max_delay_s?: number
  values: ValueMap[]
}

const configPath = resolve(process.env.HMI_BRIDGE_CONFIG ?? 'config/hmi-kincang.json')
const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^﻿/, '')) as BridgeConfig
const unscaled = config.values.filter((v) => v.scale == null).map((v) => v.tag)
const DRY_RUN = process.env.HMI_BRIDGE_DRY_RUN === '1' || unscaled.length > 0
const ONCE_WINDOWS = Number(process.env.HMI_BRIDGE_WINDOWS ?? 0)
const MAX_DELAY_MS = (config.max_delay_s ?? 6 * 3600) * 1000
/** Jendela ditutup bila HMI sudah mengirim data melewati akhir jendela + jeda ini, */
const GRACE_MS = 5_000
/** atau bila tidak ada pesan baru untuk jendela itu selama ini (aliran berhenti). */
const IDLE_MS = 60_000

if (unscaled.length) {
  log('hmi', `Skala belum diisi untuk ${unscaled.join(', ')} di ${configPath}: mode LIHAT SAJA, data tidak diteruskan ke web`)
}

/** _terminalTime HMI adalah jam lokal WIB tanpa zona waktu. */
function hmiTime(text: unknown): number | null {
  if (typeof text !== 'string') return null
  const ms = Date.parse(text.replace(' ', 'T') + '+07:00')
  return Number.isFinite(ms) ? ms : null
}

/** Median: satu-dua pesan bernilai 0 akibat gangguan komunikasi HMI–PLC tidak menggeser hasil. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const wib = (ms: number) => new Date(ms).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })

// ---------------------------------------------------------------------------
// Jendela per waktu HMI
// ---------------------------------------------------------------------------
interface Window { start: number; samples: Map<string, number[]>; raw: Map<string, number[]>; messages: number; rejected: number; lastWallMs: number; lagMs: number }
const windows = new Map<number, Window>()
const flushed = new Set<number>()
let latestHmiMs = 0
let seq = 0
let windowsDone = 0
let rejectedLog = { count: 0, reason: '', at: 0 }

function windowFor(hmiMs: number, now: number): Window {
  const start = Math.floor(hmiMs / config.window_ms) * config.window_ms
  let window = windows.get(start)
  if (!window) {
    window = { start, samples: new Map(), raw: new Map(), messages: 0, rejected: 0, lastWallMs: now, lagMs: 0 }
    windows.set(start, window)
  }
  return window
}
const push = (map: Map<string, number[]>, key: string, value: number) => map.set(key, [...(map.get(key) ?? []), value])

function reject(reason: string) {
  const now = Date.now()
  rejectedLog.count += 1
  rejectedLog.reason = reason
  if (now - rejectedLog.at > 600_000) {
    log('hmi', `Pesan ditolak (${rejectedLog.count} sejak laporan terakhir), terakhir: ${reason}`)
    rejectedLog = { count: 0, reason: '', at: now }
  }
}

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
let sourceConnected = false
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
    reject('bukan JSON')
    return
  }
  if (config.source.group && data._groupName !== config.source.group) { reject(`grup ${String(data._groupName)}`); return }
  const hmiMs = hmiTime(data._terminalTime)
  if (hmiMs == null) { reject('tanpa _terminalTime'); return }
  if (hmiMs - now > config.max_clock_skew_s * 1000) { reject(`jam HMI ${String(data._terminalTime)} di depan jam komputer`); return }
  if (now - hmiMs > MAX_DELAY_MS) { reject(`data ${String(data._terminalTime)} terlalu lama tertahan`); return }

  const window = windowFor(hmiMs, now)
  if (flushed.has(window.start)) { reject(`jendela ${wib(window.start)} sudah dikirim`); return }
  window.messages += 1
  window.lastWallMs = now
  window.lagMs = Math.max(window.lagMs, now - hmiMs)
  latestHmiMs = Math.max(latestHmiMs, hmiMs)
  for (const map of config.values) {
    const parts = map.keys.map((key) => (data[key] == null || data[key] === '' ? Number.NaN : Number(data[key])))
    if (parts.some((v) => !Number.isFinite(v))) continue
    const raw = parts.reduce((a, b) => a + b, 0) / parts.length
    push(window.raw, map.tag, raw)
    if (map.scale == null) continue
    const value = raw * map.scale
    if (value < map.min || value > map.max) { window.rejected += 1; continue }
    push(window.samples, map.tag, value)
  }
})

function flush(window: Window) {
  windows.delete(window.start)
  flushed.add(window.start)
  if (flushed.size > 2000) flushed.delete(flushed.values().next().value as number)

  const values = config.values.flatMap((map) => {
    const samples = window.samples.get(map.tag) ?? []
    return samples.length ? [{ tag: map.tag, value: Number(median(samples).toPrecision(6)), quality: 'good' as const }] : []
  })
  const lag = window.lagMs > 120_000 ? `, terlambat ${Math.round(window.lagMs / 60_000)} menit` : ''
  const info = `${window.messages} pesan${window.rejected ? `, ${window.rejected} nilai di luar batas` : ''}${lag}`

  if (DRY_RUN) {
    const rawText = config.values.map((map) => {
      const list = window.raw.get(map.tag) ?? []
      return list.length ? `${map.tag} mentah ${median(list).toFixed(1)}` : `${map.tag} -`
    }).join('; ')
    const valueText = values.map((v) => `${v.tag}=${v.value}`).join(', ')
    log('hmi', `[lihat] ${wib(window.start)} WIB (${info}): ${unscaled.length ? rawText : valueText || 'tidak ada nilai valid'}`)
  } else if (values.length) {
    seq = (seq + 1) % Number.MAX_SAFE_INTEGER
    const payload = { station_id: config.station_id, gateway_id: config.gateway_id, ts: new Date(window.start).toISOString(), seq, values }
    local!.publish(telemetryTopic(config.station_id), JSON.stringify(payload), { qos: 1 }, (error) => {
      if (error) log('hmi', `Gagal meneruskan ${wib(window.start)}: ${error.message}`)
    })
    log('hmi', `#${seq} ${wib(window.start)} WIB: ${values.map((v) => `${v.tag}=${v.value}`).join(', ')} (${info})`)
  }

  windowsDone += 1
  if (ONCE_WINDOWS && windowsDone >= ONCE_WINDOWS) {
    source.end(true)
    if (local) local.end(false, {}, () => process.exit(0))
    else process.exit(0)
  }
}

// Tutup jendela yang sudah lengkap: HMI sudah mengirim data setelah akhir
// jendela, atau aliran berhenti cukup lama.
setInterval(() => {
  const now = Date.now()
  const ready = [...windows.values()]
    .filter((w) => w.start + config.window_ms + GRACE_MS <= latestHmiMs || now - w.lastWallMs > IDLE_MS)
    .sort((a, b) => a.start - b.start)
  for (const window of ready) flush(window)
}, 2_000)

log('hmi', `Stasiun ${config.station_id}: ${config.values.map((v) => `${v.keys.join('+')} × ${v.scale ?? '?'} → ${v.tag}`).join(', ')}; median tiap ${config.window_ms / 1000} detik menurut jam HMI${DRY_RUN ? ' (tidak diteruskan)' : ''}`)
