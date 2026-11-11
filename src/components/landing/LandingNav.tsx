import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Menu, Moon, Sun, X } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

export const NAV_LINKS = [
  { href: '#profil', label: 'Profil' },
  { href: '#layanan', label: 'Layanan' },
  { href: '#produk', label: 'Produk' },
  { href: '#kegiatan', label: 'Kegiatan' },
  { href: '#kontak', label: 'Kontak' },
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

  const platformLabel = isAuthenticated ? 'Buka platform' : 'Platform monitoring'

  return (
    <header className={cn(
      'sticky top-0 z-40 border-b transition-colors duration-200',
      scrolled || open
        ? 'border-[#D5DEE8] bg-[#F4F7FA]/90 backdrop-blur-md dark:border-[#1C2D44] dark:bg-[#08111F]/90'
        : 'border-transparent bg-transparent',
    )}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#beranda" aria-label="Digihydrotek, kembali ke atas" className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5]">
          <Logo className="h-8 sm:h-10" />
        </a>

        <nav aria-label="Navigasi halaman" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="rounded px-3 py-2 text-[15px] font-medium text-[#4A5D73] transition-colors hover:text-[#01448A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] dark:text-[#93A7BE] dark:hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
            className="rounded p-2 text-[#4A5D73] transition-colors hover:text-[#01448A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] dark:text-[#93A7BE] dark:hover:text-white"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {!isAuthenticated && (
            <Link to="/login" className="hidden rounded px-3 py-2 text-[15px] font-medium text-[#0B1B2E] hover:text-[#01448A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] dark:text-[#E3ECF6] dark:hover:text-white sm:inline-flex">
              Masuk
            </Link>
          )}
          <Link
            to="/dashboard"
            className="hidden items-center gap-1.5 rounded-md bg-[#01448A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#013A75] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] focus-visible:ring-offset-2 dark:bg-[#109CD5] dark:text-[#04121F] dark:hover:bg-[#2BAAE0] sm:inline-flex"
          >
            {platformLabel}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            className="rounded p-2 text-[#4A5D73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#109CD5] dark:text-[#93A7BE] lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="landing-mobile-menu" className="border-t border-[#D5DEE8] px-4 pb-5 pt-2 dark:border-[#1C2D44] lg:hidden">
          <nav aria-label="Navigasi halaman (mobile)" className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="border-b border-[#D5DEE8] py-3 text-base font-medium text-[#0B1B2E] last:border-0 dark:border-[#1C2D44] dark:text-[#E3ECF6]">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {!isAuthenticated && (
              <Link to="/login" className="rounded-md border border-[#C3CFDC] px-4 py-2.5 text-center text-sm font-semibold text-[#0B1B2E] dark:border-[#2A3E58] dark:text-[#E3ECF6]">Masuk</Link>
            )}
            <Link to="/dashboard" className={cn('rounded-md bg-[#01448A] px-4 py-2.5 text-center text-sm font-semibold text-white dark:bg-[#109CD5] dark:text-[#04121F]', isAuthenticated && 'col-span-2')}>
              {platformLabel}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
