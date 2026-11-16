// ============================================================================
// Logika inti worker prediksi AI (tanpa jaringan dan tanpa ONNX), supaya bisa
// diuji terpisah. Mengikuti preprocessing AI Engineer (C400 Subbab AI):
// - 60 observasi terakhir (lookback) dengan interval tetap (interval_s),
// - urutan dengan jeda > 2 menit tidak dipakai,
// - MinMaxScaler fitur dan target dari data latih (x_min/x_max, y_min/y_max),
// - keluaran 5 langkah di-inverse transform ke kW.
// ============================================================================

/** Metadata model dari AI Engineer (file .json di samping file .onnx). */
export interface ModelMeta {
  model: string
  version: string
  features: string[]
  target: string
  lookback: number
  horizon: number
  interval_s: number
  x_min: number[]
  x_max: number[]
  y_min: number
  y_max: number
}

export interface FeatureSource {
  tag: string
  /** 'raw_value' = nilai asli radar sebelum kalibrasi web (bila ada). */
  source?: 'value' | 'raw_value'
}

export interface PredictConfig {
  station_id: string
  model_file: string
  meta_file: string
  target_tag: string
  features: Record<string, FeatureSource>
  run_every_ms: number
  offset_ms?: number
  max_gap_s: number
  max_data_age_s: number
}

export interface MeasurementRow {
  tag_id: string
  value: number | null
  raw_value: string | null
  source_timestamp: string
}

export interface InputWindow {
  /** [lookback][fitur] dalam satuan asli, urut lama → baru. */
  rows: number[][]
  /** Waktu observasi terakhir yang masuk ke model (ms). */
  baseMs: number
}

export type WindowResult = { ok: true; window: InputWindow } | { ok: false; reason: string }

export function validateMeta(meta: ModelMeta, config: PredictConfig): void {
  const n = meta.features?.length ?? 0
  if (n === 0) throw new Error('metadata model: features kosong')
  if (meta.x_min?.length !== n || meta.x_max?.length !== n) {
    throw new Error(`metadata model: x_min/x_max harus berisi ${n} angka (satu per fitur)`)
  }
  for (const key of ['lookback', 'horizon', 'interval_s', 'y_min', 'y_max'] as const) {
    if (!Number.isFinite(meta[key])) throw new Error(`metadata model: ${key} wajib berupa angka`)
  }
  if (meta.lookback < 1 || meta.horizon < 1 || meta.interval_s < 1) throw new Error('metadata model: lookback/horizon/interval_s harus ≥ 1')
  if (meta.y_max === meta.y_min) throw new Error('metadata model: y_min dan y_max tidak boleh sama')
  meta.features.forEach((name, i) => {
    if (!config.features[name]) throw new Error(`fitur model "${name}" belum dipetakan ke tag di config.features`)
    if (meta.x_max[i] === meta.x_min[i]) throw new Error(`metadata model: x_min dan x_max fitur ${name} sama`)
  })
}

function numeric(row: MeasurementRow, source: FeatureSource['source']): number | null {
  if (source === 'raw_value' && row.raw_value != null && row.raw_value !== '') {
    const raw = Number(row.raw_value)
    if (Number.isFinite(raw)) return raw
  }
  return row.value != null && Number.isFinite(row.value) ? row.value : null
}

/**
 * Susun 60 observasi terakhir. Data dikelompokkan per interval_s (rata-rata
 * bila satu interval berisi lebih dari satu data, mis. gateway 30 detik), lalu
 * hanya interval yang keempat fiturnya lengkap yang dipakai. Urutan berhenti
 * di jeda lebih dari max_gap_s, seperti aturan pembentukan sequence saat latih.
 */
export function buildWindow(
  rows: MeasurementRow[],
  meta: ModelMeta,
  config: PredictConfig,
  nowMs: number,
): WindowResult {
  const intervalMs = meta.interval_s * 1000
  const tagToFeature = new Map<string, number>()
  meta.features.forEach((name, i) => tagToFeature.set(config.features[name].tag, i))

  const buckets = new Map<number, { sums: number[]; counts: number[]; lastMs: number }>()
  for (const row of rows) {
    const featureIndex = tagToFeature.get(row.tag_id)
    if (featureIndex == null) continue
    const ms = Date.parse(row.source_timestamp)
    if (!Number.isFinite(ms)) continue
    const value = numeric(row, config.features[meta.features[featureIndex]].source)
    if (value == null) continue
    const key = Math.floor(ms / intervalMs)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { sums: meta.features.map(() => 0), counts: meta.features.map(() => 0), lastMs: ms }
      buckets.set(key, bucket)
    }
    bucket.sums[featureIndex] += value
    bucket.counts[featureIndex] += 1
    bucket.lastMs = Math.max(bucket.lastMs, ms)
  }

  const complete = [...buckets.entries()]
    .filter(([, b]) => b.counts.every((c) => c > 0))
    .sort(([a], [b]) => a - b)
  if (complete.length === 0) return { ok: false, reason: 'belum ada data lengkap untuk keempat fitur' }

  const [, last] = complete[complete.length - 1]
  const ageS = (nowMs - last.lastMs) / 1000
  if (ageS > config.max_data_age_s) {
    return { ok: false, reason: `data terakhir sudah ${Math.round(ageS)} detik (batas ${config.max_data_age_s} detik)` }
  }

  const maxStep = Math.max(1, Math.floor(config.max_gap_s / meta.interval_s))
  const picked: typeof complete = [complete[complete.length - 1]]
  for (let i = complete.length - 2; i >= 0 && picked.length < meta.lookback; i -= 1) {
    if (picked[0][0] - complete[i][0] > maxStep) break
    picked.unshift(complete[i])
  }
  if (picked.length < meta.lookback) {
    return { ok: false, reason: `baru ${picked.length} dari ${meta.lookback} data berurutan tanpa jeda > ${config.max_gap_s} detik` }
  }

  return {
    ok: true,
    window: {
      rows: picked.map(([, b]) => b.sums.map((sum, i) => sum / b.counts[i])),
      baseMs: last.lastMs,
    },
  }
}

/** Batas toleransi normalisasi sebelum masukan dianggap di luar rentang data latih. */
const RANGE_TOLERANCE = 0.05

export function scaleWindow(window: InputWindow, meta: ModelMeta): { data: Float32Array; outOfRange: string[] } {
  const n = meta.features.length
  const data = new Float32Array(window.rows.length * n)
  const outOfRange = new Set<string>()
  window.rows.forEach((row, t) => {
    row.forEach((value, i) => {
      const scaled = (value - meta.x_min[i]) / (meta.x_max[i] - meta.x_min[i])
      if (scaled < -RANGE_TOLERANCE || scaled > 1 + RANGE_TOLERANCE) outOfRange.add(meta.features[i])
      data[t * n + i] = scaled
    })
  })
  return { data, outOfRange: [...outOfRange] }
}

/** Inverse transform target lalu batasi 0..maxKw (kapasitas stasiun). */
export function inverseTarget(scaled: ArrayLike<number>, meta: ModelMeta, maxValue: number | null): number[] {
  const values: number[] = []
  for (let i = 0; i < meta.horizon; i += 1) {
    const raw = Number(scaled[i]) * (meta.y_max - meta.y_min) + meta.y_min
    if (!Number.isFinite(raw)) throw new Error(`keluaran model langkah ${i + 1} bukan angka`)
    const capped = Math.max(0, maxValue != null && maxValue > 0 ? Math.min(raw, maxValue) : raw)
    values.push(Number(capped.toPrecision(9)))
  }
  return values
}
