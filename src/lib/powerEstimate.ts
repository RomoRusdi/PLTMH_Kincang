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

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Bulan (1–12) menurut WIB, sama dengan yang dipakai database. */
export function currentMonthWib(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Jakarta' }).format(now))
}
