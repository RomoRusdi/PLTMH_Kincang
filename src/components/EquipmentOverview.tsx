import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, Clock, Fan, PlugZap, Radar, Server, Waves, type LucideIcon } from 'lucide-react'
import { supabase, type Alarm, type DeviceHealthView, type Station } from '@/lib/supabase'
import { DEVICE_STATE_LABEL, deviceState, type DeviceState } from '@/lib/deviceStatus'
import { cn, formatRelativeTime } from '@/lib/utils'

// ============================================================================
// Overview Peralatan: alur proses stasiun dari saluran sampai jaringan, dengan
// status perangkat dan nilai terkini yang SEBENARNYA. Tahap tanpa perangkat
// atau tanpa data ditampilkan apa adanya ("Belum terhubung"), tidak pernah
// diisi indikator hiasan. Garis alur hanya bergerak bila tahap sebelumnya
// sedang mengirim data baru.
// ============================================================================

type Measurement = { value: number | null; quality: string; timestamp: string }
type MeasMap = Record<string, Measurement>
type Tone = 'good' | 'warn' | 'bad' | 'idle'

interface DeviceDetail { id: string; manufacturer: string | null; model: string | null; modbus_address: number | null }

const TONE_PILL: Record<Tone, string> = {
  good: 'border-status-good/30 bg-status-good/10 text-status-good',
  warn: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  bad: 'border-status-bad/30 bg-status-bad/10 text-status-bad',
  idle: 'border-border bg-surface-2 text-text-secondary',
}
const TONE_DOT: Record<Tone, string> = {
  good: 'bg-status-good',
  warn: 'bg-status-warning',
  bad: 'bg-status-bad',
  idle: 'bg-text-secondary/50',
}
const TONE_ICON: Record<Tone, string> = {
  good: 'bg-status-good/10 text-status-good',
  warn: 'bg-status-warning/10 text-status-warning',
  bad: 'bg-status-bad/10 text-status-bad',
  idle: 'bg-surface-2 text-text-secondary',
}
const STATE_TONE: Record<DeviceState, Tone> = {
  online: 'good',
  offline: 'bad',
  error: 'bad',
  maintenance: 'warn',
  disabled: 'idle',
}
const PROTOCOL_LABEL: Record<string, string> = {
  modbus_rtu: 'Modbus RTU',
  modbus_tcp: 'Modbus TCP',
  mqtt: 'MQTT',
  https: 'HTTPS',
  opc_ua: 'OPC UA',
}

const fmt = (value: number | null | undefined, digits: number) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const isLive = (m: Measurement | undefined) => m?.quality === 'good' && m.value != null

