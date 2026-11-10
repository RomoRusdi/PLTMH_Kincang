import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  Activity, ArrowRight, BellRing, BrainCircuit, Check, CircuitBoard, Cpu, Gauge,
  Mail, MapPin, MessageCircle, Radar, ShieldCheck, TrendingUp, Users,
} from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { LandingNav, NAV_LINKS } from '@/components/landing/LandingNav'
import { HeroPreview } from '@/components/landing/HeroPreview'
import {
  challenges, company, deployment, features, hardware, hero, pipeline, specs,
} from '@/components/landing/content'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({ component: LandingPage })

const FEATURE_ICONS = {
  activity: Activity,
  bell: BellRing,
  shield: ShieldCheck,
  chart: TrendingUp,
  users: Users,
  brain: BrainCircuit,
} as const

const HARDWARE_ICONS = [Radar, Cpu, Gauge, CircuitBoard]

const whatsappUrl = company.contact.whatsapp ? `https://wa.me/${company.contact.whatsapp}` : null
const emailUrl = company.contact.email ? `mailto:${company.contact.email}` : null

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-text-primary">
      <LandingNav />
      <main id="beranda">
        <Hero />
        <SpecStrip />
        <Challenges />
        <Pipeline />
        <Features />
        <Hardware />
        <Deployment />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bagian halaman
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative">
      <FlowLines />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-accent-blue/25 bg-accent-blue/10 px-3 py-1 text-xs font-semibold text-accent-blue">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" />
            {hero.eyebrow}
          </p>
          <h1 className="mt-5 max-w-xl font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-text-primary sm:text-5xl lg:text-[3.1rem]">
            Pantau aliran sungai dan pembangkit Anda secara{' '}
            <span className="whitespace-nowrap bg-gradient-to-r from-cyan-500 to-accent-blue bg-clip-text text-transparent">real-time</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-text-secondary sm:text-lg">{hero.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryLink to="/dashboard">Buka Dashboard</PrimaryLink>
            <a href="#teknologi" className="inline-flex items-center rounded-full border border-border bg-surface px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:border-accent-blue/50 hover:text-accent-blue">
              Lihat cara kerja
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-secondary">
            {['Sensor non-kontak', 'Alarm otomatis', 'Akses aman berbasis peran'].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-status-good" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <HeroPreview />
      </div>
    </section>
  )
}

