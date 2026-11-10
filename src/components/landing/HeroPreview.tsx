import { BellRing, Cpu, Radar, Router } from 'lucide-react'

// Ilustrasi tampilan dashboard untuk hero. Nilainya statis dan diberi label
// "ilustrasi" agar tidak dikira data lapangan yang sedang berjalan.
const METRICS = [
  { label: 'Level Air', value: '0,842', unit: 'm' },
  { label: 'Kecepatan', value: '1,18', unit: 'm/s' },
  { label: 'Debit', value: '1,689', unit: 'm³/s' },
  { label: 'Daya Aktif', value: '45,3', unit: 'kW' },
]

const DEVICES = [
  { icon: Radar, label: 'Radar' },
  { icon: Cpu, label: 'PLC' },
  { icon: Router, label: 'Gateway' },
]

export function HeroPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-[520px]">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-cyan-400/25 via-accent-blue/15 to-transparent blur-2xl" aria-hidden="true" />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_30px_80px_-30px_rgba(15,23,42,.45)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-secondary">Stasiun</p>
            <p className="text-sm font-semibold text-text-primary">PLTMH Kincang</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-good/10 px-2.5 py-1 text-[11px] font-semibold text-status-good">
            <span className="h-1.5 w-1.5 rounded-full bg-status-good motion-safe:animate-pulse" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border">
          {METRICS.map((metric) => (
            <div key={metric.label} className="bg-surface px-5 py-4">
              <p className="text-xs text-text-secondary">{metric.label}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-text-primary">
                {metric.value}
                <span className="ml-1 text-sm font-medium text-text-secondary">{metric.unit}</span>
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-5 pb-4 pt-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-text-primary">Level air · 6 jam</span>
            <span className="text-text-secondary">batas High 1,50 m</span>
          </div>
          <svg viewBox="0 0 320 90" className="h-24 w-full" role="img" aria-label="Grafik ilustrasi level air enam jam terakhir">
            <defs>
              <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#0ea5e9" stopOpacity=".35" />
                <stop offset="1" stopColor="#0ea5e9" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" x2="320" y1="14" y2="14" stroke="#ef4444" strokeOpacity=".55" strokeDasharray="4 4" />
            <path d="M0 62 C25 58 40 50 64 52 S108 66 132 58 S176 38 204 42 S250 56 276 46 S306 34 320 36 V90 H0Z" fill="url(#hero-area)" />
            <path d="M0 62 C25 58 40 50 64 52 S108 66 132 58 S176 38 204 42 S250 56 276 46 S306 34 320 36" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="320" cy="36" r="4" fill="#0ea5e9" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/60 px-5 py-3">
          {DEVICES.map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary">
              <Icon className="h-3 w-3 text-accent-blue" aria-hidden="true" />
              {label}
              <span className="h-1.5 w-1.5 rounded-full bg-status-good" aria-label="online" />
            </span>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-10 -left-4 hidden w-[17.5rem] items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-xl sm:flex">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-yellow/15 text-accent-yellow">
          <BellRing className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary">Alarm High · Level Air</p>
          <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">Nilai 1,52 m melewati batas 1,50 m</p>
        </div>
      </div>

      <figcaption className="mt-4 text-right text-[11px] text-text-secondary sm:mt-5">Ilustrasi tampilan dashboard</figcaption>
    </figure>
  )
}
