import mqtt from 'mqtt'
import { log, mqttOptions, telemetryTopic } from './config.js'

// ============================================================================
// Pengirim data live untuk stasiun [DEMO] (database/demo-5-stasiun.sql).
// Meniru beberapa PC gateway sekaligus: payload dikirim ke MQTT dengan format
// yang sama seperti gateway.ts, sehingga ingest, kalibrasi, alarm, dan
// realtime dashboard ikut teruji. Tidak memakai Modbus.
//
// Stasiun Pekacangan sengaja tidak dikirim agar tampil "Data terhenti".
// ============================================================================

type Scenario = 'normal' | 'naik' | 'radar-putus'

interface DemoStation {
  name: string
  stationId: string
  gatewayId: string
  scenario: Scenario
  baseLevel: number
  baseVelocity: number
  /** Parameter sama dengan kalibrasi demo agar jarak ke air konsisten. */
  installHeight: number
  levelOffset: number
  bottomWidth: number
  sideSlope: number
  phase: number
}

const STATIONS: DemoStation[] = [
  {
    name: '[DEMO] Saluran Serayu', scenario: 'normal',
    stationId: 'de000000-0000-4000-8000-000000000002', gatewayId: 'de000000-0002-4000-8000-000000000004',
    baseLevel: 1.05, baseVelocity: 1.25, installHeight: 3.2, levelOffset: 0.015, bottomWidth: 2.5, sideSlope: 0, phase: 0,
  },
  {
    // Level naik bertahap melewati batas High (1,50 m) untuk memperlihatkan alarm.
    name: '[DEMO] Saluran Merawu', scenario: 'naik',
    stationId: 'de000000-0000-4000-8000-000000000003', gatewayId: 'de000000-0003-4000-8000-000000000004',
    baseLevel: 1.1, baseVelocity: 1.15, installHeight: 3.0, levelOffset: 0.025, bottomWidth: 3.0, sideSlope: 0, phase: 1.3,
  },
  {
    // PLC melaporkan radar tidak merespons: data radar kosong + SYS.RADAR_COMM = 1.
    name: '[DEMO] Saluran Tulis', scenario: 'radar-putus',
    stationId: 'de000000-0000-4000-8000-000000000004', gatewayId: 'de000000-0004-4000-8000-000000000004',
    baseLevel: 0.72, baseVelocity: 0.95, installHeight: 2.8, levelOffset: -0.01, bottomWidth: 1.8, sideSlope: 1, phase: 2.1,
  },
]

const INTERVAL_MS = Number(process.env.DEMO_INTERVAL_MS ?? 60000)
const startedAt = Date.now()
let seq = 0

const noise = (amplitude: number) => (Math.random() - 0.5) * 2 * amplitude
const round = (value: number, digits: number) => Number(value.toFixed(digits))

function buildValues(s: DemoStation, now: number) {
  const h = now / 3_600_000
  const minutes = (now - startedAt) / 60_000

  let level = s.baseLevel + 0.12 * Math.sin((2 * Math.PI * h) / 24 + s.phase) + 0.03 * Math.sin((2 * Math.PI * h) / 3.7 + s.phase) + noise(0.004)
  let velocity = s.baseVelocity + 0.12 * Math.sin((2 * Math.PI * h) / 24 + s.phase + 0.6) + 0.04 * Math.sin((2 * Math.PI * h) / 2.3) + noise(0.02)
  if (s.scenario === 'naik') {
    const ramp = Math.min(1, minutes / 2) // mencapai puncak dalam ±2 menit
    level += 0.55 * ramp
    velocity += 0.6 * ramp
  }

  // Nilai "hitungan internal radar" sengaja sedikit meleset; ingest akan
  // menggantinya dengan hasil kalibrasi dan menyimpan nilai ini di raw_value.
  const radarLevel = level - 0.02
  const airGap = s.installHeight + s.levelOffset - level
  const flow = 0.85 * velocity * (s.bottomWidth + s.sideSlope * level) * level
  const power = 18 + flow * 11 + noise(0.3)
  const panelTemp = 33 + 5 * Math.sin((2 * Math.PI * (h - 8)) / 24 + s.phase / 4) + noise(0.2)
  const radarOk = s.scenario !== 'radar-putus'

  const radar = (tag: string, value: number, digits: number) =>
    radarOk ? { tag, value: round(value, digits), quality: 'good' } : { tag, value: null, quality: 'comm_failure' }

  return [
    radar('HYDRO.WATER_LEVEL', radarLevel, 3),
    radar('HYDRO.VELOCITY', velocity, 2),
    radar('HYDRO.FLOW_RATE', flow * 0.97, 3),
    radar('HYDRO.AIR_GAP', airGap, 3),
    radar('HYDRO.FLOW_DIRECTION', 0, 0),
    radar('HYDRO.VOLUME', 90_000 + (now / 1000) * 0.001 * flow, 0),
    { tag: 'SYS.RADAR_COMM', value: radarOk ? 0 : 1, quality: 'good' },
    { tag: 'PANEL.TEMPERATURE', value: round(panelTemp, 1), quality: 'good' },
    { tag: 'PANEL.FAN_STATUS', value: panelTemp > 37 ? 1 : 0, quality: 'good' },
    { tag: 'POWER.VOLTAGE', value: round(220 + 3 * Math.sin((2 * Math.PI * h) / 5.1 + s.phase) + noise(0.5), 1), quality: 'good' },
    { tag: 'POWER.CURRENT', value: round((power * 1000) / (3 * 220 * 0.9), 2), quality: 'good' },
    { tag: 'POWER.ACTIVE_POWER', value: round(power, 2), quality: 'good' },
    { tag: 'POWER.ENERGY_KWH', value: round(30_000 + (now - startedAt) / 3_600_000 * power + 864 * 2.5, 1), quality: 'good' },
    { tag: 'POWER.POWER_FACTOR', value: round(0.9 + 0.02 * Math.sin((2 * Math.PI * h) / 7.3), 2), quality: 'good' },
    { tag: 'POWER.FREQUENCY', value: round(50 + 0.08 * Math.sin((2 * Math.PI * h) / 1.7 + s.phase) + noise(0.01), 2), quality: 'good' },
  ]
}

const { url, username, password } = mqttOptions()
const client = mqtt.connect(url, { clientId: 'rfg-demo-stations', username, password, reconnectPeriod: 5000 })

client.on('connect', () => {
  log('demo', `Terhubung ke broker ${url}; mengirim ${STATIONS.length} stasiun demo tiap ${INTERVAL_MS / 1000} detik`)
  for (const s of STATIONS) log('demo', `  ${s.name} (${s.scenario})`)
})
client.on('error', (error) => log('demo', `MQTT error: ${error.message}`))

setInterval(() => {
  if (!client.connected) return
  const now = Date.now()
  seq += 1
  for (const s of STATIONS) {
    const payload = { station_id: s.stationId, gateway_id: s.gatewayId, ts: new Date(now).toISOString(), seq, values: buildValues(s, now) }
    client.publish(telemetryTopic(s.stationId), JSON.stringify(payload), { qos: 1 })
  }
  log('demo', `#${seq} terkirim untuk ${STATIONS.length} stasiun`)
}, INTERVAL_MS)

process.on('SIGINT', () => client.end(false, {}, () => process.exit(0)))
