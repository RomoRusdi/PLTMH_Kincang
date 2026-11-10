import { createServer } from 'node:net'
import { Aedes } from 'aedes'
import { log } from './config.js'

// ============================================================================
// Broker MQTT ringan untuk pengembangan/demo (pengganti Mosquitto).
// Di lokasi produksi broker dapat diganti Mosquitto tanpa mengubah gateway
// maupun ingest; keduanya hanya membutuhkan MQTT_URL.
// ============================================================================

const port = Number(process.env.MQTT_PORT ?? 1883)
const host = process.env.MQTT_HOST ?? '0.0.0.0'
const username = process.env.MQTT_USERNAME
const password = process.env.MQTT_PASSWORD

const broker = await Aedes.createBroker({
  authenticate: (client, user, pass, done) => {
    if (!username) return done(null, true)
    const ok = user === username && pass?.toString() === password
    if (!ok) log('broker', `Login ditolak untuk client ${client.id}`)
    done(null, ok)
  },
})

broker.on('client', (client) => log('broker', `Client terhubung: ${client.id}`))
broker.on('clientDisconnect', (client) => log('broker', `Client terputus: ${client.id}`))

createServer(broker.handle).listen(port, host, () => {
  log('broker', `Broker MQTT aktif di ${host}:${port}${username ? ' (dengan autentikasi)' : ' (TANPA autentikasi)'}`)
})
