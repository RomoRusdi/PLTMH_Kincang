import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as ort from 'onnxruntime-node'
import { inverseTarget, scaleWindow, type ModelMeta } from './predict-core.js'

// ============================================================================
// Cek model ONNX + metadata terhadap hasil Colab (tanpa Supabase):
//   npm run predict-check -- models/contoh_uji.json
// contoh_uji.json dibuat AI Engineer di Colab: 60 baris masukan dalam satuan
// asli (x_raw) dan 5 prediksi model Keras dalam kW (y_keras_kw).
// ============================================================================

const samplePath = resolve(process.argv[2] ?? 'models/contoh_uji.json')
const modelPath = resolve(process.env.PREDICT_MODEL ?? 'models/lstm_kincang.onnx')
const metaPath = resolve(process.env.PREDICT_META ?? 'models/lstm_kincang.json')

const meta = JSON.parse(readFileSync(metaPath, 'utf8').replace(/^﻿/, '')) as ModelMeta
const sample = JSON.parse(readFileSync(samplePath, 'utf8').replace(/^﻿/, '')) as { x_raw: number[][]; y_keras_kw: number[] }

if (sample.x_raw.length !== meta.lookback || sample.x_raw.some((row) => row.length !== meta.features.length)) {
  console.error(`x_raw harus ${meta.lookback} baris × ${meta.features.length} kolom`)
  process.exit(1)
}

const session = await ort.InferenceSession.create(modelPath)
const { data, outOfRange } = scaleWindow({ rows: sample.x_raw, baseMs: 0 }, meta)
const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, meta.lookback, meta.features.length]) })
const ours = inverseTarget(output[session.outputNames[0]].data as Float32Array, meta, null)

console.table(ours.map((kw, i) => ({
  langkah: i + 1,
  worker_kw: Number(kw.toFixed(3)),
  colab_kw: Number(sample.y_keras_kw[i].toFixed(3)),
  selisih: Number((kw - sample.y_keras_kw[i]).toFixed(4)),
})))
const maxDiff = Math.max(...ours.map((kw, i) => Math.abs(kw - sample.y_keras_kw[i])))
console.log(`Selisih maksimum ${maxDiff.toFixed(4)} kW${outOfRange.length ? ` (masukan di luar rentang latih: ${outOfRange.join(', ')})` : ''}`)
console.log(maxDiff < 0.5 ? 'COCOK: worker menghasilkan angka yang sama dengan Colab.' : 'TIDAK COCOK: cek urutan fitur, x_min/x_max, y_min/y_max, atau konversi ONNX.')
process.exit(maxDiff < 0.5 ? 0 : 1)
