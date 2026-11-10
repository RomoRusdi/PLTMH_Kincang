import { createFileRoute, Outlet, Link, useRouterState, Navigate } from '@tanstack/react-router'
import { StationProvider, useStation, useStationId } from '@/lib/station'
import { useAuth } from '@/lib/auth'
import { MonitoringProvider, useAlarms, useLatestMeasurements } from '@/lib/monitoring'
import { BrandMark } from '@/components/brand/Logo'
import { LIVE_THRESHOLD_MS, useNow } from '@/lib/stationStatus'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Bell, Activity, Monitor, FileText, ClipboardList,
  LogOut, ChevronRight, Wrench, Settings, MapPin, Menu, X,
  Moon, Sun, PanelLeftClose, PanelLeftOpen,
  Wifi, WifiOff, Gauge, LayoutGrid,
} from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt'

export const Route = createFileRoute('/dashboard')({
  component: AuthGuard,
})


function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary text-sm">Memuat…</div>
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" />
  // Provider realtime hanya dipasang setelah login supaya landing page publik
  // tidak membuka subscription ke database.
  return (
    <StationProvider>
      <MonitoringProvider>
        <AppLayout />
      </MonitoringProvider>
    </StationProvider>
  )
}

const NAV_GROUPS = [
  {
    label: 'Operasional',
    items: [
      { to: '/dashboard/stations', label: 'Ringkasan Stasiun', icon: LayoutGrid },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/dashboard/alarms', label: 'Alarm Aktif', icon: Bell },
      { to: '/dashboard/trend', label: 'Trend & History', icon: Activity },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/dashboard/devices', label: 'Perangkat', icon: Monitor },
      { to: '/dashboard/breakdown', label: 'Gangguan', icon: Wrench },
      { to: '/dashboard/reports', label: 'Laporan', icon: FileText },
      { to: '/dashboard/events', label: 'Audit Events', icon: ClipboardList },
      { to: '/dashboard/map', label: 'Peta Stasiun', icon: MapPin },
    ],
  },
  {
    label: 'Konfigurasi',
    items: [
      { to: '/dashboard/calibration', label: 'Kalibrasi Sensor', icon: Gauge },
      { to: '/dashboard/settings', label: 'Pengaturan', icon: Settings },
    ],
  },
] as const

const MOBILE_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/alarms', label: 'Alarm', icon: Bell },
  { to: '/dashboard/devices', label: 'Perangkat', icon: Monitor },
  { to: '/dashboard/map', label: 'Peta', icon: MapPin },
] as const

