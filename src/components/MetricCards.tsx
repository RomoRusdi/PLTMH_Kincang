import { useId, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Gauge, Thermometer } from 'lucide-react'
import { qualityLabel } from '@/components/KpiCard'
import { cn } from '@/lib/utils'

// ============================================================================
// Kartu metrik dashboard: judul + tautan ↗, angka utama, dan visual mini dari
// data asli (sparkline level 6 jam, gauge kecepatan, progres debit terhadap
// debit desain, garis daya 6 jam). Tanpa data, visual tidak digambar dan
// kartu menulis "Menunggu data" alih-alih angka hiasan.
// ============================================================================

export type Measurement = { value: number | null; quality: string; timestamp: string } | undefined

const fmt = (value: number | null | undefined, digits: number) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const isLive = (m: Measurement) => m?.quality === 'good' && m.value != null
const finite = (values: (number | null)[]) => values.filter((v): v is number => v != null && Number.isFinite(v))

// ---------------------------------------------------------------------------
// Kerangka kartu
// ---------------------------------------------------------------------------
export function MetricCard({ title, to, measurement, children, className }: {
  title: string
  to?: string
  measurement?: Measurement
  children: ReactNode
  className?: string
}) {
  const quality = measurement?.quality
  return (
    <article className={cn('relative flex min-h-[188px] min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md', className)}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        {to && (
          <Link to={to} aria-label={`Buka trend ${title}`} title="Lihat trend"
            className="-m-1 rounded-full p-1 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
      {measurement !== undefined && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-text-secondary">
          <span className={cn('h-1.5 w-1.5 rounded-full', quality === 'good' ? 'bg-status-good' : quality ? 'bg-status-warning' : 'bg-text-secondary/40')} />
          {quality ? qualityLabel(quality) : 'Menunggu data'}
        </p>
      )}
    </article>
  )
}

function BigValue({ value, unit, className }: { value: string; unit?: string; className?: string }) {
  return (
    <p className={cn('mt-3 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-text-primary', className)}>
      {value}{unit && <span className="ml-1 text-sm font-normal text-text-secondary">{unit}</span>}
    </p>
  )
}

function Waiting({ text = 'Menunggu histori data' }: { text?: string }) {
  return <div className="mt-auto flex h-14 items-center justify-center rounded-xl bg-surface-2/60 text-[10px] text-text-secondary">{text}</div>
}

// ---------------------------------------------------------------------------
// Level air: bar sparkline 6 jam, batang terakhir disorot
// ---------------------------------------------------------------------------
export function LevelCard({ measurement, history, to }: { measurement: Measurement; history: (number | null)[]; to?: string }) {
  const values = finite(history)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const span = max - min || Math.max(max * 0.1, 0.01)
  return (
    <MetricCard title="Level air" to={to} measurement={measurement}>
      <BigValue value={fmt(measurement?.value, 3)} unit="m" className={cn(!isLive(measurement) && 'opacity-50')} />
      {values.length >= 2 ? (
        <>
          <div className="mt-auto flex h-14 items-end gap-[3px] pt-3" role="img" aria-label={`Level 6 jam terakhir, ${fmt(min, 2)} sampai ${fmt(max, 2)} m`}>
            {history.map((v, i) => (
              <span key={i} className={cn('min-w-0 flex-1 rounded-full', i === history.length - 1 ? 'bg-accent-blue' : 'bg-accent-blue/20')}
                style={{ height: v == null ? '6%' : `${18 + ((v - min) / span) * 82}%` }} />
            ))}
          </div>
          <p className="mt-1.5 flex justify-between text-[10px] text-text-secondary">
            <span>Terendah {fmt(min, 2)} m</span><span>Tertinggi {fmt(max, 2)} m</span>
          </p>
        </>
      ) : <Waiting />}
    </MetricCard>
  )
}

// ---------------------------------------------------------------------------
// Kecepatan: gauge setengah lingkaran
// ---------------------------------------------------------------------------
export function VelocityCard({ measurement, to }: { measurement: Measurement; to?: string }) {
  const value = measurement?.value ?? null
  // Skala 0–2 m/s (aliran saluran pembawa), melebar bila nilainya lebih besar.
  const scaleMax = Math.max(2, Math.ceil(((value ?? 0) * 1.25) * 2) / 2)
  const pct = value == null ? 0 : Math.min(1, Math.max(0, value / scaleMax))
  const gradient = useId()
  return (
    <MetricCard title="Kecepatan aliran" to={to} measurement={measurement}>
      <div className="relative mx-auto mt-2 w-full max-w-[220px]">
        <svg viewBox="0 0 120 66" className="w-full" role="img" aria-label={`Kecepatan ${fmt(value, 2)} meter per detik dari skala ${scaleMax}`}>
          <defs>
            <linearGradient id={gradient} x1="0" x2="1">
              <stop offset="0" style={{ stopColor: 'hsl(var(--accent-blue))' }} />
              <stop offset="1" style={{ stopColor: 'hsl(var(--accent-purple))' }} />
            </linearGradient>
          </defs>
          <path d="M10 60 A50 50 0 0 1 110 60" fill="none" strokeWidth="10" strokeLinecap="round" style={{ stroke: 'hsl(var(--border))' }} />
          {value != null && (
            <path d="M10 60 A50 50 0 0 1 110 60" fill="none" strokeWidth="10" strokeLinecap="round" pathLength={100}
              strokeDasharray={`${Math.max(0.5, pct * 100)} 100`} stroke={`url(#${gradient})`} className={cn('transition-[stroke-dasharray] duration-700', !isLive(measurement) && 'opacity-50')} />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <span className={cn('text-[26px] font-semibold leading-none tabular-nums text-text-primary', !isLive(measurement) && 'opacity-50')}>{fmt(value, 2)}</span>
          <span className="ml-1 text-xs text-text-secondary">m/s</span>
        </div>
      </div>
      <p className="mt-1 flex justify-between px-1 text-[10px] text-text-secondary"><span>0</span><span>{fmt(scaleMax, 1)} m/s</span></p>
    </MetricCard>
  )
}

// ---------------------------------------------------------------------------
// Debit: pil progres terhadap debit desain
// ---------------------------------------------------------------------------
export function FlowCard({ measurement, designFlow, to }: { measurement: Measurement; designFlow: number | null; to?: string }) {
  const value = measurement?.value ?? null
  const pct = value != null && designFlow ? (value / designFlow) * 100 : null
  const over = pct != null && pct > 100
  return (
    <MetricCard title="Debit" to={to} measurement={measurement}>
      <BigValue value={fmt(value, 3)} unit="m³/s" className={cn(!isLive(measurement) && 'opacity-50')} />
      {pct != null ? (
        <div className="mt-auto pt-3">
          <div className="relative h-11 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
            aria-label={`Debit ${fmt(pct, 0)} persen dari debit desain`}>
            <div className={cn('flex h-full items-center rounded-full pl-4 transition-[width] duration-700', over ? 'bg-status-warning' : 'bg-accent-blue')}
              style={{ width: `${Math.max(16, Math.min(100, pct))}%` }}>
              <span className="text-base font-semibold tabular-nums text-white">{fmt(pct, 0)}%</span>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-text-secondary">
            {over ? 'Di atas' : 'Dari'} debit desain {fmt(designFlow, 2)} m³/s
          </p>
        </div>
      ) : <Waiting text={designFlow ? 'Menunggu data debit' : 'Debit desain belum diatur'} />}
    </MetricCard>
  )
}

// ---------------------------------------------------------------------------
// Daya: garis 6 jam dengan label nilai terkini
// ---------------------------------------------------------------------------
export function PowerCard({ title, measurement, history, maxKw, detail, note, to }: {
  title: string
  measurement: Measurement
  history: (number | null)[]
  maxKw: number | null
  detail?: string
  note?: string
  to?: string
}) {
  const gradient = useId()
  const points = history.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null && Number.isFinite(p.v))
  // Skala mengikuti rentang data (bentuk tren terlihat), minimal 5% kapasitas
  // agar naik-turun kecil tidak tampak seperti lonjakan besar.
  const values = points.map((p) => p.v)
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 1
  const pad = Math.max((hi - lo) * 0.15, (maxKw ?? hi) * 0.05, 1)
  const bottom = Math.max(0, lo - pad)
  const top = hi + pad
  const W = 100
  const H = 40
  const xy = points.map((p) => [history.length > 1 ? (p.i / (history.length - 1)) * W : W, H - 3 - ((p.v - bottom) / (top - bottom)) * (H - 6)] as const)
  const line = smoothPath(xy)
  const last = xy[xy.length - 1] ?? ([W, H] as const)
  const first = xy[0] ?? ([0, H] as const)
  const lastValue = points[points.length - 1]?.v ?? null
  return (
    <MetricCard title={title} to={to} measurement={measurement}>
      <BigValue value={fmt(measurement?.value, 1)} unit="kW" className={cn('text-accent-yellow', !isLive(measurement) && 'opacity-50')} />
      {detail && <p className="mt-1.5 text-[10px] text-text-secondary">{detail}</p>}
      {xy.length >= 2 ? (
        <div className="mt-auto pt-4">
          <div className="relative h-14">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={`Daya 6 jam terakhir, terkini ${fmt(measurement?.value, 1)} kW`}>
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'hsl(var(--accent-yellow))', stopOpacity: 0.28 }} />
                  <stop offset="1" style={{ stopColor: 'hsl(var(--accent-yellow))', stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <path d={`${line} L${last[0]} ${H} L${first[0]} ${H} Z`} fill={`url(#${gradient})`} />
              <path d={line} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ stroke: 'hsl(var(--accent-yellow))' }} />
            </svg>
            {/* Titik dan label nilai terkini, di ujung kanan garis. */}
            <span className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent-yellow"
              style={{ left: `${last[0]}%`, top: `${(last[1] / H) * 100}%` }} />
            <span title="Rata-rata 15 menit terakhir" className="absolute -translate-x-full -translate-y-[135%] whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold tabular-nums text-text-primary shadow-sm"
              style={{ left: `${last[0]}%`, top: `${(last[1] / H) * 100}%` }}>
              {fmt(lastValue, 1)} kW
            </span>
          </div>
          <p className="mt-1 flex justify-between text-[10px] text-text-secondary"><span>6 jam lalu</span><span>sekarang</span></p>
        </div>
      ) : <Waiting />}
      {note && <p className="mt-1.5 text-[10px] leading-snug text-status-warning">{note}</p>}
    </MetricCard>
  )
}

