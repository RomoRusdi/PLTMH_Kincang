import Modbus from 'modbus-serial'
import { decodeRegisters, describeTarget, loadGatewayConfig, log, readBlocks, registerWidth } from './config.js'
import { connectModbus, describeModbusError, listSerialPorts, readAllBlocks } from './modbus.js'

// ============================================================================
// Uji baca Modbus satu kali, tanpa MQTT dan tanpa database. Dipakai saat
// percobaan lapangan untuk memastikan perangkat terbaca dan nilainya masuk
// akal sebelum gateway dijalankan.
//
//   GATEWAY_CONFIG=config/gateway-radar-usr.json npm run probe
//   PROBE_REPEAT=5 ... npm run probe     (baca 5 kali, jeda PROBE_INTERVAL_MS)
//   PROBE_SCAN=1 ... npm run probe       (cari baud rate dan alamat slave otomatis)
// ============================================================================

const config = loadGatewayConfig()
const repeat = Math.max(1, Number(process.env.PROBE_REPEAT ?? 1))
const interval = Number(process.env.PROBE_INTERVAL_MS ?? 2000)
const client = new Modbus.default()

const blocks = readBlocks(config).map(({ start, count }) => `${start}..${start + count - 1}`).join(', ')
log('probe', `Target ${describeTarget(config)} protocol=${config.plc.protocol ?? 'tcp'} unit=${config.plc.unit_id} FC0${config.plc.function_code ?? 3} blok=[${blocks}]`)

if (config.plc.protocol === 'rtu-serial') {
  const ports = await listSerialPorts()
  log('probe', ports.length
    ? `COM port terdeteksi: ${ports.map((port) => `${port.path}${port.manufacturer ? ` (${port.manufacturer})` : ''}`).join(', ')}`
    : 'Tidak ada COM port terdeteksi (cek kabel USB dan driver adaptor)')
}

if (process.env.PROBE_SCAN) await scan()

// ---------------------------------------------------------------------------
// Mode scan: coba kombinasi baud rate dan alamat slave sampai perangkat
// menjawab, lalu pakai kombinasi itu untuk pembacaan di bawah.
//   PROBE_SCAN=1                     baud 9600,4800,2400,19200,38400,115200 × unit 1
//   PROBE_BAUDS=9600,4800            daftar baud yang dicoba (serial saja)
//   PROBE_UNITS=1-10 atau 1,2,255    daftar alamat slave yang dicoba
// ---------------------------------------------------------------------------
async function scan() {
  const serial = config.plc.protocol === 'rtu-serial' ? config.plc.serial : undefined
  const bauds = serial
    ? (process.env.PROBE_BAUDS ?? '9600,4800,2400,19200,38400,115200').split(',').map(Number).filter(Boolean)
    : [0]
  const units = parseUnits(process.env.PROBE_UNITS ?? String(config.plc.unit_id))
  const { start, count } = readBlocks(config)[0]
  log('probe', `Scan ${serial ? `baud [${bauds.join(', ')}] × ` : ''}unit [${units.join(', ')}], baca register ${start} x${count}`)

  for (const baud of bauds) {
    const trial = { ...config, plc: { ...config.plc, timeout_ms: 700, ...(serial ? { serial: { ...serial, baud_rate: baud } } : {}) } }
    for (const unit of units) {
      trial.plc.unit_id = unit
      const probeClient = new Modbus.default()
      let result: string
      let found = false
      try {
        await connectModbus(probeClient, trial)
        const { data } = trial.plc.function_code === 4
          ? await probeClient.readInputRegisters(start, count)
          : await probeClient.readHoldingRegisters(start, count)
        result = `MENJAWAB, data ${data.join(' ')}`
        found = true
      } catch (error) {
        const err = error as { message?: string; modbusCode?: number }
        if (err.modbusCode != null) {
          result = `menjawab dengan exception ${err.modbusCode} (alamat benar, register ditolak)`
          found = true
        } else if (err.message?.includes('CRC')) {
          result = 'ada sinyal tapi frame rusak (baud mendekati/parity salah?)'
        } else {
          result = err.message?.includes('Timed out') ? 'diam' : describeModbusError(error)
        }
      }
      await new Promise((resolve) => probeClient.close(resolve))
      log('probe', `  ${serial ? `baud ${String(baud).padEnd(6)} ` : ''}unit ${String(unit).padEnd(3)} → ${result}`)
      if (found) {
        log('probe', `Ditemukan: ${serial ? `baud_rate ${baud}, ` : ''}unit_id ${unit}. Simpan nilai ini ke file konfigurasi.`)
        if (serial) config.plc.serial = { ...serial, baud_rate: baud }
        config.plc.unit_id = unit
        return
      }
    }
  }
  log('probe', 'Tidak ada kombinasi yang menjawab. Cek: daya radar, kabel A/B (coba ditukar), GND, dan alamat slave (PROBE_UNITS=1-247).')
  process.exit(1)
}

function parseUnits(text: string): number[] {
  const units = text.split(',').flatMap((part) => {
    const [from, to] = part.split('-').map(Number)
    return to ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [from]
  })
  return units.filter((unit) => Number.isInteger(unit) && unit >= 0 && unit <= 255)
}

let failed = 0
for (let round = 1; round <= repeat; round += 1) {
  try {
    await connectModbus(client, config)
    const registers = await readAllBlocks(client, config)
    console.log(`\nPembacaan ${round}/${repeat}`)
    console.table(config.tags.map((tag) => {
      const words = registers.slice(tag.address, tag.address + registerWidth(tag.type))
      return {
        tag: tag.tag,
        alamat: tag.address,
        register: (tag as { radar_register?: string }).radar_register ?? '',
        mentah: words.join(' '),
        nilai: decodeRegisters(registers, tag.address, tag, config.word_order),
      }
    }))
    // Semua register mentah per blok, untuk mengenali register yang belum dipetakan.
    for (const { start, count } of readBlocks(config)) {
      const words = Array.from({ length: count }, (_, i) => `${start + i}=${registers[start + i]}`)
      console.log(`Register mentah ${start}..${start + count - 1}: ${words.join("  ")}`)
    }
  } catch (error) {
    failed += 1
    log('probe', `Gagal: ${describeModbusError(error)}`)
    client.close(() => undefined)
  }
  if (round < repeat) await new Promise((resolve) => setTimeout(resolve, interval))
}

client.close(() => undefined)
process.exit(failed === repeat ? 1 : 0)
