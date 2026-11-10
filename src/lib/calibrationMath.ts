import type { CalibrationParams } from './supabase'

// Rumus kalibrasi murni (tanpa Supabase/React) agar bisa diuji langsung dan
// dipakai bersama oleh halaman, laporan, dan wizard.

/** level = tinggi pasang − jarak ke air + offset (tidak negatif). */
export function calibratedLevel(params: Pick<CalibrationParams, 'install_height_m' | 'level_offset_m'>, airGap: number): number {
  return Math.max(params.install_height_m - airGap + params.level_offset_m, 0)
}

/** Luas penampang basah: (lebar dasar + kemiringan × level) × level. */
export function wettedArea(params: Pick<CalibrationParams, 'bottom_width_m' | 'side_slope' | 'section_type'>, level: number): number {
  const slope = params.section_type === 'trapezoid' ? params.side_slope : 0
  return (params.bottom_width_m + slope * level) * level
}

/** debit = koefisien × kecepatan permukaan × luas penampang. */
export function calibratedFlow(params: CalibrationParams, airGap: number, surfaceVelocity: number): number {
  const level = calibratedLevel(params, airGap)
  return params.velocity_coefficient * surfaceVelocity * wettedArea(params, level)
}

export interface ReferencePoint {
  /** Pembacaan papan duga / meteran (m). */
  refLevel: number | null
  /** Kecepatan rata-rata penampang dari current meter (m/s). */
  refVelocity: number | null
  /** Debit dari current meter (m³/s), dipakai bila kecepatan rata-rata tidak ada. */
  refFlow: number | null
  /** Jarak sensor ke air yang dibaca radar pada waktu yang sama (m). */
  radarAirGap: number | null
  /** Kecepatan permukaan yang dibaca radar pada waktu yang sama (m/s). */
  radarVelocity: number | null
}