/** Kurva halus (Catmull-Rom → Bezier) melalui titik-titik. */
function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return ''
  if (points.length < 3) return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))] ?? ([0, 0] as const)
  let d = `M${at(0)[0]} ${at(0)[1]}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = at(i - 1)
    const [x1, y1] = at(i)
    const [x2, y2] = at(i + 1)
    const [x3, y3] = at(i + 2)
    d += ` C${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6} ${x2} ${y2}`
  }
  return d
}

// ---------------------------------------------------------------------------
// Kartu ikon (energi kumulatif, suhu panel)
// ---------------------------------------------------------------------------
export function IconStatCard({ title, icon, measurement, unit, digits, caption, valueClass, iconClass, to }: {
  title: string
  icon: 'energy' | 'temperature'
  measurement: Measurement
  unit: string
  digits: number
  caption: string
  valueClass?: string
  iconClass?: string
  to?: string
}) {
  const Icon = icon === 'energy' ? Gauge : Thermometer
  return (
    <MetricCard title={title} to={to} measurement={measurement}>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', iconClass ?? 'bg-accent-orange/10 text-accent-orange')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 text-right">
          <p className={cn('text-[26px] font-semibold leading-none tabular-nums text-text-primary', valueClass, !isLive(measurement) && 'opacity-50')}>
            {fmt(measurement?.value, digits)}<span className="ml-1 text-sm font-normal text-text-secondary">{unit}</span>
          </p>
          <p className="mt-1.5 truncate text-[10px] text-text-secondary">{caption}</p>
        </div>
      </div>
    </MetricCard>
  )
}
