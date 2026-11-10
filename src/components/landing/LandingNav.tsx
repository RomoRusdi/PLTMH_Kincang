import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Menu, Moon, Sun, X } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

export const NAV_LINKS = [
  { href: '#solusi', label: 'Solusi' },
  { href: '#teknologi', label: 'Teknologi' },
  { href: '#fitur', label: 'Fitur' },
  { href: '#perangkat', label: 'Perangkat' },
  { href: '#penerapan', label: 'Penerapan' },
] as const

export function LandingNav() {
  const { isAuthenticated } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={cn(
      'sticky top-0 z-40 border-b transition-colors duration-200',
      scrolled || open ? 'border-border/70 bg-background/85 backdrop-blur-md' : 'border-transparent bg-transparent',
    )}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#beranda" aria-label="Digihidrotech, kembali ke atas" className="rounded-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue">
          <Logo />
        </a>

        <nav aria-label="Navigasi halaman" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="rounded-input px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
            className="rounded-input p-2 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {!isAuthenticated && (
            <Link to="/login" className="hidden rounded-input px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-2 sm:inline-flex">
              Masuk
            </Link>
          )}
          <Link
            to="/dashboard"
            className="hidden items-center gap-1.5 rounded-full bg-accent-blue px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent-blue/30 transition-[transform,background-color] hover:-translate-y-px hover:bg-accent-blue/90 dark:text-background sm:inline-flex"
          >
            {isAuthenticated ? 'Buka Dashboard' : 'Dashboard'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            className="rounded-input p-2 text-text-secondary hover:bg-surface-2 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="landing-mobile-menu" className="border-t border-border bg-background/95 px-4 pb-5 pt-2 backdrop-blur-md lg:hidden">
          <nav aria-label="Navigasi halaman (mobile)" className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-input px-2 py-3 text-sm text-text-primary hover:bg-surface-2">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {!isAuthenticated && (
              <Link to="/login" className="rounded-full border border-border px-4 py-2.5 text-center text-sm font-medium text-text-primary">Masuk</Link>
            )}
            <Link to="/dashboard" className={cn('rounded-full bg-accent-blue px-4 py-2.5 text-center text-sm font-semibold text-white dark:text-background', isAuthenticated && 'col-span-2')}>
              {isAuthenticated ? 'Buka Dashboard' : 'Dashboard'}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
