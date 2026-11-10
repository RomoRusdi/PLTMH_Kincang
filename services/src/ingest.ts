import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import mqtt from 'mqtt'
import { log, mqttOptions } from './config.js'

// ============================================================================
// Service ingest: subscribe telemetry dari broker MQTT lalu menyimpannya ke
// Supabase melalui RPC ingest_telemetry (validasi dilakukan di database).
// Memakai SERVICE ROLE key: jalankan hanya di server tepercaya.
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di services/.env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TOPIC = 'pltmh/+/telemetry'
/** Percobaan cepat (jeda 1 dan 2 detik) sebelum pesan dipindah ke buffer. */
const QUICK_ATTEMPTS = 3

const { url, username, password } = mqttOptions()
const client = mqtt.connect(url, {
  clientId: 'rfg-ingest',
  username,
  password,
  // Sesi persisten: pesan QoS 1 yang datang saat ingest mati ditahan broker.
  clean: false,
  reconnectPeriod: 5000,
})

client.on('connect', () => {
  log('ingest', `Terhubung ke broker ${url}`)
  client.subscribe(TOPIC, { qos: 1 }, (error) => {
    if (error) log('ingest', `Subscribe gagal: ${error.message}`)
    else log('ingest', `Subscribe ${TOPIC}`)
  })
})
client.on('error', (error) => log('ingest', `MQTT error: ${error.message}`))
client.on('offline', () => log('ingest', 'Broker tidak terjangkau'))

// ---------------------------------------------------------------------------
// Buffer di disk: bila Supabase tidak terjangkau (internet putus, Supabase
// gangguan), pesan disimpan ke file dan dikirim ulang berkala dengan urutan
// yang sama. Pesan yang ditolak validasi database tidak di-buffer.
// Pengiriman ulang aman: database menolak duplikat (stasiun, tag, waktu).
// ---------------------------------------------------------------------------
const bufferFile = resolve(process.env.INGEST_BUFFER_FILE ?? 'ingest-buffer.jsonl')
const BUFFER_MAX = Number(process.env.INGEST_BUFFER_MAX ?? 200_000)
const RETRY_MS = Number(process.env.INGEST_RETRY_MS ?? 30_000)

interface BufferedMessage { topic: string; payload: unknown }
type SaveResult = 'saved' | 'rejected' | 'unreachable'

let buffered = readBuffer().length
let lastError = ''
let flushTimer: NodeJS.Timeout | null = null

// Semua pekerjaan (pesan baru dan pengiriman ulang buffer) berjalan dalam satu
// antrean, sehingga urutan data per stasiun terjaga dan file buffer tidak
// pernah ditulis bersamaan.
let queue = Promise.resolve()
const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch((error) => log('ingest', `Kesalahan tak terduga: ${(error as Error).message}`))
}

client.on('message', (topic, message) => enqueue(() => handle(topic, message.toString())))

if (buffered > 0) {
  log('ingest', `Ada ${buffered} pesan tertunda di ${bufferFile}; dikirim setelah start`)
  enqueue(flushBuffer)
}

async function save(topic: string, payload: unknown, quiet = false): Promise<SaveResult> {
  try {
    const { data, error } = await supabase.rpc('ingest_telemetry', { p_payload: payload })
    if (!error) {
      const result = data as { accepted: number; duplicate: number; rejected: Array<{ tag: string; reason: string }> }
      const rejected = result.rejected.length ? ` | ditolak: ${result.rejected.map((r) => `${r.tag} (${r.reason})`).join(', ')}` : ''
      if (!quiet || rejected) log('ingest', `${topic} diterima ${result.accepted}, duplikat ${result.duplicate}${rejected}`)
      return 'saved'
    }
    // P0001 = raise exception dari validasi ingest_telemetry, 22P02 = format
    // salah: payload memang keliru, mengulang tidak akan berhasil.
    if (error.code === 'P0001' || error.code === '22P02') {
      log('ingest', `Payload ditolak database: ${error.message}`)
      return 'rejected'
    }
    lastError = error.message
  } catch (error) {
    lastError = (error as Error).message
  }
  return 'unreachable'
}

async function handle(topic: string, raw: string) {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    log('ingest', `Payload bukan JSON di ${topic}; diabaikan`)
    return
  }

  // Selama masih ada antrean lama, pesan baru ikut antre agar urutan terjaga.
  if (buffered > 0) {
    appendBuffer({ topic, payload })
    scheduleFlush()
    return
  }

  // Gangguan sesaat cukup diulang cepat; gangguan lebih lama masuk buffer.
  for (let attempt = 1; attempt <= QUICK_ATTEMPTS; attempt += 1) {
    if ((await save(topic, payload)) !== 'unreachable') return
    if (attempt < QUICK_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1))
  }
  appendBuffer({ topic, payload })
  log('ingest', `Supabase tidak terjangkau (${lastError}); pesan disimpan ke buffer (${buffered} tertunda), dicoba lagi tiap ${RETRY_MS / 1000} detik`)
  scheduleFlush()
}

async function flushBuffer() {
  let lines = readBuffer()
  if (lines.length === 0) {
    buffered = 0
    return
  }
  if (lines.length > BUFFER_MAX) {
    log('ingest', `Buffer melebihi ${BUFFER_MAX} pesan; ${lines.length - BUFFER_MAX} pesan tertua dibuang`)
    lines = lines.slice(-BUFFER_MAX)
  }

  let done = 0
  let saved = 0
  for (const line of lines) {
    let message: BufferedMessage
    try {
      message = JSON.parse(line) as BufferedMessage
    } catch {
      done += 1  // baris rusak (mis. listrik mati saat menulis) dilewati
      continue
    }
    const result = await save(message.topic, message.payload, true)
    if (result === 'unreachable') break
    done += 1
    if (result === 'saved') saved += 1
  }

  const remaining = lines.slice(done)
  writeFileSync(bufferFile, remaining.length ? `${remaining.join('\n')}\n` : '')
  buffered = remaining.length
  if (done > 0) log('ingest', `Buffer: ${saved} pesan terkirim ulang, ${remaining.length} tersisa`)
  if (remaining.length > 0) {
    if (done === 0) log('ingest', `Supabase masih tidak terjangkau (${lastError}); ${remaining.length} pesan tertunda`)
    scheduleFlush()
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    enqueue(flushBuffer)
  }, RETRY_MS)
}

function appendBuffer(message: BufferedMessage) {
  appendFileSync(bufferFile, `${JSON.stringify(message)}\n`)
  buffered += 1
}

function readBuffer(): string[] {
  if (!existsSync(bufferFile)) return []
  return readFileSync(bufferFile, 'utf8').split('\n').filter(Boolean)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shutdown() {
  if (flushTimer) clearTimeout(flushTimer)
  // Tunggu pesan yang sedang diproses selesai (tersimpan atau masuk buffer).
  void queue.finally(() => client.end(false, {}, () => process.exit(0)))
  setTimeout(() => process.exit(0), 10_000)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
