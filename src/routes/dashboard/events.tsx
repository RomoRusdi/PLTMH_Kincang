import { createFileRoute } from '@tanstack/react-router'
import { useStationId } from '@/lib/station'
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/PageHeader'
import { CalendarDays, ChevronRight, Download, FilterX, RefreshCw, ShieldCheck, UserRound, X } from 'lucide-react'
import { exportCsv } from '@/lib/exportCsv'

import { cn, formatTimestamp } from '@/lib/utils'
import type { Event, EventSeverity, EventType } from '@/lib/supabase'
import { EmptyState, ErrorState, LoadingState } from '@/components/UiState'

export const Route = createFileRoute('/dashboard/events')({ component: EventsPage })

const SEV_COLOR: Record<string, string> = {
  info: 'text-accent-blue bg-accent-blue/10 border-accent-blue/30',
  warning: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/30',
  debug: 'text-text-secondary bg-surface-2 border-border',
  critical: 'text-accent-red bg-accent-red/20 border-accent-red/40',
}

const EVENT_LABEL: Record<EventType, string> = {
  login: 'Login', logout: 'Logout', command: 'Perintah', config_change: 'Konfigurasi',
  alarm_ack: 'Akui alarm', alarm_clear: 'Clear alarm', device_change: 'Perubahan device',
  user_change: 'Perubahan user', system: 'Sistem', data_correction: 'Koreksi data',
}

type DateFilter = 'all' | 'today' | '7d' | '30d'

function useEvents(stationId: string) {
  return useQuery({
    queryKey: ['events', stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events').select('*')
        .eq('station_id', stationId)
        .order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data as Event[]
    },
    staleTime: 30000,
  })
}

