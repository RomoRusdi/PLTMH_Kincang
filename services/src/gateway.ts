import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Modbus from 'modbus-serial'
import mqtt from 'mqtt'
import {
  decodeRegisters,
  gatewayStatusTopic,
  loadGatewayConfig,
  log,
  mqttOptions,
  telemetryTopic,
} from './config.js'
import { connectModbus, describeModbusError, readAllBlocks } from './modbus.js'

// ============================================================================
// PC Gateway: baca holding register PLC via Modbus TCP, ubah menjadi JSON,
// publish ke broker MQTT (QoS 1). Gateway hanya MEMBACA PLC; tidak pernah
// menulis register (sistem bersifat monitoring).
//
// Jika broker tidak terjangkau (ZeroTier/internet putus), payload disimpan
// ke file buffer dan dikirim ulang berurutan saat koneksi pulih. Database
// menolak duplikat (station, tag, timestamp) sehingga pengiriman ulang aman.
// ============================================================================

type Quality = 'good' | 'bad' | 'stale' | 'comm_failure'

interface TelemetryValue {
  tag: string
  value: number | null
  quality: Quality
}

interface TelemetryPayload {
  station_id: string
  gateway_id: string
  ts: string
  seq: number
  values: TelemetryValue[]
}

const config = loadGatewayConfig()
const topic = telemetryTopic(config.station_id)
const statusTopic = gatewayStatusTopic(config.station_id)
const bufferFile = resolve(process.env.BUFFER_FILE ?? 'gateway-buffer.jsonl')
const MAX_BUFFERED = Number(process.env.BUFFER_MAX ?? 100_000)

// ---------------------------------------------------------------------------
// MQTT
// ---------------------------------------------------------------------------
const { url, username, password } = mqttOptions()
const client = mqtt.connect(url, {
  clientId: `rfg-gateway-${config.gateway_id.slice(0, 8)}`,
  username,
  password,
  reconnectPeriod: 5000,
  connectTimeout: 10_000,
  // Broker menandai gateway offline otomatis jika koneksi putus mendadak.
  will: { topic: statusTopic, payload: Buffer.from('offline'), qos: 1, retain: true },
})

let flushing = false
client.on('connect', () => {
  log('gateway', `Terhubung ke broker ${url}`)
  client.publish(statusTopic, 'online', { qos: 1, retain: true })
  void flushBuffer()
})
client.on('reconnect', () => log('gateway', 'Mencoba menyambung ulang ke broker…'))
client.on('offline', () => log('gateway', 'Broker tidak terjangkau; data disimpan ke buffer'))
client.on('error', (error) => log('gateway', `MQTT error: ${error.message}`))

async function publish(payload: TelemetryPayload) {
  // Selama masih ada antrean lama, data baru ikut antre agar urutan terjaga.
  if (!client.connected || flushing || readBuffer().length > 0) {
    bufferPayload(payload)
    if (client.connected) void flushBuffer()
    return
  }
  try {
    await client.publishAsync(topic, JSON.stringify(payload), { qos: 1 })
  } catch (error) {
    log('gateway', `Publish gagal (${(error as Error).message}); disimpan ke buffer`)
    bufferPayload(payload)
  }
}

function bufferPayload(payload: TelemetryPayload) {
  appendFileSync(bufferFile, `${JSON.stringify(payload)}\n`)
}

function readBuffer(): string[] {
  if (!existsSync(bufferFile)) return []
  return readFileSync(bufferFile, 'utf8').split('\n').filter(Boolean)
}

