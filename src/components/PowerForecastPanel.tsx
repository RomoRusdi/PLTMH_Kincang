import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Banknote, Eye, EyeOff, TrendingUp, Zap } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStation, useStationId } from '@/lib/station'
import { useKpiData, useLatestMeasurements, useTrendData } from '@/lib/monitoring'
import { predictPower } from '@/lib/forecast'
import { cn } from '@/lib/utils'

// ============================================================================
// Estimasi Tren Daya & Pendapatan
//
// Superadmin melihat panel ini di Dashboard. Akun stasiun (admin/operator/
// viewer) melihatnya di halaman Trend & History dengan tombol mata untuk
// menyembunyikan angka, karena estimasi pendapatan bersifat privat bagi
// pengelola PLTMH. Pilihan sembunyi disimpan per akun di browser.
// ============================================================================

const DEFAULT_TARIFF_RP_PER_KWH = Number(import.meta.env.VITE_ENERGY_TARIFF_RP_PER_KWH ?? 1500)
const MASK = '••••••'

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(Math.max(0, value))
}

/** Status sembunyi per akun; bawaan tersembunyi sampai pengguna membukanya. */
function useHiddenPreference(userId: string | undefined, enabled: boolean) {
  const key = `rfg-forecast-hidden:${userId ?? 'anon'}`
  const [hidden, setHidden] = useState(enabled)

  useEffect(() => {
    if (!enabled) { setHidden(false); return }
    try {
      setHidden(localStorage.getItem(key) !== 'false')
    } catch { setHidden(true) }
  }, [key, enabled])

  function toggle() {
    setHidden((prev) => {
      const next = !prev
      try { localStorage.setItem(key, String(next)) } catch { /* penyimpanan browser opsional */ }
      return next
    })
  }

  return { hidden: enabled && hidden, toggle }
}