function EventsPage() {
  const STATION_ID = useStationId()
  const [search, setSearch] = useState('')
  const [sevFilter, setSevFilter] = useState<EventSeverity | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<EventType | 'all'>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const { data: events = [], isLoading, isError, error, refetch } = useEvents(STATION_ID)

  const eventTypes = useMemo(() => [...new Set(events.map((event) => event.event_type))].sort(), [events])
  const filtered = useMemo(() => events.filter((e) => {
    if (sevFilter !== 'all' && e.severity !== sevFilter) return false
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false
    if (dateFilter !== 'all') {
      const days = dateFilter === 'today' ? 1 : Number(dateFilter.replace('d', ''))
      if (Date.parse(e.created_at) < Date.now() - days * 86400000) return false
    }
    if (search && !`${e.message} ${e.actor_email ?? ''} ${e.event_type} ${e.tag_id ?? ''} ${e.actor_role ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [dateFilter, events, search, sevFilter, typeFilter])

  const stats = useMemo(() => ({
    critical: events.filter((event) => event.severity === 'critical').length,
    warning: events.filter((event) => event.severity === 'warning').length,
    today: events.filter((event) => Date.parse(event.created_at) >= Date.now() - 86400000).length,
    actors: new Set(events.map((event) => event.actor_email).filter(Boolean)).size,
  }), [events])

  function resetFilters() {
    setSearch('')
    setSevFilter('all')
    setTypeFilter('all')
    setDateFilter('all')
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Audit Events" subtitle="Log aktivitas sistem dan pengguna"
        actions={<div className="flex gap-2"><button type="button" onClick={() => exportCsv(filtered.map((e) => ({ waktu: e.created_at, severity: e.severity, tipe: e.event_type, pesan: e.message, aktor: e.actor_email ?? '', role: e.actor_role ?? '', tag: e.tag_id ?? '' })), `audit-events-${new Date().toISOString().slice(0, 10)}.csv`)} disabled={filtered.length === 0} className="scada-button-secondary disabled:opacity-50"><Download className="w-3 h-3" /> CSV</button><button type="button" onClick={() => { void refetch() }} className="scada-button-secondary"><RefreshCw className="w-3 h-3" /> Refresh</button></div>} />
      <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AuditStat label="Event terbaru 24 jam" value={stats.today} detail="dari 200 event terakhir" tone="blue" />
          <AuditStat label="Critical" value={stats.critical} detail="perlu ditinjau" tone="red" />
          <AuditStat label="Warning" value={stats.warning} detail="aktivitas berisiko" tone="yellow" />
          <AuditStat label="Aktor unik" value={stats.actors} detail="email tercatat" tone="green" />
        </div>
        <div className="mb-4 rounded-card border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" placeholder="Cari pesan, email, tag…" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Cari audit event"
              className="scada-input w-full sm:w-64" />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)} aria-label="Filter waktu" className="scada-input w-full sm:w-auto">
              <option value="all">Semua waktu</option><option value="today">24 jam terakhir</option><option value="7d">7 hari terakhir</option><option value="30d">30 hari terakhir</option>
            </select>
            <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value as EventSeverity | 'all')} aria-label="Filter severity" className="scada-input w-full sm:w-auto">
              <option value="all">Semua severity</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option><option value="debug">Debug</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as EventType | 'all')} aria-label="Filter tipe event" className="scada-input w-full sm:w-auto">
              <option value="all">Semua tipe</option>{eventTypes.map((type) => <option key={type} value={type}>{EVENT_LABEL[type] ?? type}</option>)}
            </select>
            {(search || sevFilter !== 'all' || typeFilter !== 'all' || dateFilter !== 'all') && <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary"><FilterX className="h-3.5 w-3.5" /> Reset</button>}
            <span className="ml-auto text-xs text-text-secondary">{filtered.length} dari {events.length} event</span>
          </div>
        </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <LoadingState label="Memuat audit events…" />
        ) : isError ? (
          <ErrorState message={error instanceof Error ? error.message : 'Gagal memuat audit event.'} onRetry={() => { void refetch() }} />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
          <table className="min-w-[820px] w-full text-xs">
            <thead className="sticky top-0 z-10 bg-surface-2">
              <tr>{['Waktu','Severity','Tipe','Pesan','Aktor','Tag',''].map((h, index) => (
                <th key={`${h}-${index}`} className="text-left px-4 py-3 text-text-secondary font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map((ev) => (
                <tr key={ev.id} className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2" onClick={() => setSelectedEvent(ev)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedEvent(ev) } }} tabIndex={0} role="button" aria-label={`Lihat detail ${ev.message}`}>
                  <td className="px-4 py-2.5 text-text-secondary font-mono whitespace-nowrap">
                    {formatTimestamp(ev.created_at, 'dd/MM HH:mm:ss')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', SEV_COLOR[ev.severity] ?? '')}>
                      {ev.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{EVENT_LABEL[ev.event_type] ?? ev.event_type}</td>
                  <td className="px-4 py-2.5 text-text-primary max-w-sm truncate">{ev.message}</td>
                  <td className="px-4 py-2.5 text-text-secondary"><span className="block max-w-[150px] truncate">{ev.actor_email ?? 'Sistem'}</span><span className="text-[10px] text-text-secondary/70">{ev.actor_role ?? '—'}</span></td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono">{ev.tag_id ?? '—'}</td>
                  <td className="w-8 px-2"><ChevronRight className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" /></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7}><EmptyState title="Tidak ada event" description="Belum ada aktivitas yang sesuai dengan filter." /></td></tr>}
            </tbody>
          </table>
          </div>
        )}
      </div>
      </div>
      {selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}

function AuditStat({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'blue' | 'red' | 'yellow' | 'green' }) {
  const colors = { blue: 'text-accent-blue', red: 'text-accent-red', yellow: 'text-accent-yellow', green: 'text-status-good' }
  return <div className="rounded-card border border-border bg-surface p-3 shadow-sm"><p className="text-[10px] text-text-secondary">{label}</p><p className={cn('mt-1 text-xl font-bold tabular-nums', colors[tone])}>{value}</p><p className="text-[10px] text-text-secondary">{detail}</p></div>
}

function EventDetail({ event, onClose }: { event: Event; onClose: () => void }) {
  const metadata = Object.entries(event.metadata ?? {})
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card border border-border bg-surface shadow-xl" role="dialog" aria-modal="true" aria-labelledby="event-detail-title">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4"><div><p className="text-[10px] uppercase tracking-wider text-text-secondary">Audit event</p><h2 id="event-detail-title" className="mt-1 text-sm font-semibold text-text-primary">{event.message}</h2></div><button type="button" onClick={onClose} className="rounded p-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary" aria-label="Tutup detail event"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <DetailField icon={<CalendarDays />} label="Waktu" value={formatTimestamp(event.created_at)} />
        <DetailField icon={<ShieldCheck />} label="Severity / tipe" value={`${event.severity.toUpperCase()} · ${EVENT_LABEL[event.event_type] ?? event.event_type}`} />
        <DetailField icon={<UserRound />} label="Aktor" value={`${event.actor_email ?? 'Sistem'}${event.actor_role ? ` · ${event.actor_role}` : ''}`} />
        <DetailField label="ID event" value={event.id} mono />
        <DetailField label="Tag" value={event.tag_id ?? '—'} mono />
        <DetailField label="Device ID" value={event.device_id ?? '—'} mono />
        <DetailField label="Nilai sebelum" value={event.old_value ?? '—'} />
        <DetailField label="Nilai sesudah" value={event.new_value ?? '—'} />
        <DetailField label="IP address" value={event.ip_address ?? '—'} mono />
        <DetailField label="User agent" value={event.user_agent ?? '—'} />
        <div className="sm:col-span-2"><p className="mb-1 text-[10px] uppercase tracking-wide text-text-secondary">Metadata</p>{metadata.length ? <pre className="max-h-48 overflow-auto rounded-input bg-surface-2 p-3 text-[11px] text-text-primary">{JSON.stringify(Object.fromEntries(metadata), null, 2)}</pre> : <p className="text-xs text-text-secondary">Tidak ada metadata tambahan.</p>}</div>
      </div>
    </section>
  </div>
}

function DetailField({ icon, label, value, mono = false }: { icon?: ReactNode; label: string; value: string; mono?: boolean }) {
  return <div><p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-text-secondary">{icon && <span className="h-3 w-3">{icon}</span>}{label}</p><p className={cn('break-words text-xs text-text-primary', mono && 'font-mono text-[11px]')}>{value}</p></div>
}
