import { createFileRoute } from '@tanstack/react-router'
import { useStationId } from '@/lib/station'
import { useMemo, useState } from 'react'
import { useAlarms, useAcknowledgeAlarm } from '@/lib/monitoring'
import { useAuth } from '@/lib/auth'
import { AlarmRow } from '@/components/AlarmBadge'
import { PageHeader } from '@/components/PageHeader'
import { formatTimestamp, calculateDuration } from '@/lib/utils'
import type { Alarm, AlarmPriority, AlarmStatus } from '@/lib/supabase'
import { EmptyState, ErrorState, LoadingState } from '@/components/UiState'
import { AlertOctagon, BellRing, CheckCircle2, Search } from 'lucide-react'

export const Route = createFileRoute('/dashboard/alarms')({ component: AlarmsPage })


const PRIORITY_OPTS = [
  { value: 'all', label: 'Semua Prioritas' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const

const STATUS_OPTS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'active', label: 'Active' },
  { value: 'acknowledged', label: 'Acknowledged' },
] as const

const TYPE_OPTS = [
  { value: 'all', label: 'Semua Tipe' },
  { value: 'high_high', label: 'High-high' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'low_low', label: 'Low-low' },
  { value: 'comm_failure', label: 'Komunikasi' },
  { value: 'device_offline', label: 'Perangkat offline' },
  { value: 'system', label: 'Sistem' },
] as const

function AlarmsPage() {
  const STATION_ID = useStationId()
  const { canAccess } = useAuth()
  const { alarms, count, hasCritical, hasHigh, isLoading, isError, refetch } = useAlarms(STATION_ID)
  const ackMutation = useAcknowledgeAlarm(STATION_ID)
  const [ackingId, setAckingId] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<AlarmPriority | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<AlarmStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<Alarm['alarm_type'] | 'all'>('all')
  const [search, setSearch] = useState('')

  async function handleAck(alarmId: string) {
    setAckingId(alarmId)
    try {
      await ackMutation.mutateAsync({ alarmId })
    } finally {
      setAckingId(null)
    }
  }

  const filtered = useMemo(() => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
    return alarms.filter((a) => {
      if (filterPriority !== 'all' && a.priority !== filterPriority) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      if (filterType !== 'all' && a.alarm_type !== filterType) return false
      const needle = search.trim().toLowerCase()
      return !needle || [a.message, a.tag_id ?? '', a.alarm_type].some((value) => value.toLowerCase().includes(needle))
    }).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || Date.parse(a.active_at) - Date.parse(b.active_at))
  }, [alarms, filterPriority, filterStatus, filterType, search])

  const counts = {
    unacknowledged: alarms.filter((alarm) => alarm.status === 'active').length,
    critical: alarms.filter((alarm) => alarm.priority === 'critical').length,
    high: alarms.filter((alarm) => alarm.priority === 'high').length,
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Alarm Aktif" subtitle="Monitor dan acknowledge alarm realtime"
        actions={
          <div className="flex items-center gap-2">
            {hasCritical && <span className="text-xs font-bold px-2 py-1 rounded-full bg-accent-red/20 text-accent-red animate-pulse">⚠ CRITICAL</span>}
            {!hasCritical && hasHigh && <span className="text-xs font-bold px-2 py-1 rounded-full bg-accent-orange/20 text-accent-orange">HIGH</span>}
            <span className="text-xs text-text-secondary">{count} aktif</span>
          </div>
        }
      />
      <div className="mobile-scroll flex flex-nowrap items-center gap-3 overflow-x-auto border-b border-border bg-surface px-4 py-3 sm:flex-wrap sm:px-6">
        <label className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
          <span className="sr-only">Cari pesan, tag, atau tipe alarm</span>
          <input type="search" placeholder="Cari pesan / tag…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="scada-input pl-9" />
        </label>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as AlarmPriority | 'all')}
          className="bg-surface-2 border border-border rounded-input px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue">
          {PRIORITY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as AlarmStatus | 'all')}
          className="bg-surface-2 border border-border rounded-input px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue">
          {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as Alarm['alarm_type'] | 'all')}
          className="bg-surface-2 border border-border rounded-input px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue">
          {TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-xs text-text-secondary ml-auto">{filtered.length} baris</span>
      </div>
      <div className="dashboard-shell flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AlarmSummary icon={BellRing} label="Total aktif" value={count} tone="blue" />
          <AlarmSummary icon={AlertOctagon} label="Belum diakui" value={counts.unacknowledged} tone={counts.unacknowledged > 0 ? 'orange' : 'green'} />
          <AlarmSummary icon={AlertOctagon} label="Critical" value={counts.critical} tone={counts.critical > 0 ? 'red' : 'green'} />
          <AlarmSummary icon={CheckCircle2} label="High" value={counts.high} tone={counts.high > 0 ? 'yellow' : 'green'} />
        </div>
        {isError ? (
          <ErrorState message="Alarm aktif gagal dimuat. Periksa koneksi lalu coba lagi." onRetry={() => { void refetch() }} />
        ) : isLoading ? (
          <LoadingState label="Memuat alarm aktif…" />
        ) : filtered.length === 0 ? (
          <EmptyState title="Tidak ada alarm yang sesuai" description="Sistem tidak menemukan alarm aktif berdasarkan filter saat ini." />
        ) : (
          <div className="space-y-2">
            {filtered.map((alarm) => (
              <div key={alarm.id} className="scada-card scada-card-interactive p-3 sm:p-4">
                <AlarmRow alarm={alarm}
                  onAck={canAccess('acknowledgeAlarm') ? (id) => { void handleAck(id) } : undefined}
                  acking={ackingId === alarm.id} canAck={canAccess('acknowledgeAlarm')} />
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-text-secondary">
                  <span>Aktif: {formatTimestamp(alarm.active_at, 'dd MMM HH:mm:ss')}</span>
                  <span>Durasi: {calculateDuration(alarm.active_at, alarm.cleared_at ?? undefined)}</span>
                  {alarm.value_at_alarm != null && <span>Nilai: {alarm.value_at_alarm}</span>}
                  {alarm.threshold_value != null && <span>Threshold: {alarm.threshold_value}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AlarmSummary({ icon: Icon, label, value, tone }: { icon: typeof BellRing; label: string; value: number; tone: 'blue' | 'orange' | 'red' | 'yellow' | 'green' }) {
  const colors = {
    blue: 'text-accent-blue bg-accent-blue/10', orange: 'text-accent-orange bg-accent-orange/10',
    red: 'text-accent-red bg-accent-red/10', yellow: 'text-accent-yellow bg-accent-yellow/10',
    green: 'text-status-good bg-status-good/10',
  }
  return <div className="scada-card flex items-center gap-3 p-3"><span className={`rounded-input p-2 ${colors[tone]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-lg font-semibold text-text-primary">{value}</p><p className="text-[10px] text-text-secondary">{label}</p></div></div>
}
