import type { ComponentType, ReactNode } from 'react'
import { qualityLabel } from '@/components/KpiCard'
import { cn } from '@/lib/utils'

// ============================================================================
// Kartu ringkasan bersama (gaya sama dengan kartu metrik Dashboard): sudut
// membulat, label di kiri atas, ikon berwarna di kanan atas, angka besar,
// keterangan kecil, dan slot visual opsional (bar rentang, pil progres).
// Dipakai di Dashboard, Ringkasan Stasiun, Perangkat, Alarm, Trend, Laporan.
// ============================================================================

export type StatTone = 'default' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple'

const VALUE_TONE: Record<StatTone, string> = {
  default: 'text-text-primary',
  blue: 'text-accent-blue',
  green: 'text-status-good',
  yellow: 'text-accent-yellow',
  orange: 'text-accent-orange',
  red: 'text-accent-red',
  purple: 'text-accent-purple',
}
const ICON_TONE: Record<StatTone, string> = {
  default: 'bg-surface-2 text-text-secondary',
  blue: 'bg-accent-blue/10 text-accent-blue',
  green: 'bg-status-good/10 text-status-good',
  yellow: 'bg-accent-yellow/10 text-accent-yellow',
  orange: 'bg-accent-orange/10 text-accent-orange',
  red: 'bg-accent-red/10 text-accent-red',
  purple: 'bg-accent-purple/10 text-accent-purple',
}

export function StatCard({
  label,
  value,
  unit,
  caption,
  icon: Icon,
  tone = 'default',
  valueTone,
  visual,
  quality,
  dimmed,
  active,
  onClick,
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  caption?: ReactNode
  icon?: ComponentType<{ className?: string }>
  /** Warna ikon (dan angka, kecuali valueTone diisi). */
  tone?: StatTone
  valueTone?: StatTone
  /** Visual kecil di bawah angka (mis. RangeBar, ProgressPill). */
  visual?: ReactNode
  /** Kualitas data telemetry; ditampilkan sebagai titik + label kecil. */
  quality?: string | null
  /** Angka dibuat redup (mis. data lama atau belum ada data). */
  dimmed?: boolean
  /** Kartu filter: tombol dengan status aktif. */
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {Icon && (
          <span className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', ICON_TONE[tone])}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={cn('mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums', VALUE_TONE[valueTone ?? tone], dimmed && 'opacity-50')}>
        {value}{unit && <span className="ml-1 text-sm font-normal text-text-secondary">{unit}</span>}
      </p>
      {visual && <div className="mt-3">{visual}</div>}
      {caption && <p className="mt-2 text-[11px] leading-snug text-text-secondary">{caption}</p>}
      {quality !== undefined && (
        <p className="mt-auto flex items-center gap-1.5 pt-2 text-[10px] text-text-secondary">
          <span className={cn('h-1.5 w-1.5 rounded-full', quality === 'good' ? 'bg-status-good' : quality ? 'bg-status-warning' : 'bg-text-secondary/40')} />
          {quality ? qualityLabel(quality) : 'Menunggu data'}
        </p>
      )}
    </>
  )
  const base = 'flex min-w-0 flex-col rounded-2xl border bg-surface p-4 text-left shadow-sm transition-[border-color,box-shadow]'
  if (onClick) {
    return (
      <button type="button" aria-pressed={active} onClick={onClick}
        className={cn(base, 'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
          active ? 'border-accent-blue ring-1 ring-accent-blue/40' : 'border-border hover:border-accent-blue/40', className)}>
        {body}
      </button>
    )
  }
  return <article className={cn(base, 'border-border hover:shadow-md', className)}>{body}</article>
}

/**
 * Bar rentang: posisi nilai pada skala min–max dengan pita normal (lo–hi).
 * Penanda kuning/merah bila di luar pita normal.
 */
export function RangeBar({ value, min, max, lo, hi, format }: {
  value: number | null | undefined
  min: number
  max: number
  lo: number
  hi: number
  format: (v: number) => string
}) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`
  const inBand = value != null && value >= lo && value <= hi
  return (
    <div>
      <div className="relative h-2 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 rounded-full bg-status-good/25" style={{ left: pos(lo), right: `calc(100% - ${pos(hi)})` }} />
        {value != null && Number.isFinite(value) && (
          <span className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface', inBand ? 'bg-status-good' : 'bg-status-warning')}
            style={{ left: pos(value) }} />
        )}
      </div>
      <p className="mt-1.5 flex justify-between text-[10px] text-text-secondary">
        <span>{format(min)}</span><span>normal {format(lo)}–{format(hi)}</span><span>{format(max)}</span>
      </p>
    </div>
  )
}

/** Pil progres 0–100% dengan teks di dalamnya (gaya kartu "Total Energy"). */
export function ProgressPill({ pct, text, warn }: { pct: number | null; text: string; warn?: boolean }) {
  if (pct == null || !Number.isFinite(pct)) return <div className="h-9 rounded-full bg-surface-2" />
  return (
    <div className="relative h-9 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={text}>
      <div className={cn('flex h-full items-center rounded-full pl-3 transition-[width] duration-700', warn ? 'bg-status-warning' : 'bg-accent-blue')}
        style={{ width: `${Math.max(18, Math.min(100, pct))}%` }}>
        <span className="text-sm font-semibold tabular-nums text-white">{text}</span>
      </div>
    </div>
  )
}
