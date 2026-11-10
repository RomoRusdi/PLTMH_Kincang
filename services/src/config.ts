import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import 'dotenv/config'

// ============================================================================
// Konfigurasi register map bersama untuk gateway dan simulator PLC.
// Satu file (config/gateway.json) menjadi sumber kebenaran supaya simulator
// dan gateway tidak pernah berbeda alamat.
// ============================================================================

export type RegisterType = 'uint16' | 'int16' | 'uint32' | 'float32'

export interface TagMapping {
  tag: string
  address: number
  type: RegisterType
  scale: number
  /** 'radar' = nilai diteruskan PLC dari radar; ikut gagal saat komunikasi radar putus. */
  source?: 'radar'
}

export interface ReadBlock { start: number; count: number }

/**
 * - `tcp`: Modbus TCP biasa (PLC, atau converter dengan mode "Modbus TCP to RTU").
 * - `rtu-over-tcp`: frame Modbus RTU (dengan CRC) lewat socket TCP, untuk
 *   converter RS-485 ke Ethernet dalam mode transparan (mis. USR-TCP232-304).
 * - `rtu-serial`: Modbus RTU langsung lewat COM port (kabel/adaptor USB ke
 *   RS-485). `host`/`port` diabaikan; pakai `plc.serial`.
 */
export type ModbusProtocol = 'tcp' | 'rtu-over-tcp' | 'rtu-serial'

export interface SerialSettings {
  /** Windows: "COM3"; Linux: "/dev/ttyUSB0". */
  path: string
  baud_rate: number
  parity?: 'none' | 'even' | 'odd'
  data_bits?: 7 | 8
  stop_bits?: 1 | 2
}

/** Teks singkat tujuan koneksi untuk log. */
export function describeTarget(config: GatewayConfig): string {
  const { protocol = 'tcp', serial, host, port } = config.plc
  if (protocol === 'rtu-serial') {
    return serial
      ? `${serial.path} ${serial.baud_rate} ${serial.data_bits ?? 8}${(serial.parity ?? 'none')[0].toUpperCase()}${serial.stop_bits ?? 1}`
      : '(plc.serial belum diisi)'
  }
  return `${host}:${port}`
}

export interface GatewayConfig {
  station_id: string
  gateway_id: string
  poll_interval_ms: number
  plc: {
    /** Untuk tcp / rtu-over-tcp. */
    host?: string
    port?: number
    unit_id: number
    timeout_ms: number
    protocol?: ModbusProtocol
    /** Wajib bila protocol = 'rtu-serial'. */
    serial?: SerialSettings
    /** 3 = holding register (default), 4 = input register. */
    function_code?: 3 | 4
    /** Jeda antar permintaan; radar RS-RAD-N01-3 butuh ≥ 200 ms. */
    inter_read_delay_ms?: number
  }
  word_order: 'big' | 'little'
  /** Satu blok (format lama) atau beberapa blok bila register tidak berurutan. */
  read_block?: ReadBlock
  read_blocks?: ReadBlock[]
  /** null/tidak diisi = perangkat tidak punya heartbeat (deteksi stale dimatikan). */
  heartbeat_address?: number | null
  heartbeat_stale_polls: number
  /** null/tidak diisi = status radar diambil dari berhasil tidaknya pembacaan. */
  radar_comm_address?: number | null
  tags: TagMapping[]
}

export function readBlocks(config: GatewayConfig): ReadBlock[] {
  const blocks = config.read_blocks ?? (config.read_block ? [config.read_block] : [])
  if (blocks.length === 0) throw new Error('Konfigurasi wajib berisi read_block atau read_blocks')
  return blocks
}

export function loadGatewayConfig(): GatewayConfig {
  const path = resolve(process.env.GATEWAY_CONFIG ?? 'config/gateway.json')
  const config = JSON.parse(readFileSync(path, 'utf8')) as GatewayConfig
  if (config.plc.protocol === 'rtu-serial' && !config.plc.serial?.path) {
    throw new Error('protocol rtu-serial membutuhkan plc.serial.path (mis. "COM3") dan plc.serial.baud_rate')
  }
  const blocks = readBlocks(config)
  const inBlock = (start: number, end: number) =>
    blocks.some((block) => start >= block.start && end <= block.start + block.count)
  for (const tag of config.tags) {
    if (!inBlock(tag.address, tag.address + registerWidth(tag.type))) {
      throw new Error(`Tag ${tag.tag} (alamat ${tag.address}) di luar read_block/read_blocks`)
    }
  }
  for (const [name, address] of [['heartbeat_address', config.heartbeat_address], ['radar_comm_address', config.radar_comm_address]] as const) {
    if (address != null && !inBlock(address, address + 1)) {
      throw new Error(`${name} (alamat ${address}) di luar read_block/read_blocks`)
    }
  }
  return config
}

export function registerWidth(type: RegisterType): number {
  return type === 'uint32' || type === 'float32' ? 2 : 1
}

/** Ubah register mentah menjadi nilai teknik (sudah dikali scale). */
export function decodeRegisters(registers: number[], offset: number, tag: TagMapping, wordOrder: 'big' | 'little'): number {
  const [first, second] = [registers[offset], registers[offset + 1]]
  const [hi, lo] = wordOrder === 'big' ? [first, second] : [second, first]
  let raw: number
  switch (tag.type) {
    case 'uint16':
      raw = first
      break
    case 'int16':
      raw = first >= 0x8000 ? first - 0x10000 : first
      break
    case 'uint32':
      raw = hi * 0x10000 + lo
      break
    case 'float32': {
      const buffer = Buffer.alloc(4)
      buffer.writeUInt16BE(hi, 0)
      buffer.writeUInt16BE(lo, 2)
      raw = buffer.readFloatBE(0)
      break
    }
  }
  // Pembulatan menghindari ekor float seperti 1.2340000000000002 akibat scale.
  return Number((raw * tag.scale).toPrecision(9))
}

/** Kebalikan decodeRegisters; dipakai simulator untuk mengisi register. */
export function encodeValue(value: number, tag: TagMapping, wordOrder: 'big' | 'little'): number[] {
  const raw = value / tag.scale
  const order = (hi: number, lo: number) => (wordOrder === 'big' ? [hi, lo] : [lo, hi])
  switch (tag.type) {
    case 'uint16':
      return [clamp(Math.round(raw), 0, 0xffff)]
    case 'int16': {
      const v = clamp(Math.round(raw), -0x8000, 0x7fff)
      return [v < 0 ? v + 0x10000 : v]
    }
    case 'uint32': {
      const v = clamp(Math.round(raw), 0, 0xffffffff)
      return order(Math.floor(v / 0x10000), v % 0x10000)
    }
    case 'float32': {
      const buffer = Buffer.alloc(4)
      buffer.writeFloatBE(raw, 0)
      return order(buffer.readUInt16BE(0), buffer.readUInt16BE(2))
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function mqttOptions() {
  return {
    url: process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883',
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
  }
}

export const telemetryTopic = (stationId: string) => `pltmh/${stationId}/telemetry`
export const gatewayStatusTopic = (stationId: string) => `pltmh/${stationId}/gateway/status`

export function log(scope: string, message: string, ...rest: unknown[]) {
  console.log(`${new Date().toISOString()} [${scope}] ${message}`, ...rest)
}
