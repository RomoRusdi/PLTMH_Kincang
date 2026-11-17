import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { ModelMeta, PredictConfig } from './predict-core.js'

// ============================================================================
// Ubah model ONNX dari AI Engineer menjadi file SQL untuk tabel ai_models
// (database/12-prediksi-ai-cloud.sql). Model kemudian dijalankan di database
// Supabase oleh pg_cron, tanpa komputer PLTMH.
//
//   npm run model-sql -- <model.onnx> <metadata.json> <config.json> <contoh_uji.json> <keluaran.sql>
//
// Yang didukung: LSTM satu arah (ONNX, gerbang i-o-f-c, aktivasi bawaan)
// diikuti lapisan Dense (MatMul + Add, ReLU opsional). Sebelum file ditulis,
// hasil hitung dicek terhadap contoh_uji.json dari Colab; file SQL juga
// mengecek ulang di database saat dijalankan.
// ============================================================================

const [onnxArg, metaArg, configArg, sampleArg, outArg] = process.argv.slice(2)
if (!onnxArg || !metaArg || !configArg || !sampleArg || !outArg) {
  console.error('Pemakaian: npm run model-sql -- <model.onnx> <metadata.json> <config.json> <contoh_uji.json> <keluaran.sql>')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { onnx } = require('onnx-proto') as typeof import('onnx-proto')
const readJson = <T>(path: string) => JSON.parse(readFileSync(resolve(path), 'utf8').replace(/^﻿/, '')) as T

const meta = readJson<ModelMeta & { data_latih?: unknown; uji?: unknown }>(metaArg)
const config = readJson<PredictConfig>(configArg)
const sample = readJson<{ x_raw: number[][]; y_keras_kw: number[] }>(sampleArg)
const graph = onnx.ModelProto.decode(readFileSync(resolve(onnxArg))).graph
if (!graph) throw new Error('File ONNX tidak berisi graph')

const initializers = new Map((graph.initializer ?? []).map((t) => [t.name, t]))
function floats(name: string): { dims: number[]; data: number[] } {
  const t = initializers.get(name)
  if (!t) throw new Error(`Bobot ${name} tidak ditemukan di ONNX`)
  if (t.dataType !== onnx.TensorProto.DataType.FLOAT) throw new Error(`Bobot ${name} bukan float32`)
  const dims = (t.dims ?? []).map(Number)
  const count = dims.reduce((a, b) => a * b, 1)
  const raw = t.rawData && t.rawData.length ? Buffer.from(t.rawData) : null
  const data = raw ? Array.from({ length: count }, (_, i) => raw.readFloatLE(i * 4)) : Array.from(t.floatData ?? [])
  if (data.length !== count) throw new Error(`Ukuran bobot ${name} tidak sesuai`)
  return { dims, data }
}
const attr = (node: { attribute?: { name?: string | null; i?: unknown; s?: Uint8Array | null; strings?: Uint8Array[] | null }[] | null }, name: string) =>
  (node.attribute ?? []).find((a) => a.name === name)

// --- LSTM ------------------------------------------------------------------
const nodes = graph.node ?? []
const lstmIndex = nodes.findIndex((n) => n.opType === 'LSTM')
if (lstmIndex < 0 || nodes.filter((n) => n.opType === 'LSTM').length !== 1) throw new Error('Model harus berisi tepat satu node LSTM')
const lstm = nodes[lstmIndex]
const hidden = Number(attr(lstm, 'hidden_size')?.i)
const direction = attr(lstm, 'direction')?.s ? Buffer.from(attr(lstm, 'direction')!.s!).toString() : 'forward'
const activations = (attr(lstm, 'activations')?.strings ?? []).map((s) => Buffer.from(s).toString())
if (direction !== 'forward') throw new Error(`LSTM ${direction} belum didukung`)
if (activations.length && activations.join(',') !== 'Sigmoid,Tanh,Tanh') throw new Error(`Aktivasi LSTM ${activations.join(',')} belum didukung`)
if (attr(lstm, 'clip') || Number(attr(lstm, 'input_forget')?.i ?? 0) !== 0) throw new Error('LSTM dengan clip/input_forget belum didukung')
const lstmIn = lstm.input ?? []
const W = floats(lstmIn[1])
const R = floats(lstmIn[2])
const B = lstmIn[3] ? floats(lstmIn[3]) : { dims: [1, 8 * hidden], data: new Array(8 * hidden).fill(0) }
const nIn = W.dims[2]
if (W.dims.join() !== `1,${4 * hidden},${nIn}` || R.dims.join() !== `1,${4 * hidden},${hidden}` || B.data.length !== 8 * hidden) {
  throw new Error('Bentuk bobot LSTM tidak sesuai standar ONNX')
}
if (nIn !== meta.features.length) throw new Error(`LSTM menerima ${nIn} fitur, metadata ${meta.features.length}`)
const bias = Array.from({ length: 4 * hidden }, (_, g) => B.data[g] + B.data[4 * hidden + g])

// --- Dense setelah LSTM ----------------------------------------------------
interface Dense { in: number; out: number; W: number[]; B: number[]; activation: 'relu' | 'linear' }
const dense: Dense[] = []
for (const node of nodes.slice(lstmIndex + 1)) {
  if (node.opType === 'MatMul') {
    const w = floats((node.input ?? [])[1])
    dense.push({ in: w.dims[0], out: w.dims[1], W: w.data, B: new Array(w.dims[1]).fill(0), activation: 'linear' })
  } else if (node.opType === 'Add' && dense.length) {
    dense[dense.length - 1].B = floats((node.input ?? [])[1]).data
  } else if (node.opType === 'Relu' && dense.length) {
    dense[dense.length - 1].activation = 'relu'
  } else if (!['Squeeze', 'Slice', 'Unsqueeze', 'Identity'].includes(node.opType ?? '')) {
    throw new Error(`Operasi ${node.opType} setelah LSTM belum didukung`)
  }
}
if (!dense.length || dense[0].in !== hidden || dense[dense.length - 1].out < meta.horizon) throw new Error('Lapisan dense tidak cocok dengan LSTM/horizon')

// --- Hitung contoh dan bandingkan dengan Colab (rumus sama dengan SQL) ------
function forward(x: number[]): number[] {
  const sig = (z: number) => 1 / (1 + Math.exp(-z))
  let h = new Array(hidden).fill(0)
  const c = new Array(hidden).fill(0)
  for (let t = 0; t < x.length / nIn; t += 1) {
    const z = bias.map((b, g) => {
      let s = b
      for (let j = 0; j < nIn; j += 1) s += W.data[g * nIn + j] * x[t * nIn + j]
      for (let k = 0; k < hidden; k += 1) s += R.data[g * hidden + k] * h[k]
      return Math.max(-50, Math.min(50, s))
    })
    const next: number[] = []
    for (let u = 0; u < hidden; u += 1) {
      c[u] = sig(z[2 * hidden + u]) * c[u] + sig(z[u]) * Math.tanh(z[3 * hidden + u])
      next.push(sig(z[hidden + u]) * Math.tanh(c[u]))
    }
    h = next
  }
  return dense.reduce((v, layer) => Array.from({ length: layer.out }, (_, o) => {
    let s = layer.B[o]
    for (let i = 0; i < layer.in; i += 1) s += v[i] * layer.W[i * layer.out + o]
    return layer.activation === 'relu' ? Math.max(0, s) : s
  }), h)
}
const scaled = sample.x_raw.flatMap((row) => row.map((v, j) => (v - meta.x_min[j]) / (meta.x_max[j] - meta.x_min[j])))
const ours = forward(scaled).slice(0, meta.horizon).map((s) => s * (meta.y_max - meta.y_min) + meta.y_min)
const maxDiff = Math.max(...ours.map((v, i) => Math.abs(v - sample.y_keras_kw[i])))
console.log(`Hitung ulang contoh: ${ours.map((v) => v.toFixed(3)).join(', ')} kW (Colab ${sample.y_keras_kw.map((v) => v.toFixed(3)).join(', ')}), selisih maks ${maxDiff.toExponential(2)}`)
if (maxDiff > 0.01) throw new Error('Hasil tidak sama dengan Colab; file SQL tidak dibuat')

// --- Tulis SQL -------------------------------------------------------------
const num = (v: number) => Number(v.toPrecision(9)).toString()
const arr = (values: number[]) => `[${values.map(num).join(',')}]`
const sqlText = (s: string) => `'${s.replace(/'/g, "''")}'`
const features = meta.features.map((name) => {
  const map = config.features[name]
  if (!map) throw new Error(`Fitur ${name} belum dipetakan di ${configArg}`)
  return { name, tag: map.tag, source: map.source ?? 'value' }
})
const weights = `{"type":"lstm","gate_order":"iofc","hidden":${hidden},"W":${arr(W.data)},"R":${arr(R.data)},"B":${arr(bias)},` +
  `"dense":[${dense.map((d) => `{"in":${d.in},"out":${d.out},"activation":"${d.activation}","W":${arr(d.W)},"B":${arr(d.B)}}`).join(',')}]}`
const sampleX = arr(scaled)
const sampleY = arr(sample.y_keras_kw.map((v) => (v - meta.y_min) / (meta.y_max - meta.y_min)))

const sql = `-- ============================================================================
-- MODEL ${meta.model} versi ${meta.version} – stasiun ${config.station_id}
-- ============================================================================
-- Dibuat otomatis oleh \`npm run model-sql\` dari ${onnxArg.replace(/\\/g, '/')} dan metadata AI Engineer.
-- Jalankan di SQL Editor SETELAH 12-prediksi-ai-cloud.sql. Aman dijalankan ulang.
-- Versi lain dari model yang sama di stasiun ini dinonaktifkan.
-- Fitur: ${features.map((f) => `${f.name} = ${f.tag}${f.source === 'raw_value' ? ' (nilai asli radar)' : ''}`).join(', ')}
-- ============================================================================

insert into public.ai_models (station_id, model, version, target_tag, features, lookback, horizon, interval_s,
                              x_min, x_max, y_min, y_max, weights, max_gap_s, max_data_age_s, enabled, training_range, metrics)
values (
  ${sqlText(config.station_id)}, ${sqlText(meta.model)}, ${sqlText(meta.version)}, ${sqlText(config.target_tag)},
  ${sqlText(JSON.stringify(features))}::jsonb,
  ${meta.lookback}, ${meta.horizon}, ${meta.interval_s},
  array[${meta.x_min.map(num).join(', ')}]::float8[], array[${meta.x_max.map(num).join(', ')}]::float8[], ${num(meta.y_min)}, ${num(meta.y_max)},
  '${weights}'::jsonb,
  ${config.max_gap_s}, ${config.max_data_age_s}, true,
  ${meta.data_latih ? `${sqlText(JSON.stringify(meta.data_latih))}::jsonb` : 'null'},
  ${meta.uji ? `${sqlText(JSON.stringify(meta.uji))}::jsonb` : 'null'}
)
on conflict on constraint uq_ai_models_version do update set
  target_tag = excluded.target_tag, features = excluded.features, lookback = excluded.lookback,
  horizon = excluded.horizon, interval_s = excluded.interval_s, x_min = excluded.x_min, x_max = excluded.x_max,
  y_min = excluded.y_min, y_max = excluded.y_max, weights = excluded.weights, max_gap_s = excluded.max_gap_s,
  max_data_age_s = excluded.max_data_age_s, enabled = true, training_range = excluded.training_range, metrics = excluded.metrics;

-- Cek: database harus menghasilkan angka yang sama dengan Colab untuk contoh
-- uji. Bila berbeda, muncul error dan SQL Editor membatalkan seluruh file
-- (model tidak terpasang).
do $$
declare
  v_y float8[];
  v_expected float8[] := array(select jsonb_array_elements_text('${sampleY}'::jsonb)::float8);
  v_diff float8 := 0;
begin
  select public.ai_model_forward(weights, array(select jsonb_array_elements_text('${sampleX}'::jsonb)::float8), ${nIn})
  into v_y
  from public.ai_models
  where station_id = ${sqlText(config.station_id)} and model = ${sqlText(meta.model)} and version = ${sqlText(meta.version)};
  for i in 1 .. cardinality(v_expected) loop
    v_diff := greatest(v_diff, abs(v_y[i] - v_expected[i]) * (${num(meta.y_max)} - ${num(meta.y_min)}));
  end loop;
  if v_diff > 0.01 then
    raise exception 'Hasil database berbeda % kW dari Colab; model tidak dipasang', round(v_diff::numeric, 4);
  end if;
  raise notice 'Cek contoh uji lolos (selisih maks % kW)', round(v_diff::numeric, 6);
end $$;

update public.ai_models set enabled = false
where station_id = ${sqlText(config.station_id)} and model = ${sqlText(meta.model)} and version <> ${sqlText(meta.version)};

-- Jalankan sekali sekarang (berikutnya otomatis tiap 5 menit):
select public.run_ai_predictions();
`

writeFileSync(resolve(outArg), sql)
console.log(`Tertulis ${outArg} (${(sql.length / 1024).toFixed(0)} KB): ${meta.model} ${meta.version}, LSTM ${hidden} unit, dense ${dense.map((d) => `${d.in}→${d.out}${d.activation === 'relu' ? ' relu' : ''}`).join(', ')}`)