async function flushBuffer() {
  if (flushing) return
  const all = readBuffer()
  let lines = all
  if (lines.length === 0) return
  if (lines.length > MAX_BUFFERED) {
    log('gateway', `Buffer melebihi ${MAX_BUFFERED} pesan; ${lines.length - MAX_BUFFERED} pesan tertua dibuang`)
    lines = lines.slice(-MAX_BUFFERED)
  }
  flushing = true
  log('gateway', `Mengirim ulang ${lines.length} pesan dari buffer…`)
  let sent = 0
  try {
    for (const line of lines) {
      if (!client.connected) break
      await client.publishAsync(topic, line, { qos: 1 })
      sent += 1
    }
  } catch (error) {
    log('gateway', `Pengiriman ulang terhenti: ${(error as Error).message}`)
  } finally {
    // Pesan yang masuk buffer selama flush berlangsung ikut dipertahankan.
    const remaining = [...lines.slice(sent), ...readBuffer().slice(all.length)]
    writeFileSync(bufferFile, remaining.length ? `${remaining.join('\n')}\n` : '')
    flushing = false
    log('gateway', `Buffer terkirim ${sent}, tersisa ${remaining.length}`)
  }
}

// ---------------------------------------------------------------------------
// Modbus (PLC via Modbus TCP, atau radar langsung via converter RS-485)
// ---------------------------------------------------------------------------
// Paket CJS: di ESM kelas klien ada pada properti default.
const plc = new Modbus.default()
let lastHeartbeat: number | null = null
let unchangedHeartbeatPolls = 0
let seq = 0

function failureValues(quality: Quality): TelemetryValue[] {
  return config.tags.map((tag) => ({ tag: tag.tag, value: null, quality }))
}

async function poll(): Promise<TelemetryValue[]> {
  try {
    await connectModbus(plc, config)
    const registers = await readAllBlocks(plc, config)

    // Heartbeat yang tidak berubah berarti program PLC berhenti walau
    // komunikasi Ethernet masih hidup: nilai register tidak lagi terbaru.
    // Radar yang dibaca langsung tidak punya heartbeat, jadi dilewati.
    let plcStale = false
    if (config.heartbeat_address != null) {
      const heartbeat = registers[config.heartbeat_address]
      unchangedHeartbeatPolls = heartbeat === lastHeartbeat ? unchangedHeartbeatPolls + 1 : 0
      lastHeartbeat = heartbeat
      plcStale = unchangedHeartbeatPolls >= config.heartbeat_stale_polls
    }
    // Tanpa register status dari PLC, radar dianggap normal bila terbaca.
    const radarOk = config.radar_comm_address == null || registers[config.radar_comm_address] === 0

    return config.tags.map((tag) => {
      if (plcStale) return { tag: tag.tag, value: null, quality: 'stale' }
      if (tag.source === 'radar' && !radarOk) return { tag: tag.tag, value: null, quality: 'comm_failure' }
      const value = decodeRegisters(registers, tag.address, tag, config.word_order)
      return { tag: tag.tag, value: Number.isFinite(value) ? value : null, quality: Number.isFinite(value) ? 'good' : 'bad' }
    })
  } catch (error) {
    log('gateway', `Gagal membaca perangkat Modbus: ${describeModbusError(error)}`)
    plc.close(() => undefined)
    return failureValues('comm_failure')
  }
}

async function loop() {
  const startedAt = Date.now()
  const values = await poll()
  seq = (seq + 1) % Number.MAX_SAFE_INTEGER
  const payload: TelemetryPayload = {
    station_id: config.station_id,
    gateway_id: config.gateway_id,
    ts: new Date(startedAt).toISOString(),
    seq,
    values,
  }
  await publish(payload)
  const good = values.filter((value) => value.quality === 'good').length
  log('gateway', `#${seq} ${good}/${values.length} tag GOOD${client.connected ? '' : ' (buffer)'}`)
  setTimeout(loop, Math.max(0, config.poll_interval_ms - (Date.now() - startedAt)))
}

log('gateway', `Polling PLC tiap ${config.poll_interval_ms} ms, publish ke topic ${topic}`)
void loop()

function shutdown() {
  log('gateway', 'Menghentikan gateway…')
  client.publish(statusTopic, 'offline', { qos: 1, retain: true }, () => {
    client.end()
    plc.close(() => process.exit(0))
  })
  setTimeout(() => process.exit(0), 2000)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
