import type Modbus from 'modbus-serial'
import { describeTarget, log, readBlocks, type GatewayConfig } from './config.js'

// ============================================================================
// Koneksi dan pembacaan Modbus yang dipakai gateway dan probe. Mendukung:
// - Modbus TCP (PLC),
// - Modbus RTU lewat TCP (converter RS-485 ke Ethernet mode transparan,
//   mis. USR-TCP232-304),
// - Modbus RTU lewat COM port (kabel/adaptor USB ke RS-485).
// Hanya fungsi BACA.
// ============================================================================

type ModbusClient = InstanceType<typeof Modbus.default>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function connectModbus(client: ModbusClient, config: GatewayConfig) {
  if (client.isOpen) return
  const { host = '127.0.0.1', port = 502, unit_id, timeout_ms, protocol = 'tcp', serial } = config.plc
  if (protocol === 'rtu-serial') {
    if (!serial) throw new Error('plc.serial belum diisi')
    // Buffered: respons serial bisa datang terpotong-potong, terutama lewat USB.
    await client.connectRTUBuffered(serial.path, {
      baudRate: serial.baud_rate,
      parity: serial.parity ?? 'none',
      dataBits: serial.data_bits ?? 8,
      stopBits: serial.stop_bits ?? 1,
    })
  } else if (protocol === 'rtu-over-tcp') {
    // TelnetPort di modbus-serial = frame RTU mentah (dengan CRC) lewat TCP.
    // (connectTcpRTUBuffered justru masih memakai header Modbus TCP.)
    await client.connectTelnet(host, { port })
  } else {
    await client.connectTCP(host, { port })
  }
  client.setID(unit_id)
  client.setTimeout(timeout_ms)
  log('modbus', `Terhubung ke ${describeTarget(config)} (${protocol}, unit ${unit_id})`)
}

/** Daftar COM port yang terlihat sistem; kosong bila serialport tidak tersedia. */
export async function listSerialPorts(): Promise<{ path: string; manufacturer?: string }[]> {
  try {
    const { SerialPort } = await import('serialport')
    return await SerialPort.list()
  } catch {
    return []
  }
}

/**
 * Baca semua blok register. Hasilnya array jarang yang diindeks dengan alamat
 * register absolut, sehingga tag cukup memakai alamatnya sendiri.
 */
export async function readAllBlocks(client: ModbusClient, config: GatewayConfig): Promise<number[]> {
  const registers: number[] = []
  const delay = config.plc.inter_read_delay_ms ?? 0
  const blocks = readBlocks(config)
  for (const [index, { start, count }] of blocks.entries()) {
    if (index > 0 && delay > 0) await sleep(delay)
    const { data } = config.plc.function_code === 4
      ? await client.readInputRegisters(start, count)
      : await client.readHoldingRegisters(start, count)
    data.forEach((word, offset) => { registers[start + offset] = word })
  }
  return registers
}

/** Pesan kesalahan yang menunjuk penyebab paling mungkin di lapangan. */
export function describeModbusError(error: unknown): string {
  const err = error as { message?: string; errno?: string | number; code?: string; modbusCode?: number }
  const code = err.code ?? err.errno
  // Timeout Modbus (perangkat diam) dicek dulu karena errno-nya juga ETIMEDOUT.
  if (err.message?.includes('Timed out')) {
    return `${err.message} (perangkat tidak menjawab: cek daya radar, baud rate/parity, alamat slave, kabel A/B; coba PROBE_SCAN=1)`
  }
  if (err.message?.includes('File not found')) return `${err.message} (COM port tidak ada: cek nomor COM di Device Manager / daftar di atas)`
  if (err.message?.includes('Access denied')) return `${err.message} (COM port sedang dipakai aplikasi lain, mis. software konfigurasi radar)`
  if (code === 'ECONNREFUSED') return `${err.message} (port salah atau mode converter bukan TCP Server)`
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ETIMEDOUT') {
    return `${err.message} (IP tidak terjangkau; cek kabel dan subnet laptop/PC)`
  }
  if (err.message?.includes('CRC')) return `${err.message} (frame rusak: biasanya baud rate atau protocol tidak cocok)`
  if (err.modbusCode != null) return `${err.message} (exception ${err.modbusCode}: alamat register tidak didukung perangkat)`
  return err.message ?? String(error)
}