export function EquipmentOverview({ measurements, devices, devicesLoading, alarms, station, powerTag, powerEstimated }: {
  measurements: MeasMap
  devices: DeviceHealthView[]
  devicesLoading: boolean
  alarms: Pick<Alarm, 'tag_id' | 'device_id'>[]
  station: Station | null | undefined
  powerTag: string
  powerEstimated: boolean
}) {
  const stationId = station?.id
  // Merek/model dan alamat Modbus tidak ada di device_health_view.
  const { data: details = [] } = useQuery({
    queryKey: ['devices', 'details', stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('devices').select('id, manufacturer, model, modbus_address').eq('station_id', stationId!)
      if (error) throw error
      return (data ?? []) as DeviceDetail[]
    },
    enabled: !!stationId,
    staleTime: 5 * 60_000,
  })
  const detailOf = (id: string) => details.find((d) => d.id === id)

  const m = measurements
  const radar = devices.filter((d) => d.device_type === 'radar_flowmeter')
  const meters = devices.filter((d) => d.device_type === 'power_meter')
  const control = devices.filter((d) => !['radar_flowmeter', 'power_meter'].includes(d.device_type))

  const onlineCount = devices.filter((d) => deviceState(d) === 'online').length
  const activeDevices = devices.filter((d) => deviceState(d) !== 'disabled').length
  const lastData = useMemo(() => {
    const times = Object.values(m).map((v) => Date.parse(v.timestamp)).filter(Number.isFinite)
    return times.length ? Math.max(...times) : null
  }, [m])

  // Alarm per tahap: dari tag (HYDRO./RADAR./POWER.) atau perangkat (device_offline).
  const alarmsFor = (prefixes: string[], group: DeviceHealthView[]) => alarms.filter((a) =>
    (a.tag_id != null && prefixes.some((p) => a.tag_id!.startsWith(p)))
    || (a.device_id != null && group.some((d) => d.id === a.device_id))).length

  // ---- Tahap 1: saluran -----------------------------------------------------
  const level = m['HYDRO.WATER_LEVEL']
  const velocity = m['HYDRO.VELOCITY']
  const flow = m['HYDRO.FLOW_RATE']
  const designFlow = station?.power_design_flow_m3s ?? null
  const flowPct = isLive(flow) && designFlow ? Math.min(100, (flow!.value! / designFlow) * 100) : null
  const channelLive = isLive(level) || isLive(flow)

  // ---- Tahap 4: turbin & generator -------------------------------------------
  const power = m[powerTag]
  const maxKw = station?.power_max_kw ?? null
  const loadPct = isLive(power) && maxKw ? Math.min(100, (power!.value! / maxKw) * 100) : null
  const frequency = m['POWER.FREQUENCY']
  const generatorState: { label: string; tone: Tone } = !isLive(power)
    ? { label: 'Tidak ada data', tone: 'idle' }
    : (power!.value ?? 0) < (maxKw ? maxKw * 0.05 : 5)
      ? { label: 'Berhenti / standby', tone: 'warn' }
      : { label: powerEstimated ? 'Beroperasi (estimasi)' : 'Beroperasi', tone: 'good' }

  // ---- Tahap 5: energy meter -------------------------------------------------
  const meterLive = ['POWER.ACTIVE_POWER', 'POWER.VOLTAGE', 'POWER.CURRENT'].some((tag) => isLive(m[tag]))

  const stages: StageProps[] = [
    {
      id: 'channel',
      icon: Waves,
      title: 'Saluran pembawa',
      subtitle: 'Kondisi air di titik ukur',
      status: channelLive ? { label: 'Data masuk', tone: 'good' } : { label: 'Menunggu data', tone: 'idle' },
      alarms: alarmsFor(['HYDRO.'], []),
      metrics: [
        { label: 'Level air', value: fmt(level?.value, 3), unit: 'm', live: isLive(level) },
        { label: 'Kecepatan', value: fmt(velocity?.value, 2), unit: 'm/s', live: isLive(velocity), hidden: !velocity },
        { label: 'Debit', value: fmt(flow?.value, 3), unit: 'm³/s', live: isLive(flow) },
      ],
      bar: flowPct == null ? undefined : { label: `${fmt(flowPct, 0)}% dari debit desain ${fmt(designFlow, 2)} m³/s`, pct: flowPct, tone: flowPct >= 100 ? 'warn' : 'good' },
      live: channelLive,
    },
    {
      id: 'radar',
      icon: Radar,
      title: 'Radar flow-meter',
      subtitle: deviceSubtitle(radar[0], detailOf) ?? 'Sensor non-kontak',
      status: groupStatus(radar),
      alarms: alarmsFor(['RADAR.'], radar),
      metrics: [
        { label: 'Jarak ke air', value: fmt(m['HYDRO.AIR_GAP']?.value, 3), unit: 'm', live: isLive(m['HYDRO.AIR_GAP']), hidden: !m['HYDRO.AIR_GAP'] },
        signalMetric(m['RADAR.ECHO_AMPLITUDE']),
        { label: 'Sudut', value: fmt(m['RADAR.ANGLE']?.value, 2), unit: '°', live: isLive(m['RADAR.ANGLE']), hidden: !m['RADAR.ANGLE'] },
        { label: 'Suhu radar', value: fmt(m['RADAR.TEMPERATURE']?.value, 1), unit: '°C', live: isLive(m['RADAR.TEMPERATURE']), hidden: !m['RADAR.TEMPERATURE'] },
      ],
      devices: radar,
      live: radar.some((d) => deviceState(d) === 'online'),
    },
    {
      id: 'control',
      icon: Server,
      title: 'Panel & gateway',
      subtitle: 'Akuisisi data dan pengiriman ke cloud',
      status: groupStatus(control),
      alarms: alarmsFor(['SYS.', 'PANEL.'], control),
      metrics: [
        { label: 'Data terakhir', value: lastData ? formatRelativeTime(lastData) : '—', live: lastData != null && Date.now() - lastData < 5 * 60_000 },
        { label: 'Suhu panel', value: fmt(m['PANEL.TEMPERATURE']?.value, 1), unit: '°C', live: isLive(m['PANEL.TEMPERATURE']), hidden: !m['PANEL.TEMPERATURE'] },
      ],
      devices: control,
      live: control.some((d) => deviceState(d) === 'online'),
    },
    {
      id: 'generator',
      icon: Fan,
      title: 'Turbin & generator',
      subtitle: maxKw ? `Kapasitas ${fmt(maxKw, 0)} kW` : 'Pembangkit',
      status: generatorState,
      alarms: 0,
      metrics: [
        { label: powerEstimated ? 'Daya (estimasi debit)' : 'Daya aktif', value: fmt(power?.value, 1), unit: 'kW', live: isLive(power), emphasis: true },
        { label: 'Frekuensi', value: fmt(frequency?.value, 2), unit: 'Hz', live: isLive(frequency), hidden: !frequency },
      ],
      bar: loadPct == null ? undefined : { label: `Beban ${fmt(loadPct, 0)}% dari kapasitas`, pct: loadPct, tone: loadPct >= 100 ? 'warn' : 'good' },
      spin: generatorState.tone === 'good',
      live: generatorState.tone === 'good',
    },
    {
      id: 'meter',
      icon: PlugZap,
      title: 'Energy meter',
      subtitle: deviceSubtitle(meters[0], detailOf) ?? 'Daya keluaran terukur',
      status: meters.length ? groupStatus(meters) : { label: 'Tidak terpasang', tone: 'idle' },
      alarms: alarmsFor(['POWER.'], meters),
      metrics: meterLive ? [
        { label: 'Tegangan', value: fmt(m['POWER.VOLTAGE']?.value, 1), unit: 'V', live: isLive(m['POWER.VOLTAGE']) },
        { label: 'Arus', value: fmt(m['POWER.CURRENT']?.value, 1), unit: 'A', live: isLive(m['POWER.CURRENT']) },
        { label: 'Faktor daya', value: fmt(m['POWER.POWER_FACTOR']?.value, 2), live: isLive(m['POWER.POWER_FACTOR']) },
      ] : [],
      emptyNote: meterLive ? undefined : 'Belum ada data meter. Daya di stasiun ini dihitung dari debit.',
      devices: meters,
      live: meterLive,
    },
  ]

  return (
    <section className="chart-card" aria-label="Overview peralatan">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-blue">Peralatan lapangan</p>
          <h2 className="mt-1 text-sm font-semibold text-text-primary">Overview peralatan</h2>
          <p className="mt-0.5 text-[11px] text-text-secondary">Alur dari saluran sampai energi listrik, dengan status perangkat dan data terkini.</p>
        </div>
        <div className="status-strip">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', onlineCount === activeDevices && activeDevices > 0 ? 'bg-status-good' : onlineCount > 0 ? 'bg-status-warning' : 'bg-status-bad')} />
            {devicesLoading ? 'Memuat perangkat…' : `${onlineCount}/${activeDevices} perangkat online`}
          </span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{lastData ? `Data ${formatRelativeTime(lastData)}` : 'Belum ada data'}</span>
          <span className={cn('inline-flex items-center gap-1', alarms.length > 0 && 'text-status-warning')}><Bell className="h-3 w-3" aria-hidden="true" />{alarms.length} alarm aktif</span>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))] xl:gap-0">
        {stages.map((stage, index) => (
          <li key={stage.id} className="relative flex min-w-0 xl:pr-6 xl:last:pr-0">
            <Stage {...stage} />
            {index < stages.length - 1 && <Connector active={stage.live} />}
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------

interface Metric { label: string; value: string; unit?: string; live: boolean; hidden?: boolean; emphasis?: boolean; tone?: Tone; hint?: string }

interface StageProps {
  id: string
  icon: LucideIcon
  title: string
  subtitle: string
  status: { label: string; tone: Tone }
  alarms: number
  metrics: Metric[]
  bar?: { label: string; pct: number; tone: Tone }
  emptyNote?: string
  devices?: DeviceHealthView[]
  spin?: boolean
  live: boolean
}

function Stage({ icon: Icon, title, subtitle, status, alarms, metrics, bar, emptyNote, devices, spin }: StageProps) {
  const shown = metrics.filter((metric) => !metric.hidden)
  return (
    <div className="flex w-full min-w-0 flex-col rounded-card border border-border bg-surface-2/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-input', TONE_ICON[status.tone])}>
          <Icon className={cn('h-[18px] w-[18px]', spin && 'animate-[spin_3s_linear_infinite]')} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold leading-tight text-text-primary">{title}</h3>
          <p className="truncate text-[10px] text-text-secondary" title={subtitle}>{subtitle}</p>
        </div>
        {alarms > 0 && (
          <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-status-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-status-warning" title={`${alarms} alarm aktif terkait`}>
            <Bell className="h-2.5 w-2.5" aria-hidden="true" />{alarms}
          </span>
        )}
      </div>

      <span className={cn('mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold', TONE_PILL[status.tone])}>
        <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[status.tone], status.tone === 'good' && 'animate-pulse')} />
        {status.label}
      </span>

      {shown.length > 0 && (
        <dl className="mt-3 space-y-1.5">
          {shown.map((metric) => (
            <div key={metric.label} className="flex items-baseline justify-between gap-2" title={metric.hint}>
              <dt className="truncate text-[11px] text-text-secondary">{metric.label}</dt>
              <dd className={cn('flex-shrink-0 tabular-nums', metric.emphasis ? 'text-base font-bold text-accent-yellow' : 'text-xs font-semibold text-text-primary',
                !metric.live && 'opacity-50', metric.tone === 'warn' && 'text-status-warning', metric.tone === 'bad' && 'text-status-bad')}>
                {metric.value}{metric.unit && <span className="ml-0.5 text-[10px] font-normal text-text-secondary">{metric.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {emptyNote && <p className="mt-3 text-[11px] leading-snug text-text-secondary">{emptyNote}</p>}

      {bar && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-border/60" role="progressbar" aria-valuenow={Math.round(bar.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={bar.label}>
            <div className={cn('h-full rounded-full transition-[width] duration-500', bar.tone === 'warn' ? 'bg-status-warning' : 'bg-accent-blue')} style={{ width: `${Math.max(2, bar.pct)}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-text-secondary">{bar.label}</p>
        </div>
      )}

      {devices && devices.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2.5">
          {devices.map((device) => <DeviceRow key={device.id} device={device} />)}
        </ul>
      )}
    </div>
  )
}

function DeviceRow({ device }: { device: DeviceHealthView }) {
  const state = deviceState(device)
  const tone = STATE_TONE[state]
  const seen = device.last_seen ? formatRelativeTime(device.last_seen) : 'belum pernah'
  return (
    <li className="flex items-center gap-2 text-[10px]" title={`${PROTOCOL_LABEL[device.protocol] ?? device.protocol} · scan tiap ${device.scan_interval_sec} detik`}>
      <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', TONE_DOT[tone])} />
      <span className="min-w-0 flex-1 truncate text-text-primary">{device.name}</span>
      <span className={cn('flex-shrink-0', tone === 'bad' ? 'text-status-bad' : 'text-text-secondary')}>
        {state === 'online' ? seen : DEVICE_STATE_LABEL[state]}
      </span>
    </li>
  )
}

/** Garis alur antar tahap (hanya di layar lebar); bergerak bila tahap kiri sedang live. */
function Connector({ active }: { active: boolean }) {
  return (
    <svg className="pointer-events-none absolute right-0 top-[38px] hidden h-3 w-6 xl:block" viewBox="0 0 24 12" aria-hidden="true">
      <path d="M1 6H19" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4"
        className={cn(active ? 'animate-flow-dash text-accent-blue' : 'text-border')} />
      <path d="M17 2 23 6 17 10Z" className={active ? 'fill-accent-blue' : 'fill-border'} />
    </svg>
  )
}

function groupStatus(group: DeviceHealthView[]): { label: string; tone: Tone } {
  if (group.length === 0) return { label: 'Tidak ada perangkat', tone: 'idle' }
  const states = group.map(deviceState)
  const active = states.filter((s) => s !== 'disabled')
  if (active.length === 0) return { label: 'Nonaktif', tone: 'idle' }
  const online = active.filter((s) => s === 'online').length
  if (online === active.length) return { label: 'Online', tone: 'good' }
  if (online > 0) return { label: `${online}/${active.length} online`, tone: 'warn' }
  if (active.some((s) => s === 'maintenance')) return { label: 'Maintenance', tone: 'warn' }
  return { label: 'Offline', tone: 'bad' }
}

function deviceSubtitle(device: DeviceHealthView | undefined, detailOf: (id: string) => DeviceDetail | undefined): string | null {
  if (!device) return null
  const detail = detailOf(device.id)
  const model = [detail?.manufacturer, detail?.model].filter(Boolean).join(' ')
  const bus = [PROTOCOL_LABEL[device.protocol] ?? device.protocol, detail?.modbus_address != null ? `slave ${detail.modbus_address}` : null].filter(Boolean).join(' ')
  return [model || null, bus].filter(Boolean).join(' · ') || null
}

/** Kualitas sinyal radar: normal ≥ 75 dB, lemah 70–75, buruk < 70 (spesifikasi radar Singgi). */
function signalMetric(amplitude: Measurement | undefined): Metric {
  const value = amplitude?.value
  const tone: Tone | undefined = value == null ? undefined : value < 70 ? 'bad' : value < 75 ? 'warn' : undefined
  return {
    label: 'Sinyal radar',
    value: fmt(value, 0),
    unit: 'dB',
    live: isLive(amplitude),
    hidden: !amplitude,
    tone,
    hint: 'Amplitudo echo: normal ≥ 75 dB, lemah 70–75 dB, buruk < 70 dB',
  }
}

