import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { supabase, type UserRole } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useStation } from '@/lib/station'
import { cn, formatRelativeTime } from '@/lib/utils'

export const Route = createFileRoute('/dashboard/users')({ component: UsersPage })

// ============================================================================
// Manajemen pengguna (khusus superadmin).
// - Membuat akun & mengganti password lewat Edge Function `admin-users`
//   (butuh service role, tidak bisa dari browser).
// - Peran, akses stasiun, dan status diubah langsung di tabel profiles;
//   database menolak perubahan dari selain superadmin (migrasi 006).
// ============================================================================

interface UserRow {
  id: string
  full_name: string | null
  email: string | null
  role: UserRole
  station_access: string[]
  is_active: boolean
  last_login: string | null
}

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: 'admin', label: 'Admin stasiun', hint: 'Mengatur perangkat, threshold, kalibrasi, dan estimasi daya di stasiun yang dipilih' },
  { value: 'operator', label: 'Operator', hint: 'Memantau, mengakui alarm, dan mencatat gangguan' },
  { value: 'technician', label: 'Teknisi', hint: 'Memantau dan mengakui alarm' },
  { value: 'viewer', label: 'Viewer', hint: 'Hanya melihat dashboard dan riwayat' },
  { value: 'superadmin', label: 'Superadmin', hint: 'Semua stasiun dan pengelolaan pengguna' },
]
const roleLabel = (role: UserRole) => ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role

/** Password acak yang mudah dibacakan (tanpa huruf mirip seperti l/1/O/0). */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => chars[n % chars.length]).join('')
}

/** Panggil Edge Function dan kembalikan pesan error yang bisa dibaca manusia. */
async function callAdminUsers(body: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.functions.invoke('admin-users', { body })
  if (!error) return null
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    const payload = await context.json().catch(() => null) as { error?: string } | null
    if (payload?.error) return payload.error
  }
  if (/Failed to send|fetch/i.test(error.message)) {
    return 'Edge Function admin-users belum terpasang atau tidak bisa dihubungi. Lihat panduan deploy di supabase/functions/admin-users/index.ts.'
  }
  return error.message
}