export function PowerForecastPanel({
  forecast,
  currentPowerKw,
  dailyEnergyKwh,
  loading,
  hasHistory,
  estimated,
  hideable = false,
}: {
  forecast: ReturnType<typeof predictPower>
  estimated: boolean
  currentPowerKw: number | null
  dailyEnergyKwh: number | null
  loading: boolean
  hasHistory: boolean
  /** Tampilkan tombol mata untuk menyembunyikan angka. */
  hideable?: boolean
}) {
  const { profile } = useAuth()
  const { hidden, toggle } = useHiddenPreference(profile?.id, hideable)
  const [tariff, setTariff] = useState(() => Number.isFinite(DEFAULT_TARIFF_RP_PER_KWH) && DEFAULT_TARIFF_RP_PER_KWH > 0 ? DEFAULT_TARIFF_RP_PER_KWH : 1500)

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('rfg-energy-tariff'))
      if (Number.isFinite(saved) && saved > 0) setTariff(saved)
    } catch { /* penyimpanan browser opsional; pakai tarif bawaan */ }
  }, [])

  function updateTariff(value: string) {
    const next = Number(value)
    if (!Number.isFinite(next) || next <= 0 || next > 100000) return
    setTariff(next)
    try { localStorage.setItem('rfg-energy-tariff', String(next)) } catch { /* penyimpanan browser opsional */ }
  }

  // Selama daya masih estimasi dari debit, energy meter belum mengirim kWh
  // (selalu 0), jadi estimasi harian memakai daya prediksi × 24 jam.
  const recordedKwh = estimated ? null : dailyEnergyKwh
  const hourlyRevenue = forecast.powerKw * tariff
  const dailyRevenue = (recordedKwh ?? forecast.powerKw * 24) * tariff
  const currentWatts = currentPowerKw == null ? null : currentPowerKw * 1000
  const show = (text: string) => (hidden ? MASK : text)

  return (
    <section className="relative overflow-hidden rounded-card border border-accent-purple/30 bg-gradient-to-br from-accent-purple/10 via-surface to-surface p-4 shadow-[0_8px_30px_rgba(139,92,246,.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent-purple" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Estimasi Tren Daya & Pendapatan</h2>
            <span className="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] text-accent-purple">Regresi linear · 6 jam</span>
          </div>
          <p className="mt-1 text-[11px] text-text-secondary">Estimasi sederhana 1 jam ke depan dari tren daya {estimated ? 'estimasi (dihitung dari debit sungai)' : 'aktif'} 6 jam terakhir, bukan model AI. Prediksi model AI tampil terpisah di panel Prediksi Daya AI di Dashboard. Bukan pengganti meter energi atau tagihan resmi.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {!hidden && (
            <label className="flex items-center gap-2 whitespace-nowrap text-[11px] text-text-secondary">
              Tarif jual
              <span className="flex items-center rounded-input border border-border bg-surface-2 px-2 focus-within:border-accent-purple">
                <span className="mr-1">Rp</span>
                <input
                  aria-label="Tarif energi rupiah per kWh"
                  className="w-20 bg-transparent py-1 text-right text-xs text-text-primary outline-none"
                  type="number" min="1" max="100000" step="1" value={tariff}
                  onChange={(event) => updateTariff(event.target.value)}
                />
                <span className="ml-1">/kWh</span>
              </span>
            </label>
          )}
          {hideable && (
            <button
              type="button"
              onClick={toggle}
              aria-pressed={hidden}
              aria-label={hidden ? 'Tampilkan estimasi' : 'Sembunyikan estimasi'}
              title={hidden ? 'Tampilkan estimasi' : 'Sembunyikan estimasi'}
              className="flex h-8 w-8 items-center justify-center rounded-input border border-border bg-surface-2 text-text-secondary transition-colors hover:border-accent-purple hover:text-text-primary"
            >
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {loading ? <div className="mt-4 h-24 skeleton rounded-card" /> : !hasHistory ? (
        <div className="mt-4 rounded-card border border-accent-orange/30 bg-accent-orange/5 px-3 py-4 text-xs text-accent-orange">
          Histori daya belum tersedia. Prediksi akan tampil setelah data {estimated ? 'debit' : 'daya aktif'} masuk.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ForecastMetric icon={<Zap className="h-4 w-4" />} label="Estimasi 1 jam" value={show(`${forecast.powerKw.toFixed(1)} kW`)} detail={show(`${Math.round(forecast.powerKw * 1000).toLocaleString('id-ID')} W · ${forecast.confidence}% yakin`)} color="text-accent-yellow" />
          <ForecastMetric icon={<Banknote className="h-4 w-4" />} label="Potensi pendapatan / jam" value={show(formatRupiah(hourlyRevenue))} detail={show(`Rentang ${formatRupiah(forecast.lowerKw * tariff)}–${formatRupiah(forecast.upperKw * tariff)}`)} color="text-status-good" />
          <ForecastMetric icon={<Banknote className="h-4 w-4" />} label="Estimasi hari ini" value={show(formatRupiah(dailyRevenue))} detail={show(recordedKwh == null ? 'Daya prediksi × 24 jam' : `${recordedKwh.toFixed(1)} kWh tercatat`)} color="text-accent-blue" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-secondary">
        {hidden ? <span>Angka disembunyikan. Klik ikon mata untuk menampilkan.</span> : (
          <>
            <span>{estimated ? 'Daya estimasi (dari debit)' : 'Daya aktual'}: {currentWatts == null ? '—' : `${Math.round(currentWatts).toLocaleString('id-ID')} W`}</span>
            <span>Tren: {!hasHistory ? '—' : `${forecast.slopeKwPerHour >= 0 ? '+' : ''}${forecast.slopeKwPerHour.toFixed(2)} kW/jam`}</span>
          </>
        )}
      </div>
    </section>
  )
}

function ForecastMetric({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/70 p-3">
      <div className="flex items-center gap-2 text-text-secondary"><span className={color}>{icon}</span><span className="text-[11px]">{label}</span></div>
      <div className={cn('mt-2 text-xl font-bold tabular-nums', color)}>{value}</div>
      <p className="mt-1 text-[10px] text-text-secondary">{detail}</p>
    </div>
  )
}

/**
 * Panel lengkap dengan pengambilan datanya sendiri (dipakai di Trend & History).
 * Sumber daya sama dengan Dashboard: daya aktif bila energy meter mengirim data
 * bagus, selain itu daya estimasi dari debit.
 */
export function PowerForecastSection({ hideable = false }: { hideable?: boolean }) {
  const stationId = useStationId()
  const { data: latest } = useLatestMeasurements(stationId)
  const estimated = latest['POWER.ACTIVE_POWER']?.quality !== 'good' && latest['HYDRO.POWER_EST'] != null
  const powerTag = estimated ? 'HYDRO.POWER_EST' : 'POWER.ACTIVE_POWER'
  const { from, to } = useMemo(() => {
    const now = Date.now()
    return { from: new Date(now - 6 * 3600 * 1000).toISOString(), to: new Date(now).toISOString() }
  }, [])
  const { data: trend, isLoading } = useTrendData(powerTag, from, to, 15)
  const { data: kpi } = useKpiData(stationId, 24)
  const { station } = useStation()
  const forecast = useMemo(
    () => predictPower((trend ?? []).map((p) => p.avg_value ?? Number.NaN), 1, 0.25, station?.power_max_kw),
    [trend, station?.power_max_kw],
  )
  const current = latest[powerTag]

  return (
    <PowerForecastPanel
      forecast={forecast}
      estimated={estimated}
      currentPowerKw={current?.quality === 'good' ? (current.value ?? null) : null}
      dailyEnergyKwh={kpi?.daily_energy ?? null}
      loading={isLoading}
      hasHistory={(trend ?? []).some((p) => p.avg_value != null)}
      hideable={hideable}
    />
  )
}