function SpecStrip() {
  return (
    <section aria-label="Spesifikasi utama" className="mx-auto max-w-6xl px-4 sm:px-6">
      <dl className="grid overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-2 lg:grid-cols-4">
        {specs.map((spec, index) => (
          <div key={spec.label} className={cn(
            'px-6 py-6',
            index > 0 && 'border-t border-border sm:border-t-0',
            index % 2 === 1 && 'sm:border-l',
            index >= 2 && 'sm:border-t lg:border-t-0',
            index > 0 && 'lg:border-l',
          )}>
            <dt className="text-sm text-text-secondary">{spec.label}</dt>
            <dd className="mt-1 font-display text-3xl font-bold tracking-tight text-text-primary">{spec.value}</dd>
            <dd className="mt-1 text-xs text-text-secondary">{spec.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Challenges() {
  return (
    <Section id="solusi" eyebrow="Mengapa monitoring" title="Air sungai adalah bahan bakar PLTMH" description="Perubahan aliran sungai langsung terasa pada produksi listrik. Digihidrotech membuat perubahan itu terlihat lebih awal.">
      <div className="grid gap-4 md:grid-cols-3">
        {challenges.map((item, index) => (
          <article key={item.title} className="rounded-2xl border border-border bg-surface p-6">
            <span className="font-display text-sm font-bold text-accent-blue">{String(index + 1).padStart(2, '0')}</span>
            <h3 className="mt-3 font-display text-lg font-bold text-text-primary">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{item.text}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

function Pipeline() {
  return (
    <Section id="teknologi" eyebrow="Teknologi" title="Dari sungai ke layar dalam lima langkah" description="Setiap lapisan punya satu tugas, sehingga gangguan pada satu bagian mudah dilacak dan data tidak hilang saat koneksi terputus." tinted>
      <ol className="relative grid gap-4 lg:grid-cols-5">
        <div aria-hidden="true" className="absolute left-6 right-6 top-6 hidden h-px bg-gradient-to-r from-cyan-400/0 via-accent-blue/40 to-cyan-400/0 lg:block" />
        {pipeline.map((item, index) => (
          <li key={item.step} className="relative">
            <span className="relative z-[1] flex h-12 w-12 items-center justify-center rounded-full border border-accent-blue/30 bg-surface font-display text-base font-bold text-accent-blue shadow-sm">
              {index + 1}
            </span>
            <h3 className="mt-4 font-display text-base font-bold text-text-primary">{item.step}</h3>
            <p className="mt-1.5 text-sm leading-6 text-text-secondary">{item.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Features() {
  return (
    <Section id="fitur" eyebrow="Fitur aplikasi" title="Semua yang dibutuhkan operator, di satu dashboard">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = FEATURE_ICONS[feature.icon]
          const soon = 'soon' in feature && feature.soon
          return (
            <article key={feature.title} className={cn('group rounded-2xl border bg-surface p-6 transition-colors', soon ? 'border-dashed border-accent-purple/40' : 'border-border hover:border-accent-blue/40')}>
              <div className="flex items-start justify-between gap-3">
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', soon ? 'bg-accent-purple/10 text-accent-purple' : 'bg-accent-blue/10 text-accent-blue')}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {soon && <span className="rounded-full bg-accent-purple/10 px-2.5 py-1 text-[11px] font-semibold text-accent-purple">Segera hadir</span>}
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-text-primary">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{feature.text}</p>
            </article>
          )
        })}
      </div>
    </Section>
  )
}

function Hardware() {
  return (
    <Section id="perangkat" eyebrow="Perangkat lapangan" title="Panel kontrol yang dirakit untuk kondisi lapangan" description="Komponen industri yang terpasang di lokasi pembangkit dan terhubung ke dashboard." tinted>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {hardware.map((item, index) => {
          const Icon = HARDWARE_ICONS[index] ?? Cpu
          return (
            <article key={item.name} className="flex flex-col rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-accent-blue/20 text-accent-blue">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-display text-lg font-bold text-text-primary">{item.name}</h3>
              <p className="font-mono text-xs text-text-secondary">{item.model}</p>
              <ul className="mt-4 space-y-2 text-sm text-text-secondary">
                {item.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-blue" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </Section>
  )
}

function Deployment() {
  return (
    <Section id="penerapan" eyebrow="Penerapan" title="Diterapkan langsung di lokasi pembangkit">
      <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
            <MapPin className="h-4 w-4 text-accent-blue" aria-hidden="true" />
            {deployment.site}
          </span>
          <span className="rounded-full bg-accent-yellow/15 px-2.5 py-1 text-xs font-semibold text-accent-yellow">{deployment.status}</span>
        </div>
        <ol className="mt-8 grid gap-6 md:grid-cols-4 md:gap-4">
          {deployment.steps.map((step, index) => (
            <li key={step.label} className="relative md:pr-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-blue text-sm font-bold text-white dark:text-background">{index + 1}</span>
                <h3 className="font-display text-base font-bold text-text-primary">{step.label}</h3>
                {index < deployment.steps.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-border md:block" />}
              </div>
              <p className="mt-3 text-sm leading-6 text-text-secondary">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}

function ClosingCta() {
  const contactUrl = whatsappUrl ?? emailUrl
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b2a5b] via-[#0f4c9e] to-[#0891b2] px-6 py-14 text-center text-white sm:px-12">
        <FlowLines tone="light" />
        <h2 className="relative mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Lihat kondisi pembangkit Anda sekarang
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-base leading-7 text-white/80">
          Masuk ke dashboard untuk memantau aliran sungai, alarm, dan perangkat lapangan secara real-time.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0b2a5b] transition-transform hover:-translate-y-px">
            Masuk ke Dashboard <ArrowRight className="h-4 w-4" />
          </Link>
          {contactUrl && (
            <a href={contactUrl} target={whatsappUrl ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
              Hubungi Kami
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const { email, whatsapp, address } = company.contact
  const hasContact = Boolean(email || whatsapp || address)
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo subtitle={company.tagline} />
          <p className="mt-4 max-w-sm text-sm leading-6 text-text-secondary">{company.description}</p>
        </div>
        <FooterColumn title="Jelajahi">
          {NAV_LINKS.map((link) => <a key={link.href} href={link.href} className="hover:text-text-primary">{link.label}</a>)}
        </FooterColumn>
        <FooterColumn title="Aplikasi">
          <Link to="/login" className="hover:text-text-primary">Masuk</Link>
          <Link to="/dashboard" className="hover:text-text-primary">Dashboard</Link>
        </FooterColumn>
        {hasContact && (
          <FooterColumn title="Kontak">
            {email && <a href={`mailto:${email}`} className="inline-flex items-center gap-2 hover:text-text-primary"><Mail className="h-4 w-4" />{email}</a>}
            {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-text-primary"><MessageCircle className="h-4 w-4" />WhatsApp</a>}
            {address && <span className="inline-flex gap-2"><MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />{address}</span>}
          </FooterColumn>
        )}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-text-secondary sm:px-6">
          © {new Date().getFullYear()} {company.name}. Seluruh hak cipta dilindungi.
        </p>
      </div>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Komponen bantu
// ---------------------------------------------------------------------------

function Section({ id, eyebrow, title, description, tinted, children }: {
  id: string
  eyebrow: string
  title: string
  description?: string
  tinted?: boolean
  children: ReactNode
}) {
  return (
    <section id={id} className={cn('scroll-mt-16 py-20 sm:py-24', tinted && 'bg-surface-2/50')}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">{eyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">{title}</h2>
          {description && <p className="mt-4 text-base leading-7 text-text-secondary">{description}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <div className="mt-4 flex flex-col gap-2.5 text-sm text-text-secondary">{children}</div>
    </div>
  )
}

function PrimaryLink({ to, children }: { to: '/dashboard' | '/login'; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 rounded-full bg-accent-blue px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-blue/25 transition-[transform,background-color] hover:-translate-y-px hover:bg-accent-blue/90 dark:text-background">
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  )
}

/** Garis aliran dekoratif di latar belakang; diam bila pengguna memilih reduced motion. */
function FlowLines({ tone = 'brand' }: { tone?: 'brand' | 'light' }) {
  const stroke = tone === 'light' ? '#ffffff' : '#0ea5e9'
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1200 600">
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M-50 ${380 + i * 60} C 250 ${300 + i * 60}, 450 ${470 + i * 60}, 700 ${390 + i * 60} S 1050 ${310 + i * 60}, 1250 ${400 + i * 60}`}
          fill="none"
          stroke={stroke}
          strokeOpacity={tone === 'light' ? 0.18 - i * 0.04 : 0.16 - i * 0.04}
          strokeWidth={2}
          strokeDasharray="10 14"
          className="motion-safe:animate-flow-dash"
        />
      ))}
    </svg>
  )
}