function UsersPage() {
  const { profile } = useAuth()
  const { stations } = useStation()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [passwordFor, setPasswordFor] = useState<UserRow | null>(null)

  const usersQuery = useQuery({
    queryKey: ['users'],
    enabled: profile?.role === 'superadmin',
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id,full_name,email,role,station_access,is_active,last_login')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as UserRow[]
    },
  })

  const stationName = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations])
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['users'] })

  if (profile?.role !== 'superadmin') {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Pengguna" subtitle="Kelola akun dan akses stasiun" />
        <div className="p-6">
          <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4 text-sm text-text-secondary">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-accent-yellow" />
            Halaman ini hanya untuk superadmin.
          </div>
        </div>
      </div>
    )
  }

  const users = usersQuery.data ?? []

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Pengguna"
        subtitle="Buat akun admin per stasiun dan atur hak aksesnya"
        eyebrow="Semua stasiun"
        actions={(
          <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-input bg-accent-blue px-3 py-2 text-xs font-medium text-white hover:bg-accent-blue/90">
            <Plus className="h-3.5 w-3.5" /> Tambah akun
          </button>
        )}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {creating && <CreateUserPanel stations={stations} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh() }} />}

        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-text-primary">{users.length} akun</h2>
            <button type="button" onClick={refresh} className="rounded-input p-1.5 text-text-secondary hover:bg-surface-2" aria-label="Muat ulang daftar">
              <RefreshCw className={cn('h-3.5 w-3.5', usersQuery.isFetching && 'animate-spin')} />
            </button>
          </div>
          {usersQuery.isError ? (
            <p className="p-4 text-sm text-accent-red">Gagal memuat pengguna: {(usersQuery.error as Error).message}</p>
          ) : usersQuery.isLoading ? (
            <div className="m-4 h-24 skeleton rounded-card" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-secondary">
                    <th className="px-4 py-2 font-medium">Akun</th>
                    <th className="px-4 py-2 font-medium">Peran</th>
                    <th className="px-4 py-2 font-medium">Akses stasiun</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Login terakhir</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => editingId === user.id ? (
                    <EditUserRow key={user.id} user={user} stations={stations} isSelf={user.id === profile.id}
                      onCancel={() => setEditingId(null)} onSaved={() => { setEditingId(null); refresh() }} />
                  ) : (
                    <tr key={user.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-primary">{user.full_name || '—'}{user.id === profile.id && <span className="ml-2 text-[10px] text-accent-blue">akun Anda</span>}</p>
                        <p className="text-xs text-text-secondary">{user.email ?? '(email belum tersinkron)'}</p>
                      </td>
                      <td className="px-4 py-3 text-text-primary">{roleLabel(user.role)}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">
                        {user.role === 'superadmin' ? 'Semua stasiun'
                          : user.station_access.length === 0 ? <span className="text-accent-yellow">Belum ada</span>
                          : user.station_access.map((id) => stationName.get(id) ?? 'Stasiun tidak dikenal').join(', ')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px]', user.is_active ? 'bg-status-good/10 text-status-good' : 'bg-surface-2 text-text-secondary')}>
                          {user.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{user.last_login ? formatRelativeTime(user.last_login) : 'Belum pernah'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => setEditingId(user.id)} className="scada-button-secondary px-2 py-1 text-[11px]"><Pencil className="h-3 w-3" /> Ubah</button>
                          <button type="button" onClick={() => setPasswordFor(user)} className="scada-button-secondary px-2 py-1 text-[11px]"><KeyRound className="h-3 w-3" /> Password</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-text-secondary">
          Admin stasiun hanya melihat dan mengatur stasiun yang dipilih untuknya, termasuk pengguna lain di stasiun itu. Hanya superadmin yang dapat membuat akun, membuat stasiun, dan mengubah peran.
        </p>
      </div>

      {passwordFor && <PasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function StationPicker({ stations, value, onChange }: {
  stations: { id: string; name: string }[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {stations.map((station) => {
        const checked = value.includes(station.id)
        return (
          <label key={station.id} className={cn('flex cursor-pointer items-center gap-2 rounded-input border px-2.5 py-1.5 text-xs', checked ? 'border-accent-blue bg-accent-blue/10 text-text-primary' : 'border-border text-text-secondary')}>
            <input type="checkbox" checked={checked} onChange={() => onChange(checked ? value.filter((id) => id !== station.id) : [...value, station.id])} />
            {station.name}
          </label>
        )
      })}
    </div>
  )
}

function CreateUserPanel({ stations, onClose, onCreated }: {
  stations: { id: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState(generatePassword)
  const [role, setRole] = useState<UserRole>('admin')
  const [access, setAccess] = useState<string[]>(stations.length === 1 && stations[0] ? [stations[0].id] : [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (role !== 'superadmin' && access.length === 0) { setError('Pilih minimal satu stasiun untuk akun ini.'); return }
    setSaving(true); setError(null)
    const message = await callAdminUsers({
      action: 'create', email, password, full_name: fullName, role,
      station_access: role === 'superadmin' ? [] : access,
    })
    setSaving(false)
    if (message) { setError(message); return }
    toast.success(`Akun ${email} dibuat. Berikan password sementara kepada pemiliknya.`)
    onCreated()
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-card border border-accent-blue/30 bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Akun baru</h2>
        <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-input p-1 text-text-secondary hover:bg-surface-2"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-text-secondary">Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="scada-input w-full text-sm" placeholder="nama@contoh.com" autoComplete="off" />
        </label>
        <label className="space-y-1 text-xs text-text-secondary">Nama lengkap
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="scada-input w-full text-sm" placeholder="mis. Admin PLTMH Kincang" />
        </label>
        <label className="space-y-1 text-xs text-text-secondary">Password sementara (minimal 8 karakter)
          <span className="flex gap-2">
            <input required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="scada-input w-full font-mono text-sm" autoComplete="new-password" />
            <button type="button" onClick={() => setPassword(generatePassword())} className="scada-button-secondary whitespace-nowrap px-2 text-[11px]">Buat acak</button>
          </span>
        </label>
        <label className="space-y-1 text-xs text-text-secondary">Peran
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="scada-input w-full text-sm">
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <span className="block text-[11px]">{ROLE_OPTIONS.find((option) => option.value === role)?.hint}</span>
        </label>
      </div>
      {role !== 'superadmin' && (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary">Akses stasiun</p>
          <StationPicker stations={stations} value={access} onChange={setAccess} />
        </div>
      )}
      {error && <p role="alert" className="text-xs text-accent-red">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="rounded-input bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50">
          {saving ? 'Membuat akun…' : 'Buat akun'}
        </button>
        <p className="text-[11px] text-text-secondary">Catat password sebelum menyimpan; password tidak bisa dilihat lagi setelahnya.</p>
      </div>
    </form>
  )
}

function EditUserRow({ user, stations, isSelf, onCancel, onSaved }: {
  user: UserRow
  stations: { id: string; name: string }[]
  isSelf: boolean
  onCancel: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [access, setAccess] = useState<string[]>(user.station_access)
  const [active, setActive] = useState(user.is_active)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (role !== 'superadmin' && access.length === 0) { toast.error('Pilih minimal satu stasiun.'); return }
    setSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ role, station_access: role === 'superadmin' ? user.station_access : access, is_active: active })
      .eq('id', user.id)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(`Akun ${user.email ?? user.full_name ?? ''} diperbarui`)
    onSaved()
  }

  return (
    <tr className="border-b border-border bg-accent-blue/5 last:border-0">
      <td colSpan={6} className="space-y-3 px-4 py-4">
        <p className="text-sm font-medium text-text-primary">{user.full_name || user.email}</p>
        {isSelf && <p className="text-xs text-text-secondary">Peran dan status akun Anda sendiri tidak dapat diubah dari sini.</p>}
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <label className="space-y-1 text-xs text-text-secondary">Peran
            <select value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as UserRole)} className="scada-input w-full text-sm">
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {role !== 'superadmin' && (
            <div className="space-y-1">
              <p className="text-xs text-text-secondary">Akses stasiun</p>
              <StationPicker stations={stations} value={access} onChange={setAccess} />
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-primary">
          <input type="checkbox" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} />
          Akun aktif (akun nonaktif tidak bisa masuk)
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-input bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan'}</button>
          <button type="button" onClick={onCancel} className="scada-button-secondary px-3 py-1.5 text-xs">Batal</button>
        </div>
      </td>
    </tr>
  )
}

function PasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setError(null)
    const message = await callAdminUsers({ action: 'set_password', user_id: user.id, password })
    setSaving(false)
    if (message) { setError(message); return }
    toast.success(`Password ${user.email ?? ''} diganti`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="password-title">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md space-y-4 rounded-card border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="password-title" className="text-sm font-semibold text-text-primary">Ganti password</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-input p-1 text-text-secondary hover:bg-surface-2"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-text-secondary">Akun: <span className="text-text-primary">{user.email ?? user.full_name}</span>. Password lama tidak berlaku lagi setelah disimpan.</p>
        <label className="block space-y-1 text-xs text-text-secondary">Password baru (minimal 8 karakter)
          <span className="flex gap-2">
            <input required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="scada-input w-full font-mono text-sm" autoComplete="new-password" />
            <button type="button" onClick={() => setPassword(generatePassword())} className="scada-button-secondary whitespace-nowrap px-2 text-[11px]">Buat acak</button>
          </span>
        </label>
        {error && <p role="alert" className="text-xs text-accent-red">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="scada-button-secondary px-3 py-1.5 text-xs">Batal</button>
          <button type="submit" disabled={saving} className="rounded-input bg-accent-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{saving ? 'Menyimpan…' : 'Ganti password'}</button>
        </div>
      </form>
    </div>
  )
}
