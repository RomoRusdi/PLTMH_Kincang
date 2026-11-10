import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Ikon Digihidrotech: gelombang aliran air yang berubah menjadi titik data,
 * menggambarkan aliran sungai yang dipantau secara digital.
 */
export function BrandMark({ className }: { className?: string }) {
  // useId: beberapa logo di halaman yang sama tidak boleh berbagi id gradien.
  const gradientId = useId()
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      <path d="M7 17c3.2-3 6.4-3 9.6 0s6.4 3 9.6 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7 24.5c3.2-3 6.4-3 9.6 0s6.4 3 9.6 0" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="31" cy="14.5" r="1.9" fill="#fff" />
      <circle cx="33" cy="20.75" r="1.6" fill="#fff" fillOpacity=".85" />
      <circle cx="31" cy="27" r="1.3" fill="#fff" fillOpacity=".7" />
    </svg>
  )
}

export function Logo({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className="h-9 w-9 flex-shrink-0" />
      <span className="leading-tight">
        <span className="block font-display text-[17px] font-bold tracking-tight text-text-primary">
          Digi<span className="text-accent-blue">hidro</span>tech
        </span>
        {subtitle && <span className="block text-[11px] text-text-secondary">{subtitle}</span>}
      </span>
    </span>
  )
}
