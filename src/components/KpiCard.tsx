import { cn, formatValue } from '@/lib/utils'
import type { ReactNode } from 'react'

const QUALITY_LABEL: Record<string, string> = {
  good: 'Good',
  stale: 'Data lama',
  bad: 'Bad',
  comm_failure: 'Komunikasi gagal',
  uncertain: 'Uncertain',
}

export function qualityLabel(quality: string): string {
  return QUALITY_LABEL[quality] ?? quality
}

interface KpiCardProps {
  label: string
  value: number | null | undefined
  unit?: string | null
  precision?: number
  icon?: ReactNode
  trend?: 'up' | 'down' | 'stable' | null
  quality?: string | null
  loading?: boolean
  colorClass?: string
}

export function KpiCard({
  label,
  value,
  unit,
  precision = 2,
  icon,
  trend,
  quality,
  loading = false,
  colorClass = 'text-accent-blue',
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="scada-card kpi-card space-y-2">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-8 w-32 rounded" />
        <div className="skeleton h-2.5 w-16 rounded" />
      </div>
    )
  }

  const qualityDot: Record<string, string> = {
    good: 'bg-status-good',
    stale: 'bg-status-warning',
    bad: 'bg-status-bad',
    comm_failure: 'bg-status-bad',
    uncertain: 'bg-status-uncertain',
  }

  return (
    <div className="scada-card kpi-card flex min-h-[116px] flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary truncate">{label}</span>
        {icon && <span className="text-text-secondary flex-shrink-0">{icon}</span>}
      </div>

      <div className={cn('text-2xl font-bold tabular-nums leading-none', colorClass, quality && quality !== 'good' && 'opacity-50')}>
        {formatValue(value, null, precision)}
        {unit && (
          <span className="text-sm font-normal text-text-secondary ml-1">{unit}</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-0.5">
        {quality && (
          <span className="flex items-center gap-1">
            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', qualityDot[quality] ?? 'bg-status-unknown')} />
            <span className="text-[10px] text-text-secondary">{qualityLabel(quality)}</span>
          </span>
        )}
        {trend === 'up' && <span className="text-[10px] text-status-warning">▲</span>}
        {trend === 'down' && <span className="text-[10px] text-accent-blue">▼</span>}
      </div>
    </div>
  )
}
