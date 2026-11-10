import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useStationId } from '@/lib/station'
import { useBreakdownReports, useCreateBreakdown, useUpdateBreakdown } from '@/lib/monitoring'
import { useAuth } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { Download, Plus, Search } from 'lucide-react'
import { BreakdownModal } from '@/components/BreakdownModal'
import { BreakdownCard, STATUS_META } from '@/components/BreakdownCard'
import type { BreakdownStatus } from '@/lib/supabase'
import { EmptyState, LoadingState } from '@/components/UiState'
import { exportCsv } from '@/lib/exportCsv'

export const Route = createFileRoute('/dashboard/breakdown')({ component: BreakdownPage })


function BreakdownPage() {
  const STATION_ID = useStationId()
  const { canAccess } = useAuth()
  const { data: reports = [], isLoading, isError, refetch } = useBreakdownReports(STATION_ID)
  const createMut = useCreateBreakdown(STATION_ID)
  const updateMut = useUpdateBreakdown(STATION_ID)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all'|'open'|'in_progress'|'resolved'>('all')
  const [search, setSearch] = useState('')

  const filtered = reports.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${r.cause} ${r.cause_category} ${r.corrective_action ?? ''} ${r.affected_devices.join(' ')}`.toLowerCase().includes(needle)
  })
  const counts = {
    open:        reports.filter((r) => r.status === 'open').length,
    in_progress: reports.filter((r) => r.status === 'in_progress').length,
    resolved:    reports.filter((r) => r.status === 'resolved').length,
  }

  async function handleStatus(id: string, status: BreakdownStatus) {
    const resolved_at = status === 'resolved' ? new Date().toISOString() : undefined
    await updateMut.mutateAsync({ id, updates: { status, resolved_at } })
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Laporan Gangguan" subtitle="Catat dan pantau breakdown perangkat lapangan"
        actions={<div className="flex gap-2">{reports.length > 0 && <button type="button" onClick={() => exportCsv(filtered.map((r) => ({ tanggal: r.event_date, penyebab: r.cause, kategori: r.cause_category, status: r.status, durasi_jam: r.duration_hours ?? '', perangkat: r.affected_devices.join('; ') })), `breakdown-${new Date().toISOString().slice(0, 10)}.csv`)} className="scada-button-secondary"><Download className="w-3 h-3" /> CSV</button>}{canAccess('editDevice') && <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-accent-blue text-white rounded-input font-medium hover:bg-accent-blue/80 transition-colors"><Plus className="w-4 h-4" /> Buat Laporan</button>}</div>} />

      {/* Filter strip */}
      <div className="px-4 sm:px-6 py-3 border-b border-border bg-surface flex gap-3 flex-wrap">
        <label className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari laporan…" className="scada-input pl-9" /></label>
        {(['all','open','in_progress','resolved'] as const).map((s) => {
          const meta = s !== 'all' ? STATUS_META[s] : null
          const cnt  = s === 'all' ? reports.length : counts[s]
          const Icon = meta?.icon
          return (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors',
                filterStatus === s ? 'bg-accent-blue/15 border-accent-blue text-accent-blue'
                                   : 'border-border text-text-secondary hover:border-accent-blue/40')}>
              {Icon && <Icon className="w-3 h-3" />}
              <span>{s === 'all' ? 'Semua' : meta?.label}</span>
              <span className="font-bold ml-0.5">{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <LoadingState label="Memuat laporan gangguan…" />
        ) : isError ? (
          <div className="rounded-card border border-accent-red/30 bg-accent-red/5 p-6 text-sm text-accent-red">Gagal memuat laporan gangguan. <button type="button" onClick={() => void refetch()} className="underline">Coba lagi</button></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Tidak ada laporan gangguan" description="Laporan gangguan baru akan tampil setelah dibuat oleh operator." />
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <BreakdownCard key={r.id} r={r}
                canEdit={canAccess('editDevice')}
                onStatus={handleStatus}
                updating={updateMut.isPending} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <BreakdownModal
          onClose={() => setShowForm(false)}
          onCreate={async (data) => { await createMut.mutateAsync(data); setShowForm(false) }}
          pending={createMut.isPending} />
      )}
    </div>
  )
}
