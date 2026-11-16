import type { TagMapping } from './config.js'

// ============================================================================
// Rata-rata per jendela waktu (mis. 6 sampel 10 detik menjadi 1 nilai per menit).
//
// Hanya sampel berkualitas good yang dihitung. Bila tidak ada satu pun sampel
// good di jendela itu, nilai dikirim null dengan quality sampel terakhir
// (mis. comm_failure), sehingga gangguan tetap terlihat di web.
// ============================================================================

export type Quality = 'good' | 'bad' | 'stale' | 'comm_failure'

export interface TelemetryValue {
  tag: string
  value: number | null
  quality: Quality
}

/**
 * - mean: rata-rata (bawaan, untuk debit, level, suhu, dll.)
 * - last: nilai terakhir (untuk penghitung kumulatif dan status/kode)
 * - min / max: nilai terkecil / terbesar di jendela itu
 */
export type AggregateMode = 'mean' | 'last' | 'min' | 'max'

/** `samples[i][j]` = sampel ke-i untuk tag ke-j, urutannya sama dengan `tags`. */
export function aggregateSamples(tags: Pick<TagMapping, 'tag' | 'aggregate'>[], samples: TelemetryValue[][]): TelemetryValue[] {
  return tags.map((tag, index) => {
    const series = samples.map((sample) => sample[index]).filter((value): value is TelemetryValue => value != null)
    const good = series
      .filter((value) => value.quality === 'good' && value.value != null && Number.isFinite(value.value))
      .map((value) => value.value as number)
    if (good.length === 0) {
      const last = series.at(-1)
      return { tag: tag.tag, value: null, quality: !last || last.quality === 'good' ? 'bad' : last.quality }
    }
    const mode = tag.aggregate ?? 'mean'
    const value = mode === 'last' ? good[good.length - 1]
      : mode === 'min' ? Math.min(...good)
        : mode === 'max' ? Math.max(...good)
          : good.reduce((sum, v) => sum + v, 0) / good.length
    return { tag: tag.tag, value: Number(value.toPrecision(9)), quality: 'good' }
  })
}

/** Awal jendela (epoch ms) yang memuat waktu `ms`, rata ke kelipatan `windowMs`. */
export function windowStart(ms: number, windowMs: number): number {
  return Math.floor(ms / windowMs) * windowMs
}
