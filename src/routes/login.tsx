import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Activity, ArrowLeft, ShieldCheck } from 'lucide-react'
import { BrandMark, Logo } from '@/components/brand/Logo'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { signIn, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      void navigate({ to: '/dashboard' })
    }
  }, [isAuthenticated, isLoading, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      void navigate({ to: '/dashboard' })
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_20%_20%,hsl(var(--accent-blue)/.16),transparent_28%),radial-gradient(circle_at_80%_80%,hsl(var(--accent-purple)/.12),transparent_30%)]" />
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface/90 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_.9fr]">
        <div className="hidden flex-col justify-between bg-accent-blue/[0.07] p-10 md:flex">
          <div><Link to="/" aria-label="Kembali ke beranda Digihidrotech" className="mb-8 inline-flex rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"><Logo /></Link><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-blue">Monitoring PLTMH</p><h2 className="mt-3 max-w-sm font-display text-3xl font-bold tracking-tight text-text-primary">Visibilitas operasi sungai dalam satu layar.</h2><p className="mt-4 max-w-sm text-sm leading-6 text-text-secondary">Pantau telemetry, alarm, perangkat, dan performa pembangkit secara real-time.</p></div>
          <div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-card border border-border bg-surface/70 p-3"><Activity className="mb-2 h-4 w-4 text-status-good" /><p className="font-medium text-text-primary">Telemetry live</p><p className="mt-1 text-text-secondary">Data terpantau</p></div><div className="rounded-card border border-border bg-surface/70 p-3"><ShieldCheck className="mb-2 h-4 w-4 text-accent-blue" /><p className="font-medium text-text-primary">Akses terkontrol</p><p className="mt-1 text-text-secondary">Role-based access</p></div></div>
        </div>
        <div className="w-full max-w-sm justify-self-center p-6 sm:p-8">
        {/* Logo / Title */}
          <div className="mb-8 text-center md:text-left">
          <Link to="/" aria-label="Kembali ke beranda Digihidrotech" className="mb-5 inline-flex md:hidden">
            <BrandMark className="h-12 w-12" />
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">Masuk ke Digihidrotech</h1>
          <p className="mt-1 text-sm text-text-secondary">Dashboard monitoring sungai PLTMH</p>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e) }}
          className="space-y-4 rounded-card border border-border bg-surface/60 p-6 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm text-text-secondary mb-1">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                'w-full px-3 py-2 bg-surface-2 border border-border rounded-input',
                'text-text-primary text-sm placeholder:text-text-secondary',
                'focus:outline-none focus:border-accent-blue transition-colors',
              )}
              placeholder="operator@perusahaan.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-text-secondary mb-1">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(
                'w-full px-3 py-2 bg-surface-2 border border-border rounded-input',
                'text-text-primary text-sm placeholder:text-text-secondary',
                'focus:outline-none focus:border-accent-blue transition-colors',
              )}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-accent-red text-sm bg-accent-red/10 border border-accent-red/30 rounded-input px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'w-full py-2.5 rounded-input text-sm font-medium transition-colors',
              'bg-accent-blue text-background',
              'hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {submitting ? 'Masuk…' : 'Masuk'}
          </button>
        </form>

        <p className="text-center text-xs text-text-secondary mt-4">
          Hubungi administrator jika lupa password.
        </p>
        <Link to="/" className="mt-6 inline-flex w-full items-center justify-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-accent-blue">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke beranda
        </Link>
      </div>
      </div>
    </div>
  )
}
