import { createFileRoute } from '@tanstack/react-router'
import { useStationId } from '@/lib/station'
import { useMemo, useState } from 'react'
import { LineChart, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { BarChart3, RefreshCw, Download, Info } from 'lucide-react'
import { exportCsv } from '@/lib/exportCsv'
import { useDailyEstimatedEnergy, useTrendData } from '@/lib/monitoring'
import { PageHeader } from '@/components/PageHeader'
import { PowerForecastSection } from '@/components/PowerForecastPanel'
import { useAuth } from '@/lib/auth'
import { formatTimestamp } from '@/lib/utils'

export const Route = createFileRoute('/dashboard/trend')({ component: TrendPage })

// Daya memakai estimasi dari debit (HYDRO.POWER_EST), bukan energy meter
// (POWER.ACTIVE_POWER), karena energy meter belum terhubung ke sistem.
const POWER_TAG = 'HYDRO.POWER_EST'

const TAG_OPTIONS = [
  { value: 'HYDRO.WATER_LEVEL', label: 'Level Air', color: '#58a6ff', unit: 'm', high: 1.5, low: 0.3 },
  { value: 'HYDRO.VELOCITY', label: 'Kecepatan Aliran', color: '#3fb950', unit: 'm/s', high: 3, low: null },
  { value: 'HYDRO.FLOW_RATE', label: 'Debit', color: '#58a6ff', unit: 'm³/s', high: null, low: 0.1 },
  { value: POWER_TAG, label: 'Daya (estimasi dari debit)', color: '#d29922', unit: 'kW', high: null, low: null },
  { value: 'POWER.FREQUENCY', label: 'Frekuensi', color: '#a371f7', unit: 'Hz', high: 50.5, low: 49.5 },
  { value: 'PANEL.TEMPERATURE', label: 'Suhu Panel', color: '#f0883e', unit: '°C', high: 45, low: null },
] as const

type TagValue = typeof TAG_OPTIONS[number]['value']
const PERIODS = [
  { value: 1, label: '1j' }, { value: 6, label: '6j' },
  { value: 24, label: '24j' }, { value: 72, label: '3hr' },
  { value: 2160, label: '3bln' },
] as const

function TrendPage() {
  const STATION_ID = useStationId()
  const { profile } = useAuth()
  // Superadmin melihat estimasi pendapatan di Dashboard; akun stasiun di sini,
  // dengan tombol mata untuk menyembunyikan angka.
  const showForecast = profile != null && profile.role !== 'superadmin'
  const [selectedTag, setSelectedTag] = useState<TagValue>('HYDRO.WATER_LEVEL')
  const [periodHours, setPeriodHours] = useState<number>(6)
  const tagMeta = TAG_OPTIONS.find((t) => t.value === selectedTag) ?? TAG_OPTIONS[0]!
  const { fromTs, toTs } = useMemo(() => {
    const to = Date.now()
    return {
      fromTs: new Date(to - periodHours * 3600 * 1000).toISOString(),
      toTs: new Date(to).toISOString(),
    }
  }, [periodHours])
  const intervalMin = periodHours <= 6 ? 5 : periodHours <= 24 ? 15 : periodHours <= 72 ? 60 : 360
  const { data: trendData, isLoading, isError, error, refetch } = useTrendData(selectedTag, fromTs, toTs, intervalMin)
  const isPower = selectedTag === POWER_TAG
  const dailyDays = periodHours >= 2160 ? 90 : Math.max(7, Math.ceil(periodHours / 24))
  const { data: dailyEnergy, isLoading: isDailyLoading, isError: isDailyError, refetch: refetchDaily } = useDailyEstimatedEnergy(STATION_ID, dailyDays, isPower)

  const chartData = (trendData ?? []).map((p) => ({
    time: formatTimestamp(p.bucket, 'dd/MM HH:mm'),
    avg: p.avg_value != null ? Number(p.avg_value.toFixed(3)) : null,
    max: p.max_value != null ? Number(p.max_value.toFixed(3)) : null,
    min: p.min_value != null ? Number(p.min_value.toFixed(3)) : null,
    n: p.sample_count,
  }))

  const valid = (trendData ?? []).filter((p) => p.avg_value != null)
  const sampleCount = valid.reduce((sum, p) => sum + p.sample_count, 0)
  const stats = valid.length > 0 ? {
    avg: sampleCount > 0 ? valid.reduce((s, p) => s + (p.avg_value ?? 0) * p.sample_count, 0) / sampleCount : 0,
    max: Math.max(...valid.map((p) => p.max_value ?? -Infinity)),
    min: Math.min(...valid.map((p) => p.min_value ?? Infinity)),
    n: sampleCount,
  } : null
  const dailyChartData = (dailyEnergy ?? []).map((row) => ({
    day: `${row.day.slice(8, 10)}/${row.day.slice(5, 7)}`,
    energy: row.energyKwh == null ? null : Number(row.energyKwh.toFixed(1)),
    power: row.avgPowerKw == null ? null : Number(row.avgPowerKw.toFixed(1)),
    hours: Number(row.dataHours.toFixed(1)),
  }))

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Trend & History" subtitle="Analisis historis sensor"
        actions={
          <div className="flex gap-2">
            <button onClick={() => { void refetch(); void refetchDaily()
              exportCsv(
                chartData.map((r) => ({ waktu: r.time, rata2: r.avg ?? '', maks: r.max ?? '', min: r.min ?? '', sampel: r.n })),
                `trend-${selectedTag}-${new Date().toISOString().slice(0,10)}.csv`,
              )
            }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-input text-text-secondary hover:text-text-primary hover:border-accent-blue transition-colors">
              <Download className="w-3 h-3" /> CSV
            </button>
            <button onClick={() => { void refetch() }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-input text-text-secondary hover:text-text-primary hover:border-accent-blue transition-colors">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        }
      />
      <TrendControls selectedTag={selectedTag} setSelectedTag={setSelectedTag}
        periodHours={periodHours} setPeriodHours={setPeriodHours} />
      <div className="dashboard-shell flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
        {showForecast && <PowerForecastSection hideable />}
        <div className="flex items-start gap-2 rounded-card border border-accent-blue/20 bg-accent-blue/5 px-3 py-2 text-xs text-text-secondary"><Info className="w-3.5 h-3.5 text-accent-blue mt-0.5 flex-shrink-0" /><span>Grafik menampilkan rata-rata per interval beserta rentang minimum–maksimum. Interval otomatis menyesuaikan periode.{isPower && ' Daya dihitung dari debit radar dengan rumus tabel produksi PLTMH (9,8 × debit × rated head × efisiensi turbin × efisiensi generator), bukan pembacaan energy meter.'}</span></div>
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: 'Rata-rata', v: stats.avg.toFixed(2) },
              { l: 'Maksimum', v: stats.max.toFixed(2) },
              { l: 'Minimum', v: stats.min.toFixed(2) },
              { l: 'Total Sampel', v: String(stats.n) },
            ].map((s) => (
              <div key={s.l} className="scada-card scada-card-interactive p-3">
                <p className="text-[10px] text-text-secondary mb-1">{s.l}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: tagMeta.color }}>
                  {s.v} {s.l !== 'Total Sampel' && <span className="text-xs font-normal text-text-secondary">{tagMeta.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        )}
        <TrendChart chartData={chartData} tagMeta={tagMeta} periodHours={periodHours} isLoading={isLoading} isError={isError} errorMessage={error instanceof Error ? error.message : null} />
        {isPower && <DailyHistoryChart data={dailyChartData} days={dailyDays} isLoading={isDailyLoading} isError={isDailyError} />}
        {chartData.length > 0 && <TrendTable chartData={[...chartData].reverse()} />}
      </div>
    </div>
  )
}

// Sub-components

function TrendControls({ selectedTag, setSelectedTag, periodHours, setPeriodHours }: {
  selectedTag: TagValue; setSelectedTag: (v: TagValue) => void
  periodHours: number; setPeriodHours: (v: number) => void
}) {
  return (
    <div className="px-4 sm:px-6 py-3 border-b border-border bg-surface flex flex-wrap gap-3">
      <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value as TagValue)}
        className="bg-surface-2 border border-border rounded-input px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue">
        {TAG_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button key={p.value} onClick={() => setPeriodHours(p.value)}
            className={`px-3 py-1.5 text-xs rounded-input border transition-colors ${
              periodHours === p.value
                ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                : 'border-border text-text-secondary hover:border-accent-blue/50'}`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TrendChart({ chartData, tagMeta, periodHours, isLoading, isError, errorMessage }: {
  chartData: { time: string; avg: number | null; max: number | null; min: number | null }[]
  tagMeta: { label: string; color: string; unit: string; high: number | null; low: number | null }
  periodHours: number
  isLoading: boolean
  isError?: boolean
  errorMessage?: string | null
}) {
  return (
    <div className="chart-card">
      <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-blue">Sensor history</p><h2 className="mt-1 text-sm font-semibold text-text-primary">{tagMeta.label} <span className="font-normal text-text-secondary">· {periodHours >= 720 ? '3 bulan' : `${periodHours}j`} terakhir</span></h2></div><span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] text-text-secondary">{tagMeta.unit}</span></div>
      {isLoading ? <div className="h-72 skeleton rounded" /> : isError ? (
        <div className="h-72 flex flex-col items-center justify-center gap-2 text-center text-sm text-red-300">
          <span>Gagal memuat data trend.</span>
          <span className="text-xs text-text-secondary">{errorMessage ?? 'Periksa koneksi database dan RPC get_trend_data.'}</span>
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center gap-1 text-center text-text-secondary text-sm">
          <span>Belum ada data {tagMeta.label.toLowerCase()} pada periode ini.</span>
          <span className="text-xs">Stasiun ini belum mengirim data untuk parameter tersebut, atau datanya tidak valid. Coba periode yang lebih panjang atau parameter lain.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'hsl(var(--text-secondary))' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} unit={` ${tagMeta.unit}`} />
            <Tooltip contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
              labelStyle={{ color: 'hsl(var(--text-secondary))', fontSize: 11 }} itemStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--text-secondary))' }} />
            {tagMeta.high != null && <ReferenceLine y={tagMeta.high} stroke="#f85149" strokeDasharray="5 3" label={{ value: 'Batas atas', fill: '#f85149', fontSize: 9 }} />}
            {tagMeta.low != null && <ReferenceLine y={tagMeta.low} stroke="#d29922" strokeDasharray="5 3" label={{ value: 'Batas bawah', fill: '#d29922', fontSize: 9 }} />}
            <Line type="monotone" dataKey="avg" name="Rata-rata" stroke={tagMeta.color} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="max" name="Maks" stroke="#f85149" strokeWidth={1} strokeDasharray="4 2" dot={false} />
            <Line type="monotone" dataKey="min" name="Min" stroke="#3fb950" strokeWidth={1} strokeDasharray="4 2" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function DailyHistoryChart({ data, days, isLoading, isError }: {
  data: { day: string; energy: number | null; power: number | null; hours: number }[]
  days: number
  isLoading: boolean
  isError: boolean
}) {
  const hasData = data.some((d) => d.energy != null)
  const totalEnergy = data.reduce((sum, d) => sum + (d.energy ?? 0), 0)
  return (
    <div className="chart-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Produksi energi harian (estimasi)</h2>
          <p className="text-[11px] text-text-secondary mt-1">Energi dan rata-rata daya per hari (WIB), dihitung dari daya estimasi debit</p>
        </div>
        <div className="flex items-center gap-3">
          {hasData && <span className="text-xs text-text-secondary">Total {days} hari: <span className="font-semibold tabular-nums text-text-primary">{totalEnergy.toLocaleString('id-ID', { maximumFractionDigits: 0 })} kWh</span></span>}
          <BarChart3 className="w-4 h-4 text-accent-orange" />
        </div>
      </div>
      {isLoading ? <div className="h-64 skeleton rounded" /> : isError ? (
        <div className="h-64 flex items-center justify-center text-sm text-red-300">Gagal memuat produksi energi harian.</div>
      ) : !hasData ? (
        <div className="h-64 flex items-center justify-center text-sm text-text-secondary">Belum ada data daya estimasi pada periode ini.</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--text-secondary))' }} interval="preserveStartEnd" />
            <YAxis yAxisId="energy" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} unit=" kWh" width={70} />
            <YAxis yAxisId="power" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} unit=" kW" width={55} />
            <Tooltip content={<DailyTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="energy" dataKey="energy" name="Energi" fill="#d29922" radius={[2, 2, 0, 0]} />
            <Line yAxisId="power" type="monotone" dataKey="power" name="Daya rata-rata" stroke="#58a6ff" strokeWidth={2} dot={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <p className="mt-2 text-[10px] text-text-secondary">Periode: {days} hari terakhir. Hari dengan data kurang dari 24 jam (gangguan komunikasi atau hari ini yang belum selesai) menghasilkan energi lebih kecil; jumlah jam data terlihat saat kursor diarahkan ke batang. Estimasi ini bukan pengganti pembacaan energy meter.</p>
    </div>
  )
}

function DailyTooltip({ active, payload, label }: { active?: boolean; payload?: { payload?: { energy: number | null; power: number | null; hours: number } }[]; label?: string }) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const fmt = (v: number | null, unit: string) => (v == null ? '—' : `${v.toLocaleString('id-ID')} ${unit}`)
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-[11px] shadow-sm">
      <p className="mb-1 text-text-secondary">{label}</p>
      <p className="text-text-primary">Energi: <span className="font-semibold tabular-nums">{fmt(row.energy, 'kWh')}</span></p>
      <p className="text-text-primary">Daya rata-rata: <span className="font-semibold tabular-nums">{fmt(row.power, 'kW')}</span></p>
      <p className={row.hours < 23.5 ? 'text-accent-yellow' : 'text-text-secondary'}>Data tersedia: {row.hours.toLocaleString('id-ID')} dari 24 jam</p>
    </div>
  )
}

function TrendTable({ chartData }: { chartData: { time: string; avg: number | null; max: number | null; min: number | null; n: number }[] }) {
  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">Data Mentah</h3>
      </div>
      <div className="overflow-x-auto max-h-64">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 sticky top-0">
            <tr>{['Waktu','Avg','Maks','Min','N'].map((h) => (
              <th key={h} className="text-left px-4 py-2 text-text-secondary font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {chartData.map((row, i) => (
              <tr key={i} className="border-t border-border hover:bg-surface-2">
                <td className="px-4 py-2 text-text-secondary font-mono">{row.time}</td>
                <td className="px-4 py-2 text-text-primary tabular-nums">{row.avg ?? '—'}</td>
                <td className="px-4 py-2 text-accent-red tabular-nums">{row.max ?? '—'}</td>
                <td className="px-4 py-2 text-status-good tabular-nums">{row.min ?? '—'}</td>
                <td className="px-4 py-2 text-text-secondary">{row.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
