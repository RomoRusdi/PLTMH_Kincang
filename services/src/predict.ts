import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { log } from './config.js'
import {
  buildWindow,
  inverseTarget,
  scaleWindow,
  validateMeta,
  type MeasurementRow,
  type ModelMeta,
  type PredictConfig,
} from './predict-core.js'

// ============================================================================
// Worker prediksi AI: tiap run_every_ms mengambil 60 data per menit terakhir
// dari Supabase, menjalankan model ONNX dari AI Engineer, lalu menyimpan 5
// langkah prediksi ke tabel predictions (database/11-prediksi-ai.sql).
//
// Memakai SERVICE ROLE key yang sama dengan ingest: jalankan hanya di komputer
// PLTMH yang sudah punya services/.env. Worker tidak menulis ke perangkat dan
// tidak mengubah data pengukuran.
//
//   npm run predict                       jalan terus
//   PREDICT_ONCE=1 npm run predict        sekali lalu keluar
//   PREDICT_DRY_RUN=1 npm run predict     hitung tanpa menyimpan
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di services/.env')
  process.exit(1)
}

const ONCE = process.env.PREDICT_ONCE === '1'
const DRY_RUN = process.env.PREDICT_DRY_RUN === '1'
const configPath = resolve(process.env.PREDICT_CONFIG ?? 'config/predict-kincang.json')
const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^﻿/, '')) as PredictConfig

const modelPath = resolve(config.model_file)
const metaPath = resolve(config.meta_file)
for (const [label, path] of [['model', modelPath], ['metadata', metaPath]] as const) {
  if (!existsSync(path)) {
    console.error(`File ${label} tidak ditemukan: ${path} (salin file dari AI Engineer ke folder services/models)`)
    process.exit(1)
  }
}
const meta = JSON.parse(readFileSync(metaPath, 'utf8').replace(/^﻿/, '')) as ModelMeta
validateMeta(meta, config)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Ort = typeof import('onnxruntime-node')
let ort: Ort
try {
  ort = await import('onnxruntime-node')
} catch {
  console.error('Paket onnxruntime-node belum terpasang (npm install di folder services).')
  process.exit(1)
}
const session = await ort.InferenceSession.create(modelPath)
const inputName = session.inputNames[0]
const outputName = session.outputNames[0]

const tags = meta.features.map((name) => config.features[name].tag)
const wib = (ms: number) => new Date(ms).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })

log('predict', `Model ${meta.model} versi ${meta.version} (${modelPath}), input ${inputName} [1, ${meta.lookback}, ${meta.features.length}], ${meta.horizon} langkah × ${meta.interval_s} detik`)
log('predict', `Fitur: ${meta.features.map((name) => `${name}=${config.features[name].tag}${config.features[name].source === 'raw_value' ? ' (nilai asli radar)' : ''}`).join(', ')}`)
log('predict', `Stasiun ${config.station_id}, prediksi tiap ${config.run_every_ms / 1000} detik${DRY_RUN ? ' (DRY RUN: tidak disimpan)' : ''}`)

async function stationMaxKw(): Promise<number | null> {
  const { data, error } = await supabase.from('stations').select('power_max_kw').eq('id', config.station_id).single()
  if (error) throw new Error(`baca kapasitas stasiun: ${error.message}`)
  return (data?.power_max_kw as number | null) ?? null
}

async function fetchRows(nowMs: number): Promise<MeasurementRow[]> {
  const fromMs = nowMs - (meta.lookback + 15) * meta.interval_s * 1000
  const { data, error } = await supabase
    .from('measurements')
    .select('tag_id, value, raw_value, source_timestamp')
    .eq('station_id', config.station_id)
    .in('tag_id', tags)
    .eq('quality', 'good')
    .gte('source_timestamp', new Date(fromMs).toISOString())
    .order('source_timestamp', { ascending: true })
    .limit(1000)
  if (error) throw new Error(`baca data: ${error.message}`)
  if ((data?.length ?? 0) >= 1000) log('predict', 'Peringatan: 1.000 baris (batas API); data tertua mungkin terpotong')
  return (data ?? []) as MeasurementRow[]
}

async function runOnce(): Promise<void> {
  const nowMs = Date.now()
  const rows = await fetchRows(nowMs)
  const result = buildWindow(rows, meta, config, nowMs)
  if (!result.ok) {
    log('predict', `Dilewati: ${result.reason}`)
    return
  }
  const { window } = result
  const { data, outOfRange } = scaleWindow(window, meta)
  const tensor = new ort.Tensor('float32', data, [1, meta.lookback, meta.features.length])
  const output = await session.run({ [inputName]: tensor })
  const scaled = output[outputName].data as Float32Array
  if (scaled.length < meta.horizon) throw new Error(`keluaran model hanya ${scaled.length} angka, metadata meminta ${meta.horizon}`)
  const values = inverseTarget(scaled, meta, await stationMaxKw())

  const intervalMs = meta.interval_s * 1000
  const records = values.map((value, i) => ({
    station_id: config.station_id,
    tag_id: config.target_tag,
    model: meta.model,
    model_version: meta.version,
    base_timestamp: new Date(window.baseMs).toISOString(),
    target_timestamp: new Date(window.baseMs + (i + 1) * intervalMs).toISOString(),
    horizon_step: i + 1,
    value,
    out_of_range: outOfRange.length > 0,
  }))

  const summary = `data terakhir ${wib(window.baseMs)} WIB → ${values.map((v) => v.toFixed(1)).join(', ')} kW` +
    (outOfRange.length ? ` (DI LUAR RENTANG DATA LATIH: ${outOfRange.join(', ')})` : '')
  if (DRY_RUN) {
    log('predict', `[dry run] ${summary}`)
    return
  }
  const { error } = await supabase.from('predictions').upsert(records, {
    onConflict: 'station_id,tag_id,model,model_version,base_timestamp,horizon_step',
    ignoreDuplicates: true,
  })
  if (error) throw new Error(`simpan prediksi: ${error.message}`)
  log('predict', `Tersimpan ${records.length} langkah: ${summary}`)
}

async function safeRun() {
  try {
    await runOnce()
  } catch (error) {
    log('predict', `Gagal: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (ONCE) {
  await safeRun()
  process.exit(0)
}

// Jalan pada kelipatan run_every_ms + offset (bawaan 20 detik setelah menit
// baru), memberi waktu data menit terakhir masuk ke database.
const offset = config.offset_ms ?? 20_000
function scheduleNext() {
  const now = Date.now()
  const next = Math.floor(now / config.run_every_ms) * config.run_every_ms + config.run_every_ms + offset
  setTimeout(async () => {
    await safeRun()
    scheduleNext()
  }, next - now)
}
await safeRun()
scheduleNext()
