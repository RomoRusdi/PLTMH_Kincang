# Services: Gateway, Ingest, Simulator

Jalur data dari panel PLTMH sampai ke database:

```
Radar RS-RAD-N01-3 --RS-485 Modbus RTU--> PLC --Ethernet Modbus TCP--> PC Gateway (gateway.ts)
    --MQTT QoS 1 (via ZeroTier)--> Broker Mosquitto --> ingest.ts --> Supabase (ingest_telemetry)
```

| Script | Fungsi | Dijalankan di |
|---|---|---|
| `npm run simulator` | Meniru PLC (Modbus TCP) selama perangkat belum tersedia | Laptop pengembangan |
| `npm run gateway` | Baca register PLC, kirim JSON ke MQTT, buffer saat offline | PC gateway di lokasi |
| `npm run probe` | Uji baca Modbus sekali (tanpa MQTT/database), untuk cek perangkat di lapangan | PC gateway / laptop |
| `npm run ingest` | Terima MQTT, simpan ke Supabase | Server (anggota ZeroTier) |
| `npm run broker` | Broker MQTT Node, hanya jika Mosquitto tidak terpasang | Server |

## Menjalankan di laptop (dengan simulator)

```bash
cd services
npm install
cp .env.example .env      # isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY
```

Buka tiga terminal di folder `services`:

```bash
npm run simulator   # terminal 1: ketik banjir / kering / radar-putus / plc-hang / panas / normal
npm run ingest      # terminal 2
npm run gateway     # terminal 3
```

Mosquitto di laptop sudah berjalan sebagai Windows service di port 1883, jadi
`npm run broker` tidak perlu dijalankan.

## Demo 5 stasiun

Setelah `database/demo-5-stasiun.sql` dijalankan di Supabase, jalankan juga:

```bash
npm run demo        # terminal 4: data live untuk stasiun [DEMO] Serayu, Merawu, Tulis
```

Program ini meniru tiga PC gateway sekaligus (langsung ke MQTT, tanpa Modbus).
Merawu naik ke level alarm dalam ±2 menit, Tulis mensimulasikan radar putus,
dan Pekacangan sengaja tidak dikirim agar tampil sebagai "Data terhenti".

## Percobaan radar lewat USR-TCP232-304 (tanpa PLC)

Untuk uji awal, radar bisa dibaca langsung lewat converter RS-485 ke Ethernet:

```
Radar --RS-485--> USR-TCP232-304 --Ethernet--> laptop (gateway) --MQTT--> ingest --> Supabase --> web
```

Konfigurasi siap pakai: `config/gateway-radar-usr.json` (6 tag radar, alamat
register map dari script Python tim: slave 128, FC04, alamat 1–16; tanpa heartbeat dan tanpa register status PLC). Di converter, set serial 9600 8N1.

1. **Converter** (lewat browser ke IP converter, bawaan pabrik umumnya 192.168.0.7):
   - Serial: baud rate sama dengan radar (manual radar menyebut 4800 dan 9600,
     cek di alat), 8 data bit, parity None, 1 stop bit.
   - Work mode: TCP Server. Catat Local Port (bawaan umumnya 23).
   - Laptop diberi IP statis di subnet yang sama, mis. 192.168.0.100/24.
2. **Sesuaikan** `config/gateway-radar-usr.json`: `plc.host` (IP converter),
   `plc.port` (Local Port), `plc.unit_id` (alamat slave radar; terbukti 128 = 0x80).
   - `"protocol": "rtu-over-tcp"` untuk mode transparan (bawaan converter).
   - Jika fitur Modbus TCP ↔ RTU di converter diaktifkan, pakai `"protocol": "tcp"`
     dengan port Modbus TCP converter.
3. **Uji baca dulu**, tanpa MQTT dan database:

   ```bash
   GATEWAY_CONFIG=config/gateway-radar-usr.json PROBE_REPEAT=5 npm run probe
   ```

   (PowerShell: `$env:GATEWAY_CONFIG="config/gateway-radar-usr.json"; $env:PROBE_REPEAT=5; npm run probe`)

   Tabel menampilkan nilai mentah dan nilai teknik tiap register. Pesan
   kesalahan menyebut penyebab yang paling mungkin:
   - *Timed out*: baud rate/parity, alamat slave, kabel A/B tertukar, atau protocol salah.
   - *CRC*: biasanya baud rate atau protocol tidak cocok.
   - *ECONNREFUSED*: port salah atau converter bukan TCP Server.
4. **Kirim ke web**: jalankan `npm run ingest`, lalu gateway dengan konfigurasi
   yang sama:

   ```bash
   GATEWAY_CONFIG=config/gateway-radar-usr.json npm run gateway
   ```

### Tanpa converter: kabel USB ke RS-485

Radar bisa juga dicolok langsung ke laptop lewat kabel/adaptor USB ke RS-485
(muncul sebagai COM port). Pakai `config/gateway-radar-usb.json`:

1. Colok adaptor, lihat nomornya di Device Manager → Ports (COM & LPT),
   atau jalankan probe sekali: daftar COM port yang terdeteksi ikut dicetak.
2. Isi `plc.serial.path` (mis. `"COM8"`). `baud_rate` 9600 dan
   `unit_id` 128 sudah terbukti dari script Python tim.
3. Tutup software konfigurasi radar bila sedang terbuka: satu COM port hanya
   bisa dipakai satu aplikasi.
4. Uji dan jalankan seperti di atas, dengan
   `GATEWAY_CONFIG=config/gateway-radar-usb.json`.

