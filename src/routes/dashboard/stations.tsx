import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, Gauge, RefreshCw, Search, WifiOff } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/UiState'
import { useStation } from '@/lib/station'
import {
  CALIBRATION_LABEL,
  calibrationStatus,
  connectionState,
  needsAttention,
  useNow,
  useStationOverview,
  type CalibrationState,
  type ConnectionState,
} from '@/lib/stationStatus'
import type { Quality, StationOverview } from '@/lib/supabase'
import { cn, formatRelativeTime } from '@/lib/utils'

export const Route = createFileRoute('/dashboard/stations')({ component: StationsOverviewPage })

type Filter = 'all' | 'attention' | 'stale' | 'alarm' | 'calibration'
type Sort = 'name' | 'attention' | 'flow' | 'calibration'

const SORT_LABEL: Record<Sort, string> = {
  name: 'Nama',
  attention: 'Bermasalah dulu',
  flow: 'Debit tertinggi',
  calibration: 'Kalibrasi tertua',
}

function StationsOverviewPage() {
  const { data: rows = [], isLoading, isError, refetch, dataUpdatedAt } = useStationOverview()
  const { setStationId } = useStation()
  const navigate = useNavigate()
  const now = useNow(15_000)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('attention')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => ({
    total: rows.length,
    live: rows.filter((r) => connectionState(r.last_data_at, now) === 'live').length,
    stale: rows.filter((r) => connectionState(r.last_data_at, now) !== 'live').length,
    alarm: rows.filter((r) => r.active_alarms > 0).length,
    calibration: rows.filter((r) => isCalibrationIssue(r, now)).length,
    attention: rows.filter((r) => needsAttention(r, now)).length,
  }), [rows, now])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows
      .filter((r) => !needle || `${r.name} ${r.location}`.toLowerCase().includes(needle))
      .filter((r) => {
        if (filter === 'attention') return needsAttention(r, now)
        if (filter === 'stale') return connectionState(r.last_data_at, now) !== 'live'
        if (filter === 'alarm') return r.active_alarms > 0
        if (filter === 'calibration') return isCalibrationIssue(r, now)
        return true
      })
      .sort((a, b) => {
        if (sort === 'flow') return (b.flow_m3s ?? -1) - (a.flow_m3s ?? -1)
        if (sort === 'calibration') return calibrationAge(b, now) - calibrationAge(a, now)
        if (sort === 'attention') return Number(needsAttention(b, now)) - Number(needsAttention(a, now)) || a.name.localeCompare(b.name)
        return a.name.localeCompare(b.name)
      })
  }, [rows, filter, sort, search, now])

  function open(row: StationOverview, to: '/dashboard' | '/dashboard/calibration') {
    setStationId(row.id)
    void navigate({ to })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Ringkasan Stasiun"
        eyebrow="Semua stasiun"
        subtitle={`Kondisi terkini semua lokasi pemasangan radar · diperbarui tiap 15 detik${dataUpdatedAt ? ` · terakhir ${formatRelativeTime(dataUpdatedAt)}` : ''}`}
        actions={<button type="button" onClick={() => void refetch()} className="scada-button-secondary"><RefreshCw className="h-3 w-3" /> Refresh</button>}
      />
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {isError ? <ErrorState message="Ringkasan stasiun tidak dapat dimuat. Pastikan migrasi 003 sudah dijalankan." onRetry={() => void refetch()} />
          : isLoading ? <LoadingState label="Memuat stasiun…" />
          : rows.length === 0 ? <EmptyState title="Belum ada stasiun" description="Stasiun yang dapat Anda akses akan tampil di sini." />
          : <>
            <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <SummaryTile label="Semua stasiun" value={counts.total} active={filter === 'all'} onClick={() => setFilter('all')} />
              <SummaryTile label="Perlu perhatian" value={counts.attention} tone="warning" icon={AlertTriangle} active={filter === 'attention'} onClick={() => setFilter('attention')} />
              <SummaryTile label="Tidak mengirim data" value={counts.stale} tone="bad" icon={WifiOff} active={filter === 'stale'} onClick={() => setFilter('stale')} />
              <SummaryTile label="Ada alarm" value={counts.alarm} tone="bad" icon={BellRing} active={filter === 'alarm'} onClick={() => setFilter('alarm')} />
              <SummaryTile label="Kalibrasi bermasalah" value={counts.calibration} tone="warning" icon={Gauge} active={filter === 'calibration'} onClick={() => setFilter('calibration')} />
            </section>

            <section className="scada-card space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-text-secondary">{visible.length} dari {rows.length} stasiun · {counts.live} live</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative min-w-0 sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
                    <span className="sr-only">Cari stasiun</span>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau lokasi…" className="scada-input pl-9" />
                  </label>
                  <select aria-label="Urutkan stasiun" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="scada-input sm:w-60">
                    {(Object.keys(SORT_LABEL) as Sort[]).map((key) => <option key={key} value={key}>Urutkan: {SORT_LABEL[key]}</option>)}
                  </select>
                </div>
              </div>

              {visible.length === 0 ? (
                <EmptyState title="Tidak ada stasiun yang sesuai" description="Ubah filter atau kata kunci pencarian." />
              ) : <>
                {/* Desktop: tabel agar angka antar stasiun mudah dibandingkan. */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-left text-xs text-text-secondary">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Stasiun</th>
                        <th className="py-2 pr-4 font-medium">Koneksi</th>
                        <th className="py-2 pr-4 text-right font-medium">Level air</th>
                        <th className="py-2 pr-4 text-right font-medium">Kecepatan</th>
                        <th className="py-2 pr-4 text-right font-medium">Debit</th>
                        <th className="py-2 pr-4 font-medium">Alarm</th>
                        <th className="py-2 pr-4 font-medium">Kalibrasi</th>
                        <th className="py-2 font-medium"><span className="sr-only">Aksi</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.id} onClick={() => open(row, '/dashboard')} className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-surface-2/60">
                          <td className="py-3 pr-4">
                            <p className="font-semibold text-text-primary">{row.name}</p>
                            <p className="text-xs text-text-secondary">{row.location}</p>
                          </td>
                          <td className="py-3 pr-4"><Connection row={row} now={now} /></td>
                          <td className="py-3 pr-4 text-right"><Value value={row.level_m} unit="m" digits={3} quality={row.level_quality} /></td>
                          <td className="py-3 pr-4 text-right"><Value value={row.velocity_ms} unit="m/s" digits={2} quality={row.velocity_quality} /></td>
                          <td className="py-3 pr-4 text-right"><Value value={row.flow_m3s} unit="m³/s" digits={3} quality={row.flow_quality} /></td>
                          <td className="py-3 pr-4"><Alarms row={row} /></td>
                          <td className="py-3 pr-4"><Calibration row={row} now={now} /></td>
                          <td className="py-3">
                            <div className="flex justify-end gap-1.5">
                              <button type="button" onClick={(e) => { e.stopPropagation(); open(row, '/dashboard/calibration') }} className="scada-button-secondary px-2.5 py-1 text-[11px]">Kalibrasi</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); open(row, '/dashboard') }} aria-label={`Buka dashboard ${row.name}`} className="scada-button-secondary px-2 py-1"><ArrowRight className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: kartu per stasiun. */}
                <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
                  {visible.map((row) => (
                    <li key={row.id} className="rounded-card border border-border bg-surface p-4">
                      <button type="button" onClick={() => open(row, '/dashboard')} className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-text-primary">{row.name}</p>
                            <p className="truncate text-xs text-text-secondary">{row.location}</p>
                          </div>
                          <Connection row={row} now={now} compact />
                        </div>
                        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div><dt className="text-text-secondary">Level</dt><dd><Value value={row.level_m} unit="m" digits={3} quality={row.level_quality} /></dd></div>
                          <div><dt className="text-text-secondary">Kecepatan</dt><dd><Value value={row.velocity_ms} unit="m/s" digits={2} quality={row.velocity_quality} /></dd></div>
                          <div><dt className="text-text-secondary">Debit</dt><dd><Value value={row.flow_m3s} unit="m³/s" digits={3} quality={row.flow_quality} /></dd></div>
                        </dl>
                      </button>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                        <div className="flex flex-wrap items-center gap-3"><Alarms row={row} /><Calibration row={row} now={now} /></div>
                        <button type="button" onClick={() => open(row, '/dashboard/calibration')} className="scada-button-secondary px-2.5 py-1 text-[11px]">Kalibrasi</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>}
            </section>
          </>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const CONNECTION_META: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-status-good', text: 'text-status-good' },
  stale: { label: 'Data terhenti', dot: 'bg-status-bad', text: 'text-status-bad' },
  nodata: { label: 'Belum ada data', dot: 'bg-text-secondary', text: 'text-text-secondary' },
}

function Connection({ row, now, compact }: { row: StationOverview; now: number; compact?: boolean }) {
  const state = connectionState(row.last_data_at, now)
  const meta = CONNECTION_META[state]
  return (
    <span className="inline-flex flex-col">
      <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold', meta.text)}>
        <span className={cn('h-2 w-2 rounded-full', meta.dot, state === 'live' && 'motion-safe:animate-pulse')} aria-hidden="true" />
        {meta.label}
      </span>
      {!compact && row.last_data_at && <span className="text-[11px] text-text-secondary">{formatRelativeTime(row.last_data_at)}</span>}
    </span>
  )
}

const QUALITY_LABEL: Partial<Record<Quality, string>> = {
  bad: 'buruk', stale: 'stale', comm_failure: 'gangguan', uncertain: 'ragu',
}

function Value({ value, unit, digits, quality }: { value: number | null; unit: string; digits: number; quality: Quality | null }) {
  if (value == null) {
    return <span className="text-text-secondary">{quality && quality !== 'good' ? <QualityBadge quality={quality} /> : '—'}</span>
  }
  return (
    <span className="inline-flex flex-col items-end tabular-nums">
      <span className={cn('font-semibold', quality && quality !== 'good' ? 'text-text-secondary' : 'text-text-primary')}>
        {value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })}
        <span className="ml-1 text-xs font-normal text-text-secondary">{unit}</span>
      </span>
      {quality && quality !== 'good' && <QualityBadge quality={quality} />}
    </span>
  )
}

