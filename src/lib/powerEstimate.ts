// ============================================================================
// Rumus estimasi daya, sama dengan fungsi database estimate_power_kw_at
// (09-daya-tabel-pltmh.sql) dan tabel rencana produksi PLTMH:
//
//   daya mampu (kW)  j = 9,8 × debit × rated head × η turbin × η generator
//   produksi (kWh)   n = j × (hari − pengeringan − pemeliharaan) × 24
//
// Debit dibatasi debit desain, daya dibatasi kapasitas terpasang.
// ============================================================================

export const GRAVITY = 9.8

export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

export interface PowerParams {
  headM: number
  efficiency: number
  maxKw: number | null
  designFlowM3s: number | null
}

export function estimatePowerKw(flowM3s: number, params: PowerParams): number {
  const usedFlow = Math.min(Math.max(flowM3s, 0), params.designFlowM3s ?? Number.POSITIVE_INFINITY)
  return Math.min(GRAVITY * usedFlow * params.headM * params.efficiency, params.maxKw ?? Number.POSITIVE_INFINITY)
}

/** Efisiensi total: turbin × generator bila keduanya ada, selain itu nilai gabungan lama. */
export function totalEfficiency(turbine: number | null, generator: number | null, fallback: number): number {
  return turbine != null && generator != null ? turbine * generator : fallback
}

/**
 * Daya estimasi yang tersimpan sudah dibatasi kapasitas terpasang. Nilai yang
 * sama dengan kapasitas berarti debit melebihi kemampuan turbin
 * (Singgi: debit ≥ 3,13 m³/s → 200 kW).
 */
export function isAtCapacity(powerKw: number | null | undefined, maxKw: number | null | undefined): boolean {
  return powerKw != null && maxKw != null && maxKw > 0 && powerKw >= maxKw - 0.05
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Bulan (1–12) menurut WIB, sama dengan yang dipakai database. */
export function currentMonthWib(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Jakarta' }).format(now))
}

// ============================================================================
// Energi harian dari daya estimasi (tag HYDRO.POWER_EST)
//
// Data per jam dari get_trend_data dijumlahkan per hari WIB:
//   energi (kWh) = Σ rata-rata daya per jam × durasi data valid pada jam itu
// Gateway mengirim satu data per menit, sehingga durasi = jumlah sampel menit
// (maksimal 60 menit per jam). Jam tanpa data tidak dihitung, sehingga hari yang
// datanya tidak lengkap menghasilkan energi lebih kecil, bukan ditebak.
// ============================================================================

export const WIB_OFFSET_MS = 7 * 3600_000
export const DAY_MS = 86_400_000

export interface HourlyPowerBucket {
  bucket: string
  avg_value: number | null
  sample_count: number
}

export interface DailyEnergy {
  /** Tanggal WIB, format YYYY-MM-DD. */
  day: string
  energyKwh: number | null
  avgPowerKw: number | null
  /** Jumlah jam yang tercakup data valid (0–24). */
  dataHours: number
}

/** Awal hari WIB (dalam epoch ms) yang memuat waktu `ms`. */
export function startOfDayWib(ms: number): number {
  return Math.floor((ms + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS
}

export function dayKeyWib(ms: number): string {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Jumlahkan bucket per jam menjadi energi harian WIB.
 * Hari tanpa data tetap muncul (energi null) agar sumbu waktu grafik tidak melompat.
 */
export function aggregateDailyEnergy(buckets: HourlyPowerBucket[], fromMs: number, toMs: number, sampleMinutes = 1): DailyEnergy[] {
  const byDay = new Map<string, { energy: number; weighted: number; samples: number; hours: number }>()
  for (const b of buckets) {
    if (b.avg_value == null || !Number.isFinite(b.avg_value) || !b.sample_count) continue
    const day = dayKeyWib(Date.parse(b.bucket))
    const hours = Math.min(b.sample_count * sampleMinutes, 60) / 60
    const acc = byDay.get(day) ?? { energy: 0, weighted: 0, samples: 0, hours: 0 }
    acc.energy += b.avg_value * hours
    acc.weighted += b.avg_value * b.sample_count
    acc.samples += b.sample_count
    acc.hours += hours
    byDay.set(day, acc)
  }
  const out: DailyEnergy[] = []
  for (let t = startOfDayWib(fromMs); t <= toMs; t += DAY_MS) {
    const day = dayKeyWib(t)
    const acc = byDay.get(day)
    out.push(acc
      ? { day, energyKwh: acc.energy, avgPowerKw: acc.samples ? acc.weighted / acc.samples : null, dataHours: acc.hours }
      : { day, energyKwh: null, avgPowerKw: null, dataHours: 0 })
  }
  return out
}
