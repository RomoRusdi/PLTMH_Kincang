import { SerialPort } from 'serialport'

// ============================================================================
// Uji mentah port serial (tanpa library Modbus). Mengirim permintaan Modbus
// RTU yang sama dengan script Python tim (FC04, alamat 1, 16 register) lalu
// menampilkan SEMUA byte yang diterima. Dipakai untuk membedakan:
//   - tidak ada byte sama sekali  → kabel / daya / A-B / alamat / baud
//   - ada byte tapi aneh          → baud tidak cocok atau adaptor memantulkan data
//   - ada jawaban lengkap         → radar sehat; masalah ada di program
//
//   npm.cmd run serial-test -- COM4            (bawaan: 9600, slave 128)
//   npm.cmd run serial-test -- COM4 9600 128
// ============================================================================

const [path = 'COM4', baudText = '9600', unitText = '128'] = process.argv.slice(2)
const baudRate = Number(baudText)
const unit = Number(unitText)

function crc16(bytes: number[]): number {
  let crc = 0xffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1
  }
  return crc
}

const body = [unit, 0x04, 0x00, 0x01, 0x00, 0x10]
const crc = crc16(body)
const request = Buffer.from([...body, crc & 0xff, crc >> 8])
const hex = (buffer: Buffer) => [...buffer].map((b) => b.toString(16).padStart(2, '0')).join(' ')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const ports = await SerialPort.list()
console.log('COM port terdeteksi:', ports.map((p) => `${p.path}${p.manufacturer ? ` (${p.manufacturer})` : ''}`).join(', ') || '(tidak ada)')
console.log(`Membuka ${path} ${baudRate} 8N1, slave ${unit}`)

const port = new SerialPort({ path, baudRate, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false })
await new Promise<void>((resolve, reject) => port.open((error) => (error ? reject(error) : resolve())))
  .catch((error: Error) => { console.log(`GAGAL membuka port: ${error.message}`); process.exit(1) })

let received = Buffer.alloc(0)
port.on('data', (chunk: Buffer) => { received = Buffer.concat([received, chunk]) })
await sleep(500)

let ok = 0
for (let attempt = 1; attempt <= 3; attempt += 1) {
  received = Buffer.alloc(0)
  port.write(request)
  await sleep(1500)
  console.log(`\nPercobaan ${attempt}: kirim  ${hex(request)}`)
  if (received.length === 0) {
    console.log('             terima (tidak ada byte sama sekali)')
    continue
  }
  console.log(`             terima ${hex(received)}  (${received.length} byte)`)
  // Adaptor yang memantulkan kiriman: jawaban diawali permintaan itu sendiri.
  const echo = received.subarray(0, request.length).equals(request)
  const reply = echo ? received.subarray(request.length) : received
  if (echo) console.log('             catatan: adaptor memantulkan kiriman (echo)')
  if (reply.length >= 5 && reply[0] === unit && reply[1] === 0x04) {
    const count = reply[2] ?? 0
    const words = Array.from({ length: count / 2 }, (_, i) => reply.readUInt16BE(3 + i * 2))
    console.log(`             JAWABAN RADAR: register 1..${words.length} = ${words.join(' ')}`)
    ok += 1
  } else if (reply.length > 0 && reply[0] === unit && (reply[1] ?? 0) >= 0x80) {
    console.log(`             radar menolak permintaan (exception ${reply[2]})`)
  } else if (reply.length > 0) {
    console.log('             byte tidak dikenali: kemungkinan baud rate tidak cocok')
  }
}

console.log(`\nHasil: ${ok}/3 jawaban radar valid`)
port.close(() => process.exit(0))
