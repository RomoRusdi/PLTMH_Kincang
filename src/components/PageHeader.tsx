import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useOptionalStation } from '@/lib/station'
import { useBrand } from '@/lib/brand'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Label kecil di atas judul; bawaan: nama stasiun terpilih. */
  eyebrow?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  // Menandai stasiun yang sedang dilihat di setiap halaman dashboard.
  const station = useOptionalStation()?.station
  const brand = useBrand()
  return (
    <header className={cn('sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface/90 py-4 pl-14 pr-4 shadow-sm backdrop-blur-md sm:items-center sm:pr-6 lg:px-8', className)}>
      <div className="min-w-0">
        <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-blue"><span className="h-1.5 w-1.5 rounded-full bg-accent-blue shadow-[0_0_0_3px_hsl(var(--accent-blue)/0.15)]" />{eyebrow ?? station?.name ?? brand.name}</p>
        <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div>}
    </header>
  )
}