/** Pilih lokasi pemasangan radar yang sedang dipantau; semua halaman mengikuti pilihan ini. */
function StationSelect({ collapsed }: { collapsed: boolean }) {
  const { stations, stationId, station, setStationId } = useStation()
  if (stations.length === 0) return null
  if (collapsed) {
    return (
      <div className="mx-2 mt-3 hidden justify-center lg:flex" title={station?.name ?? 'Stasiun'}>
        <MapPin className="h-4 w-4 text-accent-blue" aria-label={`Stasiun: ${station?.name ?? '-'}`} />
      </div>
    )
  }
  return (
    <label className="mx-3 mt-3 block">
      <span className="mb-1 block px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary/70">Stasiun</span>
      <select
        value={stationId}
        onChange={(event) => setStationId(event.target.value)}
        disabled={stations.length < 2}
        aria-label="Pilih stasiun yang dipantau"
        className="scada-input w-full text-sm font-medium disabled:cursor-default disabled:opacity-100"
      >
        {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  )
}

function AppLayout() {
  const STATION_ID = useStationId()
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { count: alarmCount, hasCritical } = useAlarms(STATION_ID, { notify: true })
  const { isConnected, lastUpdate } = useLatestMeasurements(STATION_ID)
  const now = useNow()
  // "Live" berarti data stasiun benar-benar masih masuk, bukan sekadar
  // koneksi realtime browser ke Supabase tersambung.
  const telemetry = !isConnected
    ? { ok: false, label: 'Realtime terputus' }
    : !lastUpdate
      ? { ok: false, label: 'Menunggu data' }
      : now - lastUpdate.getTime() > LIVE_THRESHOLD_MS
        ? { ok: false, label: 'Data terhenti' }
        : { ok: true, label: 'Telemetry live' }
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => { setMobileNavOpen(false) }, [pathname])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileNavOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])
  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem('rfg-sidebar-collapsed') === 'true') } catch { /* browser storage may be blocked */ }
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed
      try { localStorage.setItem('rfg-sidebar-collapsed', String(next)) } catch { /* keep the preference for this session */ }
      return next
    })
  }

  // relative: elemen absolute (mis. label sr-only) terkurung di layout ini dan
  // tidak memanjangkan dokumen; tanpa ini scrollIntoView ikut menggeser seluruh halaman.
  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      {mobileNavOpen && <button type="button" aria-label="Tutup navigasi" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-[2px] lg:hidden" />}
      {/* Sidebar */}
      <aside id="app-sidebar" aria-label="Sidebar aplikasi" className={cn('sidebar-surface fixed inset-y-0 left-0 z-40 flex w-[min(19rem,calc(100vw-2rem))] flex-shrink-0 -translate-x-full flex-col border-r border-border shadow-2xl transition-[width,transform] duration-200 lg:static lg:translate-x-0 lg:shadow-lg', sidebarCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-60', mobileNavOpen && 'translate-x-0')}>
        {/* Brand */}
        <div className={cn('relative flex min-h-[4.75rem] items-center border-b border-border px-4', sidebarCollapsed && 'lg:justify-center lg:px-2')}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link
              to="/dashboard"
              aria-label="Buka Dashboard"
              title="Buka Dashboard"
              className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-input p-1 -ml-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue', sidebarCollapsed && 'lg:flex-none lg:p-0 lg:ml-0')}
            >
              <BrandMark className={cn('h-8 w-8 flex-shrink-0', sidebarCollapsed && 'lg:mx-auto')} />
              <div className={cn('min-w-0 transition-opacity', sidebarCollapsed && 'lg:hidden')}>
                <p className="text-xs font-semibold text-text-primary leading-tight truncate">Digihidrotech</p>
                <p className="text-[10px] text-text-secondary leading-tight">Monitoring PLTMH</p>
              </div>
            </Link>
            <button type="button" onClick={toggleTheme} aria-label={`Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}`}
              title={`Mode ${theme === 'dark' ? 'terang' : 'gelap'}`} className={cn('ml-auto rounded-input p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary', sidebarCollapsed && 'lg:hidden')}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button type="button" onClick={toggleSidebar} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'} title={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'} className={cn('hidden rounded-input p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary lg:block', sidebarCollapsed && 'lg:absolute lg:right-1 lg:top-1/2 lg:-translate-y-1/2')}>
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Tutup navigasi" className="ml-1 rounded-input p-1.5 text-text-secondary hover:bg-surface-2 lg:hidden"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <StationSelect collapsed={sidebarCollapsed} />

        {/* Station connection */}
        <div
          title={sidebarCollapsed ? telemetry.label : undefined}
          className={cn('mx-3 mt-3 flex items-center gap-2 rounded-card border border-border bg-surface-2/70 px-3 py-2.5 shadow-sm', sidebarCollapsed && 'lg:mx-2 lg:justify-center lg:px-2')}
        >
          {telemetry.ok ? <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-status-good" /> : <WifiOff className="h-3.5 w-3.5 flex-shrink-0 text-status-bad" />}
          <div className={cn('min-w-0 leading-tight', sidebarCollapsed && 'lg:hidden')}>
            <div className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', telemetry.ok ? 'bg-status-good' : 'bg-status-bad')} />
              <p className={cn('text-[10px] font-semibold', telemetry.ok ? 'text-status-good' : 'text-status-bad')}>{telemetry.label}</p>
            </div>
            <p className="mt-0.5 truncate text-[9px] text-text-secondary">{lastUpdate ? formatRelativeTime(lastUpdate) : 'Menunggu data'}</p>
          </div>
        </div>
        <nav aria-label="Navigasi utama" className={cn('flex-1 space-y-5 overflow-y-auto px-2 py-5', sidebarCollapsed && 'lg:px-2')}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className={cn('px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary/70', sidebarCollapsed && 'lg:hidden')}>{group.label}</p>
              <div className="space-y-1">
                {group.items.map(({ to, label, icon: Icon }) => {
                  const active = to === '/dashboard' ? pathname === '/dashboard' || pathname === '/dashboard/' : pathname.startsWith(to)
                  return (
                    <Link
                      key={to}
                      to={to}
                      aria-current={active ? 'page' : undefined}
                      title={sidebarCollapsed ? label : undefined}
                      className={cn(
                        'group relative flex min-h-10 items-center gap-3 rounded-input px-3 text-sm transition-[background-color,color,transform] duration-150',
                        sidebarCollapsed && 'lg:justify-center lg:px-0',
                          active
                            ? 'bg-accent-blue/15 font-semibold text-accent-blue shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent-blue'
                            : 'text-text-secondary hover:translate-x-0.5 hover:bg-surface-2 hover:text-text-primary',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 flex-shrink-0 transition-transform', active ? 'scale-105' : 'group-hover:scale-105')} />
                      <span className={cn('flex-1 truncate', sidebarCollapsed && 'lg:hidden')}>{label}</span>
                      {label === 'Alarm Aktif' && alarmCount > 0 && (
                        <span className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                          sidebarCollapsed && 'lg:absolute lg:-right-1 lg:-top-1 lg:px-1',
                          hasCritical ? 'bg-accent-red text-white animate-pulse-ring' : 'bg-accent-yellow text-background',
                        )}>
                          {alarmCount > 99 ? '99+' : alarmCount}
                        </span>
                      )}
                      {active && <ChevronRight className={cn('h-3 w-3 flex-shrink-0', sidebarCollapsed && 'lg:hidden')} />}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User / Logout */}
        <div className={cn('border-t border-border bg-surface px-3 py-3', sidebarCollapsed && 'lg:px-2')}>
          <div className={cn('mb-1 flex items-center gap-2 px-2 py-1.5', sidebarCollapsed && 'lg:justify-center lg:px-0')}>
            <div className="w-6 h-6 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0">
              {(profile?.full_name ?? profile?.role ?? 'U')[0]?.toUpperCase()}
            </div>
            <div className={cn('min-w-0', sidebarCollapsed && 'lg:hidden')}>
              <p className="text-xs text-text-primary truncate">{profile?.full_name ?? 'User'}</p>
              <p className="text-[10px] text-text-secondary capitalize truncate">{profile?.role ?? ''}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void signOut() }}
            className={cn('flex w-full items-center gap-2 rounded-card px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-accent-red/10 hover:text-accent-red', sidebarCollapsed && 'lg:justify-center lg:px-0')}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className={sidebarCollapsed ? 'lg:hidden' : undefined}>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="relative min-w-0 min-h-0 flex-1 overflow-y-auto">
        <button type="button" onClick={() => setMobileNavOpen(true)} aria-expanded={mobileNavOpen} aria-controls="app-sidebar" aria-label="Buka navigasi" className="fixed left-3 top-3 z-20 rounded-input border border-border bg-surface p-2 text-text-secondary shadow-sm lg:hidden"><Menu className="h-4 w-4" /></button>
        <div className="page-fade-in min-h-full min-w-0 pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Outlet />
        </div>
      </main>
      <nav aria-label="Navigasi cepat mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface/95 px-2 pt-1 shadow-[0_-8px_24px_hsl(var(--text-primary)/0.08)] backdrop-blur-md lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
          const active = to === '/dashboard' ? pathname === '/dashboard' || pathname === '/dashboard/' : pathname.startsWith(to)
          return (
            <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={cn('relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-input px-1 text-[10px] font-medium transition-colors', active ? 'bg-accent-blue/10 text-accent-blue' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary')}>
              <Icon className={cn('h-4 w-4', active && 'drop-shadow-[0_0_5px_hsl(var(--accent-blue)/0.5)]')} aria-hidden="true" />
              <span>{label}</span>
              {label === 'Alarm' && alarmCount > 0 && <span className={cn('absolute right-1/4 top-1 h-2 w-2 rounded-full', hasCritical ? 'bg-accent-red animate-pulse-ring' : 'bg-accent-yellow')} aria-label={`${alarmCount} alarm aktif`} />}
            </Link>
          )
        })}
      </nav>
      <PwaInstallPrompt />
    </div>
  )
}
