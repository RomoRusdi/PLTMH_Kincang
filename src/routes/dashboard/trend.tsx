import { createFileRoute } from '@tanstack/react-router'
import { useStationId } from '@/lib/station'
import { useMemo, useState } from 'react'
import { LineChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { BarChart3, RefreshCw, Download, Info } from 'lucide-react'
import { exportCsv } from '@/lib/exportCsv'
import { useDailyEnergyHistory, useTrendData } from '@/lib/monitoring'
import { PageHeader } from '@/components/PageHeader'
import { formatTimestamp } from '@/lib/utils'

export const Route = createFileRoute('/dashboard/trend')({ component: TrendPage })

const TAG_OPTIONS = [
  { value: 'HYDRO.WATER_LEVEL', label: 'Level Air', color: '#58a6ff', unit: 'm', high: 1.5, low: 0.3 },
  { value: 'HYDRO.VELOCITY', label: 'Kecepatan Aliran', color: '#3fb950', unit: 'm/s', high: 3, low: null },
  { value: 'HYDRO.FLOW_RATE', label: 'Debit', color: '#58a6ff', unit: 'm³/s', high: null, low: 0.1 },
  { value: 'POWER.ACTIVE_POWER', label: 'Daya Aktif', color: '#d29922', unit: 'kW', high: null, low: null },
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
  const { data: dailyEnergy, isLoading: isDailyLoading, isError: isDailyError, refetch: refetchDaily } = useDailyEnergyHistory(STATION_ID, periodHours >= 2160 ? 90 : Math.max(7, Math.ceil(periodHours / 24)))

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
  const dailyChartData = [...(dailyEnergy ?? [])].reverse().map((row) => ({
    day: formatTimestamp(row.day, 'dd/MM'),
    energy: row.total_energy_kwh == null ? null : Number(row.total_energy_kwh.toFixed(1)),
    power: row.avg_power_kw == null ? null : Number(row.avg_power_kw.toFixed(1)),
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
        <div className="flex items-start gap-2 rounded-card border border-accent-blue/20 bg-accent-blue/5 px-3 py-2 text-xs text-text-secondary"><Info className="w-3.5 h-3.5 text-accent-blue mt-0.5 flex-shrink-0" /><span>Grafik menampilkan rata-rata per interval beserta rentang minimum–maksimum. Interval otomatis menyesuaikan periode.</span></div>
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
        <DailyHistoryChart data={dailyChartData} periodHours={periodHours} isLoading={isDailyLoading} isError={isDailyError} />
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
          <span>Tidak ada data pada periode ini.</span>
          <span className="text-xs">Pastikan seed data sudah dijalankan dan tag sensor tersedia.</span>
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

function DailyHistoryChart({ data, periodHours, isLoading, isError }: {
  data: { day: string; energy: number | null; power: number | null }[]
  periodHours: number
  isLoading: boolean
  isError: boolean
}) {
  return (
    <div className="chart-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Riwayat produksi harian</h2>
          <p className="text-[11px] text-text-secondary mt-1">Energi bersih dan rata-rata daya per hari</p>
        </div>
        <BarChart3 className="w-4 h-4 text-accent-orange" />
      </div>
      {isLoading ? <div className="h-64 skeleton rounded" /> : isError ? (
        <div className="h-64 flex items-center justify-center text-sm text-red-300">Gagal memuat riwayat daya harian.</div>
      ) : data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-text-secondary">Belum ada riwayat daya pada periode ini.</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--text-secondary))' }} interval="preserveStartEnd" />
            <YAxis yAxisId="energy" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} />
            <YAxis yAxisId="power" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="energy" dataKey="energy" name="Energi (kWh)" fill="#d29922" radius={[2, 2, 0, 0]} />
            <Line yAxisId="power" type="monotone" dataKey="power" name="Daya rata-rata (kW)" stroke="#58a6ff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <p className="mt-2 text-[10px] text-text-secondary">Periode: {periodHours >= 2160 ? '90 hari terakhir' : `${Math.max(7, Math.ceil(periodHours / 24))} hari terakhir`}</p>
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
