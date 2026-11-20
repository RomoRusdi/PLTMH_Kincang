import { useId } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { RefreshCw } from 'lucide-react'

// ============================================================================
// Kartu grafik trend dashboard (level air, debit, daya): gaya seragam, area
// bergradasi, garis putus-putus opsional untuk titik estimasi "+1 jam".
// Warna memakai token tema (mis. 'accent-blue') agar ikut mode terang/gelap.
// ============================================================================

export interface TrendPoint { time: string; avg: number | null }

export function TrendChartCard({
  title,
  subtitle,
  data,
  unit,
  precision = 2,
  color,
  seriesName,
  loading,
  error,
  emptyText,
  forecast,
  height = 220,
}: {
  title: string
  subtitle: string
  data: TrendPoint[]
  unit: string
  precision?: number
  /** Nama token warna tema, mis. 'accent-blue'. */
  color: 'accent-blue' | 'accent-green' | 'accent-yellow' | 'accent-orange' | 'accent-purple'
  seriesName: string
  loading: boolean
  error: boolean
  emptyText: string
  /** Titik estimasi setelah data terakhir (digambar putus-putus ungu). */
  forecast?: { label: string; value: number }
  height?: number
}) {
  const gradientId = `trend-${useId().replace(/:/g, '')}`
  const stroke = `hsl(var(--${color}))`
  const hasData = data.some((point) => point.avg != null)

  // Garis estimasi dimulai dari titik aktual terakhir agar tersambung.
  const lastIndex = data.reduce((found, point, i) => (point.avg != null ? i : found), -1)
  const chartData = hasData && forecast
    ? [
        ...data.map((point, i) => (i === lastIndex ? { ...point, forecast: point.avg } : point)),
        { time: forecast.label, avg: null, forecast: forecast.value },
      ]
    : data

  const highest = Math.max(0, ...chartData.flatMap((p) => [p.avg, 'forecast' in p ? p.forecast : null]).filter((v): v is number => v != null && Number.isFinite(v)))
  const ticks = niceTicks(highest)
  const format = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: precision })

  return (
    <section className="chart-card" aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title} <span className="font-normal text-text-secondary">({unit})</span></h2>
          <p className="mt-0.5 text-[10px] text-text-secondary">{subtitle}</p>
        </div>
        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-text-secondary" aria-hidden="true" />}
      </div>
      {error ? (
        <div className="flex items-center justify-center text-xs text-accent-orange" style={{ height }}>Data trend tidak tersedia</div>
      ) : hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={stroke} stopOpacity={0.22} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} minTickGap={16} />
            <YAxis width={44} domain={[0, ticks[ticks.length - 1] ?? 1]} ticks={ticks} tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} tickFormatter={(v: number) => format(v)} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
              labelStyle={{ color: 'hsl(var(--text-secondary))', fontSize: 11 }}
              itemStyle={{ fontSize: 11 }}
              formatter={(value: number, name: string) => [`${format(value)} ${unit}`, name === 'forecast' ? forecast?.label === '+1j' ? 'Estimasi +1 jam' : 'Estimasi' : seriesName]}
            />
            <Area type="monotone" dataKey="avg" stroke={stroke} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4 }} connectNulls />
            {forecast && (
              <Line type="monotone" dataKey="forecast" stroke="hsl(var(--accent-purple))" strokeWidth={2} strokeDasharray="5 5"
                dot={{ r: 3, fill: 'hsl(var(--accent-purple))' }} connectNulls isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : loading ? (
        <div className="skeleton rounded" style={{ height }} />
      ) : (
        <div className="flex items-center justify-center rounded border border-dashed border-border text-xs text-text-secondary" style={{ height }}>{emptyText}</div>
      )}
    </section>
  )
}

/** 5 garis sumbu Y (0 sampai 4 × langkah bulat 1/2/2,5/5 × 10^n) di atas nilai tertinggi. */
function niceTicks(highest: number): number[] {
  const target = (highest > 0 ? highest * 1.1 : 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= target) ?? 10) * magnitude
  return [0, 1, 2, 3, 4].map((k) => Number((k * step).toPrecision(6)))
}
