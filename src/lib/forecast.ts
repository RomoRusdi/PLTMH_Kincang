export interface PowerForecast {
  powerKw: number
  lowerKw: number
  upperKw: number
  confidence: number
  slopeKwPerHour: number
}

/**
 * Forecast ringan tanpa dependency: weighted moving average + regresi linear.
 * Data historis tetap menjadi sumber kebenaran; model ini hanya untuk indikasi operasi.
 * maxKw = kapasitas terpasang stasiun: tren naik tidak boleh memprediksi daya
 * di atas kemampuan turbin/generator.
 */
export function predictPower(
  values: readonly number[],
  horizonHours = 1,
  intervalHours = 0.25,
  maxKw?: number | null,
): PowerForecast {
  const series = values.filter((value) => Number.isFinite(value) && value >= 0).slice(-24)
  if (series.length === 0) return { powerKw: 0, lowerKw: 0, upperKw: 0, confidence: 0, slopeKwPerHour: 0 }

  const recent = series.slice(-8)
  const weightTotal = recent.reduce((sum, _, index) => sum + index + 1, 0)
  const weightedAverage = recent.reduce((sum, value, index) => sum + value * (index + 1), 0) / weightTotal
  const mean = series.reduce((sum, value) => sum + value, 0) / series.length
  const meanX = (series.length - 1) / 2
  const denominator = series.reduce((sum, _, index) => sum + (index - meanX) ** 2, 0)
  const slopePerSample = denominator === 0
    ? 0
    : series.reduce((sum, value, index) => sum + (index - meanX) * (value - mean), 0) / denominator
  const slopeKwPerHour = slopePerSample / intervalHours
  const rawForecast = weightedAverage + slopeKwPerHour * horizonHours
  const capacity = maxKw != null && maxKw > 0 ? maxKw : Number.POSITIVE_INFINITY
  const ceiling = Math.min(Math.max(...series) * 1.25 || rawForecast, capacity)
  const powerKw = Math.max(0, Math.min(rawForecast, ceiling))
  const variance = series.reduce((sum, value) => sum + (value - mean) ** 2, 0) / series.length
  const volatility = mean > 0 ? Math.sqrt(variance) / mean : 1
  const confidence = Math.round(Math.max(45, Math.min(92, 92 - volatility * 100 - (24 - series.length) * 1.5)))
  const margin = Math.max(powerKw * (1 - confidence / 100), Math.sqrt(variance) * 1.5)

  return {
    powerKw,
    lowerKw: Math.max(0, powerKw - margin),
    upperKw: Math.min(powerKw + margin, capacity),
    confidence,
    slopeKwPerHour,
  }
}

if (import.meta.env.DEV) {
  const selfCheck = predictPower([10, 12, 14])
  console.assert(selfCheck.powerKw > 14, 'predictPower harus mengikuti tren naik')
  const capped = predictPower([300, 310, 320], 1, 0.25, 320)
  console.assert(capped.powerKw <= 320 && capped.upperKw <= 320, 'predictPower tidak boleh melebihi kapasitas')
}