function QualityBadge({ quality }: { quality: Quality }) {
  return <span className="rounded bg-accent-yellow/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-yellow">{QUALITY_LABEL[quality] ?? quality}</span>
}

function Alarms({ row }: { row: StationOverview }) {
  if (row.active_alarms === 0) return <span className="inline-flex items-center gap-1 text-xs text-text-secondary"><CheckCircle2 className="h-3.5 w-3.5 text-status-good" /> Tidak ada</span>
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold', row.critical_alarms > 0 ? 'text-accent-red' : 'text-accent-yellow')}>
      <BellRing className="h-3.5 w-3.5" />
      {row.active_alarms} aktif{row.critical_alarms > 0 && ` · ${row.critical_alarms} critical`}
    </span>
  )
}

const CALIBRATION_TONE: Record<CalibrationState, string> = {
  none: 'bg-accent-yellow/15 text-accent-yellow',
  ok: 'bg-status-good/10 text-status-good',
  due_soon: 'bg-accent-blue/10 text-accent-blue',
  overdue: 'bg-accent-red/10 text-accent-red',
}

function Calibration({ row, now }: { row: StationOverview; now: number }) {
  const status = calibrationStatus(row.calibration_at, row.calibration_interval_days, now)
  const detail = status.state === 'none'
    ? 'Memakai hitungan radar'
    : status.state === 'overdue'
      ? `v${row.calibration_version} · lewat ${Math.abs(status.dueInDays ?? 0)} hari`
      : `v${row.calibration_version} · ${status.ageDays} hari lalu`
  return (
    <span className="inline-flex flex-col">
      <span className={cn('w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', CALIBRATION_TONE[status.state])}>{CALIBRATION_LABEL[status.state]}</span>
      <span className="mt-0.5 text-[11px] text-text-secondary">{detail}</span>
    </span>
  )
}

