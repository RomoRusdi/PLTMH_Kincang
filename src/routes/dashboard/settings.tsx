import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import type { UserRole } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { User, Lock, Bell, Sliders, ChevronRight, ShieldCheck } from 'lucide-react'
import { ProfileTab }       from '@/components/settings/ProfileTab'
import { PasswordTab }      from '@/components/settings/PasswordTab'
import { NotificationsTab } from '@/components/settings/NotificationsTab'
import { ThresholdsTab }    from '@/components/settings/ThresholdsTab'

export const Route = createFileRoute('/dashboard/settings')({ component: SettingsPage })

type Tab = 'profile' | 'password' | 'notifications' | 'thresholds'

const TABS: { id: Tab; label: string; description: string; icon: typeof User; minRole?: UserRole }[] = [
  { id: 'profile',       label: 'Profil',        description: 'Identitas dan kontak akun', icon: User    },
  { id: 'password',      label: 'Kata Sandi',    description: 'Perbarui kredensial login', icon: Lock    },
  { id: 'notifications', label: 'Notifikasi',    description: 'Preferensi alarm browser', icon: Bell    },
  { id: 'thresholds',    label: 'Threshold Tag', description: 'Batas alarm sensor', icon: Sliders, minRole: 'admin' },
]

function SettingsPage() {
  const { profile, user, hasRole } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')

  const visibleTabs = TABS.filter((t) =>
    !t.minRole || hasRole(t.minRole),
  )
  const activeTab = visibleTabs.find((item) => item.id === tab) ?? visibleTabs[0]
  const initials = (profile?.full_name ?? user?.email ?? 'U').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Pengaturan"
        subtitle="Kelola profil, keamanan, dan konfigurasi sistem"
      />
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden md:flex-row">
        {/* Side nav */}
        <nav aria-label="Menu pengaturan" className="flex w-full flex-shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface p-2 md:w-56 md:flex-col md:space-y-0.5 md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r md:p-3">
          {visibleTabs.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
              className={cn(
                'flex w-auto flex-shrink-0 items-center gap-2.5 whitespace-nowrap rounded-card px-3 py-2 text-left text-sm transition-colors md:w-full',
                tab === id
                  ? 'bg-accent-blue/15 text-accent-blue font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="min-w-0 flex-1 truncate"><span className="block">{label}</span><span className="hidden text-[10px] font-normal text-text-secondary md:block md:truncate">{description}</span></span>
              {tab === id && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-blue/15 text-sm font-semibold text-accent-blue">{initials || 'U'}</div>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{profile?.full_name || 'Pengguna'}</p><p className="truncate text-xs text-text-secondary">{user?.email ?? '—'}</p></div>
              </div>
              <div className="flex items-center gap-2 text-xs"><span className="rounded-full bg-status-good/10 px-2 py-1 text-status-good">Sesi aktif</span><span className="rounded-full bg-surface-2 px-2 py-1 capitalize text-text-secondary">{profile?.role ?? '—'}</span></div>
            </div>
            <div className="mb-4 flex items-start gap-2 rounded-card border border-accent-blue/20 bg-accent-blue/5 px-3 py-2 text-xs text-text-secondary"><ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-blue" /><span>Perubahan profil dan preferensi tersimpan per akun. Threshold hanya dapat diubah oleh administrator.</span></div>
            <div className="mb-4"><p className="text-base font-semibold text-text-primary">{activeTab?.label}</p><p className="mt-1 text-xs text-text-secondary">{activeTab?.description}</p></div>
            {activeTab?.id === 'profile'       && <ProfileTab />}
            {activeTab?.id === 'password'      && <PasswordTab />}
            {activeTab?.id === 'notifications' && <NotificationsTab />}
            {activeTab?.id === 'thresholds'    && <ThresholdsTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