Kesalahan khas: *File not found* = nomor COM salah; *Access denied* = COM
dipakai aplikasi lain; *Timed out* = baud rate, alamat slave, atau kabel A/B.

Bila baud rate atau alamat slave tidak diketahui, biarkan probe mencarinya:

```powershell
$env:PROBE_SCAN="1"; npm run probe                         # baud 9600,4800,2400,19200,38400,115200, unit dari config
$env:PROBE_UNITS="1-10"; npm run probe                     # sekaligus cari alamat slave 1..10
Remove-Item Env:PROBE_SCAN, Env:PROBE_UNITS                # kembali ke mode biasa
```

Selama percobaan, PLC dan energy meter memang tidak mengirim data. Agar tag
mereka tidak memicu alarm "data stale" dan "device offline", nonaktifkan
dulu di Supabase SQL Editor, lalu aktifkan lagi setelah PLC terpasang:

```sql
update public.devices set enabled = false   -- ganti true setelah percobaan
where station_id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10'
  and device_type in ('plc', 'power_meter');
```

Bila stasiun ini sudah punya kalibrasi (menu Kalibrasi Sensor), level dan
debit di web dihitung ulang dari jarak sensor ke air dan kecepatan permukaan
memakai kalibrasi tersebut. Nilai bawaan radar tetap tersimpan di `raw_value`.

## Pemasangan di komputer PLTMH

Satu komputer di lokasi menjalankan Mosquitto, ingest, dan gateway; ingest
mengirim langsung ke Supabase lewat internet (ZeroTier belum diperlukan).

1. Pasang Node.js LTS, Git, dan Mosquitto (installer Windows dari mosquitto.org,
   otomatis menjadi Windows service di 127.0.0.1:1883).
2. `git clone` repo, lalu `cd services && npm install`.
3. Buat `services/.env` dari `.env.example` (SUPABASE_URL dan
   SUPABASE_SERVICE_ROLE_KEY). Key ini hanya ada di komputer ini.
4. Atur IP Ethernet ke subnet converter, cek dengan `npm run probe`.
5. Jalankan `scripts/jalankan-ingest.cmd` dan `scripts/jalankan-gateway.cmd`
   lewat Task Scheduler (trigger *At startup*). Keduanya menjalankan ulang
   program otomatis bila berhenti; log di `services/logs/`.
6. Matikan sleep/hibernate komputer.

Hanya satu komputer yang boleh menjalankan gateway untuk satu radar.

## Interval data

Gateway membaca PLC dan mengirim data **tiap 60 detik** (`poll_interval_ms` di
`config/gateway.json`). Pada 5 detik, satu stasiun menghasilkan ±77 MB data per
hari (±300 byte per baris termasuk indeks), terlalu besar untuk paket gratis
Supabase; pada 60 detik ±6,4 MB per hari. Data lebih tua dari 3 bulan diringkas
per jam lalu dihapus otomatis (migrasi 004).

Bila interval diubah, samakan juga:

- `devices.scan_interval_sec` di database (dipakai deteksi data stale/offline = 3 × interval),
- `LIVE_THRESHOLD_MS` di `src/lib/stationStatus.ts` (batas label "Live"),
- `DEMO_INTERVAL_MS` untuk `npm run demo`.

## Register map

`config/gateway.json` adalah satu-satunya tempat pemetaan alamat register PLC
ke tag. Simulator dan gateway membaca file yang sama. Saat PLC asli sudah
diprogram, cukup ubah `plc.host`, `plc.port`, dan `address` tiap tag sesuai
register map dari Hardware Engineer; kode tidak perlu diubah.

Nilai radar diteruskan PLC apa adanya (integer) dan dikonversi oleh gateway
lewat `scale`: level mm x 0.001 = m, kecepatan cm/s x 0.01 = m/s, debit
(m3/s x1000) x 0.001 = m3/s.

## Format payload MQTT

Topic: `pltmh/<station_id>/telemetry`, QoS 1.

```json
{
  "station_id": "5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10",
  "gateway_id": "ea2215f6-239f-4173-b998-8faa1334f67f",
  "ts": "2026-11-05T10:00:00.000Z",
  "seq": 42,
  "values": [
    { "tag": "HYDRO.WATER_LEVEL", "value": 0.842, "quality": "good" },
    { "tag": "HYDRO.VELOCITY", "value": null, "quality": "comm_failure" }
  ]
}
```

Quality yang dikirim gateway:

| Quality | Kondisi |
|---|---|
| `good` | Register terbaca normal |
| `comm_failure` | PLC tidak terjangkau, atau PLC melaporkan radar tidak merespons (tag radar saja) |
| `stale` | Heartbeat PLC tidak berubah selama `heartbeat_stale_polls` kali polling |

Status gateway dipublish ke `pltmh/<station_id>/gateway/status` (`online`/`offline`, retained, termasuk Last Will).

## Keandalan

- Gateway hanya membaca PLC (tidak pernah menulis register).
- Saat broker tidak terjangkau, payload disimpan ke `gateway-buffer.jsonl` dan dikirim ulang berurutan setelah koneksi pulih.
- Database menolak duplikat `(station, tag, timestamp)`, sehingga pengiriman ulang aman.
- Bila Supabase tidak terjangkau (internet putus), ingest mencoba 3 kali lalu menyimpan pesan ke `ingest-buffer.jsonl` dan mengirim ulang berurutan tiap 30 detik (`INGEST_RETRY_MS`) sampai berhasil, termasuk setelah ingest di-restart. Payload yang ditolak validasi database tidak diulang.
