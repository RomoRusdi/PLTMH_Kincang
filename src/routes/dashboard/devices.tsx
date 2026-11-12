import { createFileRoute } from '@tanstack/react-router'
import { useStationId } from '@/lib/station'
import { Activity, AlertTriangle, CheckCircle2, CircleOff, Cpu, RefreshCw, Search, Settings2, SlidersHorizontal, Wifi, WifiOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDeviceStatus } from '@/lib/monitoring'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, LoadingState } from '@/components/UiState'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { DeviceHealthView } from '@/lib/supabase'
import { DEVICE_STATE_LABEL, deviceState, isAttentionState, isOfflineState, type DeviceState } from '@/lib/deviceStatus'

export const Route = createFileRoute('/dashboard/devices')({ component: DevicesPage })

const DEVICE_TYPE_LABEL: Record<string, string> = { radar_flowmeter: 'Radar flowmeter', power_meter: 'Power meter', plc: 'PLC kontrol', gateway: 'Gateway', modem: 'Modem' }
const PROTOCOL_LABEL: Record<string, string> = { modbus_rtu: 'Modbus RTU', modbus_tcp: 'Modbus TCP', mqtt: 'MQTT', https: 'HTTPS', opc_ua: 'OPC UA' }
const STATUS_META: Record<DeviceState, { tone: string; dot: string; icon: typeof Cpu }> = {
  online: { tone: 'text-status-good', dot: 'bg-status-good', icon: CheckCircle2 },
  offline: { tone: 'text-status-bad', dot: 'bg-status-bad', icon: WifiOff },
  error: { tone: 'text-accent-red', dot: 'bg-accent-red', icon: AlertTriangle },
  maintenance: { tone: 'text-accent-yellow', dot: 'bg-accent-yellow', icon: Settings2 },
  disabled: { tone: 'text-accent-yellow', dot: 'bg-text-secondary/50', icon: CircleOff },
}
type Filter = 'all' | 'online' | 'offline' | 'attention'
type Sort = 'name' | 'status' | 'last_seen'

function DevicesPage() {
  const STATION_ID = useStationId()
  const { devices, totalCount, isLoading, isError, refetch } = useDeviceStatus(STATION_ID)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const onlineCount = devices.filter((device) => deviceState(device) === 'online').length
  const offlineCount = devices.filter((device) => isOfflineState(deviceState(device))).length
  const attentionCount = devices.filter((device) => isAttentionState(deviceState(device))).length
  const filteredDevices = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return devices.filter((device) => {
      if (needle && !`${device.name} ${device.device_type} ${device.protocol}`.toLowerCase().includes(needle)) return false
      const state = deviceState(device)
      if (filter === 'online' && state !== 'online') return false
      if (filter === 'offline' && !isOfflineState(state)) return false
      return filter !== 'attention' || isAttentionState(state)
    }).sort((a, b) => sort === 'last_seen' ? (b.last_seen ?? '').localeCompare(a.last_seen ?? '') : sort === 'status' ? Number(b.is_online) - Number(a.is_online) || a.status.localeCompare(b.status) : a.name.localeCompare(b.name))
  }, [devices, filter, search, sort])

  return <div className="app-surface flex h-full flex-col">
    <PageHeader title="Perangkat" subtitle="Pantau konektivitas dan kesehatan perangkat lapangan" actions={<div className="flex items-center gap-2"><span className="hidden text-xs text-text-secondary sm:inline">Update otomatis setiap 15 detik</span><button type="button" onClick={() => void refetch()} aria-label="Refresh status perangkat" className="scada-button-secondary"><RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} /> Refresh</button></div>} />
    <div className="dashboard-shell flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px] space-y-5">
      <section aria-label="Ringkasan perangkat" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Total perangkat" value={totalCount} detail="Terdaftar di stasiun" icon={Cpu} tone="text-accent-blue" />
        <SummaryCard label="Online" value={onlineCount} detail={totalCount ? `${Math.round((onlineCount / totalCount) * 100)}% dari total` : 'Belum ada data'} icon={Wifi} tone="text-status-good" />
        <SummaryCard label="Offline" value={offlineCount} detail={offlineCount ? 'Perlu diperiksa' : 'Tidak ada yang terputus'} icon={WifiOff} tone="text-status-bad" />
        <SummaryCard label="Perlu perhatian" value={attentionCount} detail={attentionCount ? 'Error, maintenance, atau nonaktif' : 'Tidak ada masalah'} icon={AlertTriangle} tone="text-accent-yellow" />
      </section>

      <section className="scada-card space-y-4" aria-label="Filter perangkat">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-sm font-semibold text-text-primary">Daftar perangkat</h2><p className="mt-0.5 text-xs text-text-secondary">{filteredDevices.length} dari {totalCount} perangkat ditampilkan</p></div><div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" aria-hidden="true" /><span className="sr-only">Cari perangkat</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, tipe, protokol…" className="scada-input pl-9" /></label>
          <label className="relative sm:w-44"><SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" aria-hidden="true" /><span className="sr-only">Urutkan perangkat</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="scada-input appearance-none pl-9"><option value="name">Urutkan: Nama</option><option value="status">Urutkan: Status</option><option value="last_seen">Urutkan: Terakhir terlihat</option></select></label>
        </div></div>
        <div className="flex flex-wrap gap-2" aria-label="Filter status perangkat"><FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="Semua" count={totalCount} /><FilterButton active={filter === 'online'} onClick={() => setFilter('online')} label="Online" count={onlineCount} tone="good" /><FilterButton active={filter === 'offline'} onClick={() => setFilter('offline')} label="Offline" count={offlineCount} tone="bad" /><FilterButton active={filter === 'attention'} onClick={() => setFilter('attention')} label="Perlu perhatian" count={attentionCount} tone="warning" /></div>
      </section>

      {isError ? <div className="rounded-card border border-accent-red/30 bg-accent-red/5 p-6 text-sm text-accent-red" role="alert">Gagal memuat status perangkat. <button type="button" onClick={() => void refetch()} className="font-medium underline">Coba lagi</button></div> : isLoading ? <LoadingState label="Memuat status perangkat…" /> : devices.length === 0 ? <EmptyState title="Tidak ada perangkat terdaftar" description="Perangkat yang terhubung ke stasiun ini akan muncul di sini." /> : filteredDevices.length === 0 ? <EmptyState title="Perangkat tidak ditemukan" description="Ubah kata kunci atau filter status untuk melihat perangkat lain." /> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{filteredDevices.map((device) => <DeviceCard key={device.id} device={device} />)}</div>}
    </div></div>
  </div>
}

function SummaryCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof Cpu; tone: string }) {
  return <div className="scada-card flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-text-secondary">{label}</p><p className={cn('mt-1 text-2xl font-bold tabular-nums', tone)}>{value}</p><p className="mt-1 truncate text-[10px] text-text-secondary">{detail}</p></div><Icon className={cn('h-5 w-5 flex-shrink-0', tone)} aria-hidden="true" /></div>
}

function FilterButton({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: 'good' | 'bad' | 'warning' }) {
  const countTone = tone === 'good' ? 'text-status-good' : tone === 'bad' ? 'text-status-bad' : tone === 'warning' ? 'text-accent-yellow' : 'text-text-secondary'
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn('inline-flex items-center gap-2 rounded-input border px-3 py-1.5 text-xs transition-colors', active ? 'border-accent-blue bg-accent-blue/10 text-accent-blue' : 'border-border text-text-secondary hover:border-accent-blue/50 hover:text-text-primary')}>{label}<span className={cn('tabular-nums', active ? 'text-accent-blue' : countTone)}>{count}</span></button>
}

// Halaman ini hanya memantau; sistem tidak mengirim perintah ke perangkat lapangan.
function DeviceCard({ device }: { device: DeviceHealthView }) {
  const state = deviceState(device)
  const meta = STATUS_META[state]
  const StatusIcon = meta.icon
  return <article className={cn('scada-card scada-card-interactive space-y-4', !device.enabled && 'border-accent-yellow/50')}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className={cn('mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full', meta.dot, state === 'online' && 'shadow-[0_0_0_3px_hsl(var(--accent-green)/0.12)]')} aria-hidden="true" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-text-primary">{device.name}</h3><p className="mt-0.5 truncate text-xs text-text-secondary">{DEVICE_TYPE_LABEL[device.device_type] ?? device.device_type}</p></div></div><span className={cn('inline-flex flex-shrink-0 items-center gap-1.5 text-xs font-medium', meta.tone)}><StatusIcon className="h-3.5 w-3.5" aria-hidden="true" /> {DEVICE_STATE_LABEL[state]}</span></div>
    <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border py-3 text-xs"><InfoItem label="Protokol" value={PROTOCOL_LABEL[device.protocol] ?? device.protocol} mono /><InfoItem label="Interval scan" value={`${device.scan_interval_sec}s`} /><InfoItem label="Firmware" value={device.firmware_version ?? '—'} /><InfoItem label="Terakhir terlihat" value={device.last_seen ? formatRelativeTime(device.last_seen) : 'Belum ada data'} valueTone={state === 'online' ? 'text-status-good' : state === 'disabled' ? 'text-text-secondary' : 'text-status-bad'} /></div>
    <details className="group text-xs"><summary className="cursor-pointer list-none font-medium text-text-secondary hover:text-accent-blue"><span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>Detail teknis</summary><div className="mt-3 grid grid-cols-2 gap-3 rounded-input bg-surface-2 p-3"><InfoItem label="ID perangkat" value={device.id} mono /><InfoItem label="ID stasiun" value={device.station_id ?? '—'} mono /><InfoItem label="Menit sejak terlihat" value={device.minutes_since_last_seen == null ? '—' : `${Math.round(device.minutes_since_last_seen)} menit`} /><InfoItem label="Status konfigurasi" value={device.enabled ? 'Enabled' : 'Disabled'} /></div></details>
    <div className="flex items-center justify-between gap-3"><div className={cn('flex items-center gap-1.5 text-[10px]', device.enabled ? 'text-text-secondary' : 'text-accent-yellow')}>{device.enabled ? <Activity className="h-3.5 w-3.5" /> : <CircleOff className="h-3.5 w-3.5" />}{device.enabled ? 'Monitoring aktif' : 'Monitoring dinonaktifkan'}</div></div>
  </article>
}

function InfoItem({ label, value, mono, valueTone = 'text-text-primary' }: { label: string; value: string; mono?: boolean; valueTone?: string }) { return <div className="min-w-0"><p className="text-[10px] text-text-secondary">{label}</p><p className={cn('mt-0.5 truncate', valueTone, mono && 'font-mono')}>{value}</p></div> }