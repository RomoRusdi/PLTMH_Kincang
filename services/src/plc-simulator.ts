import { createInterface } from 'node:readline'
import Modbus from 'modbus-serial'
import { encodeValue, loadGatewayConfig, log, readBlocks, type TagMapping } from './config.js'

// ============================================================================
// Simulator PLC (Modbus TCP slave) untuk pengembangan tanpa perangkat keras.
// Mengisi holding register sesuai config/gateway.json dengan pola aliran
// sungai yang wajar. Skenario gangguan bisa dipicu dari terminal untuk
// menguji alarm (ketik nama skenario lalu Enter).
// ============================================================================

const config = loadGatewayConfig()
const host = process.env.SIM_HOST ?? '0.0.0.0'
const port = Number(process.env.SIM_PORT ?? config.plc.port ?? 5020)

const SCENARIOS = {
  normal: 'Kondisi normal',
  banjir: 'Level dan debit naik bertahap (uji alarm high/high-high)',
  kering: 'Level dan debit turun (uji alarm low)',
  'radar-putus': 'PLC kehilangan komunikasi Modbus RTU dengan radar',
  'plc-hang': 'Heartbeat PLC berhenti (uji deteksi data stale)',
  panas: 'Suhu panel naik di atas threshold',
} as const
type Scenario = keyof typeof SCENARIOS

const registerCount = Math.max(...readBlocks(config).map((block) => block.start + block.count))
const registers = new Array<number>(registerCount).fill(0)
const tagsByName = new Map(config.tags.map((tag) => [tag.tag, tag]))

const initialScenario = (process.env.SIM_SCENARIO ?? 'normal') as Scenario
let scenario: Scenario = initialScenario in SCENARIOS ? initialScenario : 'normal'
let scenarioStartedAt = Date.now()
let heartbeat = 0
let volumeM3 = 565_000
let energyKwh = 51_200
let lastTick = Date.now()

function write(tagName: string, value: number) {
  const tag = tagsByName.get(tagName)
  if (!tag) return
  writeTag(tag, value)
}

function writeTag(tag: TagMapping, value: number) {
  const words = encodeValue(value, tag, config.word_order)
  words.forEach((word, index) => { registers[tag.address + index] = word })
}

function tick() {
  const now = Date.now()
  const dtSeconds = (now - lastTick) / 1000
  lastTick = now
  const h = now / 3_600_000
  const minutesInScenario = (now - scenarioStartedAt) / 60_000
  const noise = (amplitude: number) => (Math.random() - 0.5) * 2 * amplitude

  // Pola harian + variasi pendek, sama dengan database/demo-history.sql.
  let level = 0.8 + 0.12 * Math.sin((2 * Math.PI * h) / 24) + 0.03 * Math.sin((2 * Math.PI * h) / 3.7) + noise(0.005)
  let velocity = 1.2 + 0.15 * Math.sin((2 * Math.PI * h) / 24 + 0.6) + 0.04 * Math.sin((2 * Math.PI * h) / 2.3) + noise(0.02)
  if (scenario === 'banjir') {
    const ramp = Math.min(1, minutesInScenario / 2)  // naik penuh dalam 2 menit
    level += 1.4 * ramp
    velocity += 1.5 * ramp
  } else if (scenario === 'kering') {
    const ramp = Math.min(1, minutesInScenario / 2)
    level -= 0.65 * ramp
    velocity -= 0.9 * ramp
  }
  level = Math.max(0, level)
  velocity = Math.max(0, velocity)
  const flow = level * 2.0 * velocity * 0.85
  volumeM3 += flow * dtSeconds
  const powerKw = 25 + flow * 12 + noise(0.3)
  energyKwh += (powerKw * dtSeconds) / 3600
  let panelTemp = 34 + 5 * Math.sin((2 * Math.PI * (h - 8)) / 24) + noise(0.2)
  if (scenario === 'panas') panelTemp += 18 * Math.min(1, minutesInScenario / 2)

  const radarOk = scenario !== 'radar-putus'
  if (scenario !== 'plc-hang') heartbeat = (heartbeat + 1) % 0x10000
  if (config.heartbeat_address != null) registers[config.heartbeat_address] = heartbeat

  write('SYS.RADAR_COMM', radarOk ? 0 : 1)
  if (radarOk) {
    write('HYDRO.WATER_LEVEL', level)
    write('HYDRO.VELOCITY', velocity)
    write('HYDRO.FLOW_RATE', flow)
    write('HYDRO.VOLUME', volumeM3)
    write('HYDRO.AIR_GAP', 3.0 - level)
    write('HYDRO.FLOW_DIRECTION', 0)
  }
  write('PANEL.TEMPERATURE', panelTemp)
  write('PANEL.FAN_STATUS', panelTemp > 37 ? 1 : 0)
  write('POWER.VOLTAGE', 220 + 3 * Math.sin((2 * Math.PI * h) / 5.1) + noise(0.5))
  write('POWER.CURRENT', (powerKw * 1000) / (3 * 220 * 0.9))
  write('POWER.ACTIVE_POWER', powerKw)
  write('POWER.ENERGY_KWH', energyKwh)
  write('POWER.POWER_FACTOR', 0.9 + 0.02 * Math.sin((2 * Math.PI * h) / 7.3))
  write('POWER.FREQUENCY', 50 + 0.08 * Math.sin((2 * Math.PI * h) / 1.7) + noise(0.01))
}

tick()
setInterval(tick, 1000)

const server = new Modbus.ServerTCP(
  {
    getHoldingRegister: (addr: number) => registers[addr] ?? 0,
    getMultipleHoldingRegisters: (addr: number, length: number) =>
      Array.from({ length }, (_, index) => registers[addr + index] ?? 0),
    // Input register disamakan agar gateway bisa memakai FC03 maupun FC04.
    getInputRegister: (addr: number) => registers[addr] ?? 0,
    getMultipleInputRegisters: (addr: number, length: number) =>
      Array.from({ length }, (_, index) => registers[addr + index] ?? 0),
  },
  { host, port, unitID: config.plc.unit_id },
)

server.on('socketError', (error) => log('simulator', `socket error: ${error?.message ?? error}`))
server.on('serverError', (error) => {
  log('simulator', `Gagal membuka port ${port}: ${error?.message ?? error}`)
  process.exit(1)
})
server.on('initialized', () => {
  log('simulator', `PLC simulator aktif di ${host}:${port} (unit ${config.plc.unit_id})`)
  log('simulator', `Skenario tersedia: ${Object.entries(SCENARIOS).map(([key, text]) => `\n  ${key.padEnd(12)} ${text}`).join('')}`)
  log('simulator', 'Ketik nama skenario lalu Enter untuk mengganti.')
})

createInterface({ input: process.stdin }).on('line', (line) => {
  const next = line.trim() as Scenario
  if (!next) return
  if (!(next in SCENARIOS)) {
    log('simulator', `Skenario "${next}" tidak dikenal. Pilihan: ${Object.keys(SCENARIOS).join(', ')}`)
    return
  }
  scenario = next
  scenarioStartedAt = Date.now()
  log('simulator', `Skenario -> ${next}: ${SCENARIOS[next]}`)
})