function SummaryTile({ label, value, tone, icon: Icon, active, onClick }: {
  label: string
  value: number
  tone?: 'warning' | 'bad'
  icon?: typeof AlertTriangle
  active: boolean
  onClick: () => void
}) {
  const valueTone = value === 0 || !tone ? 'text-text-primary' : tone === 'bad' ? 'text-accent-red' : 'text-accent-yellow'
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn('scada-card flex items-start justify-between gap-2 text-left transition-colors', active ? 'border-accent-blue ring-1 ring-accent-blue/40' : 'hover:border-accent-blue/40')}>
      <span>
        <span className="block text-xs text-text-secondary">{label}</span>
        <span className={cn('mt-1 block text-2xl font-bold tabular-nums', valueTone)}>{value}</span>
      </span>
      {Icon && <Icon className={cn('h-4 w-4 flex-shrink-0', valueTone)} aria-hidden="true" />}
    </button>
  )
}

function isCalibrationIssue(row: StationOverview, now: number) {
  const state = calibrationStatus(row.calibration_at, row.calibration_interval_days, now).state
  return state !== 'ok'
}

/** Untuk pengurutan: stasiun yang belum pernah dikalibrasi dianggap paling tua. */
function calibrationAge(row: StationOverview, now: number) {
  return calibrationStatus(row.calibration_at, row.calibration_interval_days, now).ageDays ?? Number.MAX_SAFE_INTEGER
}