export interface FitResult {
  levelOffset: number | null
  velocityCoefficient: number | null
  offsetSpread: number | null
  coefficientSpread: number | null
  levelPoints: number
  velocityPoints: number
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

function mean(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function spread(values: number[]) {
  return values.length < 2 ? 0 : Math.max(...values) - Math.min(...values)
}

/**
 * Hitung offset level dan koefisien kecepatan dari pengukuran acuan.
 * Offset: rata-rata (level papan duga − level radar tanpa offset).
 * Koefisien: rata-rata (kecepatan rata-rata acuan ÷ kecepatan permukaan radar);
 * bila acuan berupa debit, kecepatan rata-rata = debit ÷ luas penampang pada
 * level papan duga.
 */
export function fitCalibration(geometry: Omit<CalibrationParams, 'level_offset_m' | 'velocity_coefficient'>, points: ReferencePoint[]): FitResult {
  const offsets: number[] = []
  const coefficients: number[] = []

  for (const p of points) {
    if (finite(p.refLevel) && finite(p.radarAirGap)) {
      offsets.push(p.refLevel - (geometry.install_height_m - p.radarAirGap))
    }
    if (finite(p.radarVelocity) && p.radarVelocity > 0) {
      let meanVelocity: number | null = finite(p.refVelocity) ? p.refVelocity : null
      if (meanVelocity == null && finite(p.refFlow) && finite(p.refLevel)) {
        const area = wettedArea(geometry, p.refLevel)
        meanVelocity = area > 0 ? p.refFlow / area : null
      }
      if (meanVelocity != null) coefficients.push(meanVelocity / p.radarVelocity)
    }
  }

  return {
    levelOffset: offsets.length ? mean(offsets) : null,
    velocityCoefficient: coefficients.length ? mean(coefficients) : null,
    offsetSpread: offsets.length ? spread(offsets) : null,
    coefficientSpread: coefficients.length ? spread(coefficients) : null,
    levelPoints: offsets.length,
    velocityPoints: coefficients.length,
  }
}


// ---------------------------------------------------------------------------
// Evaluasi satu versi kalibrasi terhadap titik acuannya
// ---------------------------------------------------------------------------

export interface EvaluatedPoint {
  measuredAt: string
  refLevel: number | null
  radarAirGap: number | null
  levelBefore: number | null
  levelAfter: number | null
  levelErrorBefore: number | null
  levelErrorAfter: number | null
  /** Kecepatan rata-rata penampang acuan (dari current meter, atau debit ÷ luas). */
  refMeanVelocity: number | null
  radarSurfaceVelocity: number | null
  velocityBefore: number | null
  velocityAfter: number | null
  refFlow: number | null
  flowBefore: number | null
  flowAfter: number | null
  /** Error relatif debit (fraksi, 0,05 = 5%). */
  flowErrorBefore: number | null
  flowErrorAfter: number | null
}

export interface ErrorSummary {
  count: number
  rmse: number | null
  maxAbs: number | null
  bias: number | null
}

export interface CalibrationEvaluation {
  points: EvaluatedPoint[]
  level: { before: ErrorSummary; after: ErrorSummary }
  /** Error relatif debit (fraksi). */
  flow: { before: ErrorSummary; after: ErrorSummary }
}

export interface ReferenceRecord {
  measured_at: string
  ref_level_m: number | null
  ref_velocity_ms: number | null
  ref_flow_m3s: number | null
  radar_air_gap_m: number | null
  radar_velocity_ms: number | null
}

function summarize(errors: (number | null)[]): ErrorSummary {
  const values = errors.filter(finite)
  if (values.length === 0) return { count: 0, rmse: null, maxAbs: null, bias: null }
  return {
    count: values.length,
    rmse: Math.sqrt(mean(values.map((e) => e * e))),
    maxAbs: Math.max(...values.map(Math.abs)),
    bias: mean(values),
  }
}

/**
 * Bandingkan hasil hitungan dengan pengukuran acuan.
 * "Sebelum" memakai parameter versi sebelumnya (null bila ini versi pertama),
 * "sesudah" memakai parameter versi yang dievaluasi.
 */
export function evaluateCalibration(params: CalibrationParams, previous: CalibrationParams | null, references: ReferenceRecord[]): CalibrationEvaluation {
  const points = references.map((r): EvaluatedPoint => {
    const gap = finite(r.radar_air_gap_m) ? r.radar_air_gap_m : null
    const vSurface = finite(r.radar_velocity_ms) ? r.radar_velocity_ms : null
    const refLevel = finite(r.ref_level_m) ? r.ref_level_m : null

    const levelAfter = gap != null ? calibratedLevel(params, gap) : null
    const levelBefore = gap != null && previous ? calibratedLevel(previous, gap) : null

    // Acuan debit: langsung dari current meter, atau kecepatan rata-rata × luas
    // penampang pada level papan duga. Begitu juga sebaliknya untuk kecepatan.
    const refArea = refLevel != null ? wettedArea(params, refLevel) : null
    const refFlow = finite(r.ref_flow_m3s)
      ? r.ref_flow_m3s
      : finite(r.ref_velocity_ms) && refArea != null ? r.ref_velocity_ms * refArea : null
    const refMeanVelocity = finite(r.ref_velocity_ms)
      ? r.ref_velocity_ms
      : refFlow != null && refArea ? refFlow / refArea : null

    const velocityAfter = vSurface != null ? params.velocity_coefficient * vSurface : null
    const velocityBefore = vSurface != null && previous ? previous.velocity_coefficient * vSurface : null
    const flowAfter = gap != null && vSurface != null ? calibratedFlow(params, gap, vSurface) : null
    const flowBefore = gap != null && vSurface != null && previous ? calibratedFlow(previous, gap, vSurface) : null
    const relative = (value: number | null) => (value != null && refFlow ? (value - refFlow) / refFlow : null)

    return {
      measuredAt: r.measured_at,
      refLevel,
      radarAirGap: gap,
      levelBefore,
      levelAfter,
      levelErrorBefore: levelBefore != null && refLevel != null ? levelBefore - refLevel : null,
      levelErrorAfter: levelAfter != null && refLevel != null ? levelAfter - refLevel : null,
      refMeanVelocity,
      radarSurfaceVelocity: vSurface,
      velocityBefore,
      velocityAfter,
      refFlow,
      flowBefore,
      flowAfter,
      flowErrorBefore: relative(flowBefore),
      flowErrorAfter: relative(flowAfter),
    }
  })

  return {
    points,
    level: {
      before: summarize(points.map((p) => p.levelErrorBefore)),
      after: summarize(points.map((p) => p.levelErrorAfter)),
    },
    flow: {
      before: summarize(points.map((p) => p.flowErrorBefore)),
      after: summarize(points.map((p) => p.flowErrorAfter)),
    },
  }
}
