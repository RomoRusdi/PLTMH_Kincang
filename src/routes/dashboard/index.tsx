import { createFileRoute } from '@tanstack/react-router'
import { useStation, useStationId } from '@/lib/station'
import { isAtCapacity } from '@/lib/powerEstimate'
import { useBrand } from '@/lib/brand'
import { TELEMETRY_TONE, markOldMeasurements, telemetryStatus, useNow } from '@/lib/stationStatus'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { PowerForecastPanel } from '@/components/PowerForecastPanel'
import { AiPredictionPanel } from '@/components/AiPredictionPanel'
import { EquipmentOverview } from '@/components/EquipmentOverview'
import { TrendChartCard } from '@/components/TrendChartCard'
import { EnergyMeterSection, RadarPanelSection } from '@/components/DashboardDetails'
import { useLatestMeasurements, useAlarms, useDeviceStatus, useTrendData, useAcknowledgeAlarm, useKpiData } from '@/lib/monitoring'
import { useAuth } from '@/lib/auth'
import { FlowCard, IconStatCard, LevelCard, PowerCard, VelocityCard } from '@/components/MetricCards'
import { AlarmList } from '@/components/AlarmBadge'
import { PageHeader } from '@/components/PageHeader'
import { cn, formatTimestamp, formatRelativeTime } from '@/lib/utils'
import { predictPower } from '@/lib/forecast'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/dashboard/')({ component: DashboardPage })


function DashboardPage() {
  const STATION_ID = useStationId()
  const brand = useBrand()
  const { profile, canAccess } = useAuth()
  const { data: latest, isConnected, lastUpdate, error: measurementError } = useLatestMeasurements(STATION_ID)
  // Nilai yang lama tidak diperbarui ditandai stale agar tidak terbaca sebagai data terkini.
  const now = useNow()
  const m = useMemo(() => markOldMeasurements(latest, now), [latest, now])
  const telemetry = telemetryStatus(isConnected, latest, now)
  // Selama energy meter belum mengirim data, daya diperkirakan dari debit
  // (tag HYDRO.POWER_EST, migrasi 005). Nilai terukur selalu didahulukan.
  const powerEstimated = m['POWER.ACTIVE_POWER']?.quality !== 'good' && m['HYDRO.POWER_EST'] != null
  const powerTag = powerEstimated ? 'HYDRO.POWER_EST' : 'POWER.ACTIVE_POWER'
  const { alarms, count: alarmCount, hasCritical, isLoading: alarmsLoading } = useAlarms(STATION_ID)
  const { devices, onlineCount, totalCount, isLoading: devicesLoading } = useDeviceStatus(STATION_ID)
  const { data: stationKpi } = useKpiData(STATION_ID, 24)
  const { trendFrom, trendTo } = useMemo(() => {
    const to = Date.now()
    return {
      trendFrom: new Date(to - 6 * 3600 * 1000).toISOString(),
      trendTo: new Date(to).toISOString(),
    }
  }, [])
  const { data: trendData, isLoading: trendLoading, isError: trendError } = useTrendData('HYDRO.WATER_LEVEL', trendFrom, trendTo, 15)
  const { data: powerTrendData, isLoading: powerForecastLoading, isError: powerForecastError } = useTrendData(powerTag, trendFrom, trendTo, 15)
  const { data: flowTrendData, isLoading: flowTrendLoading, isError: flowTrendError } = useTrendData('HYDRO.FLOW_RATE', trendFrom, trendTo, 15)
  const ackMutation = useAcknowledgeAlarm(STATION_ID)
  const [ackingId, setAckingId] = useState<string | null>(null)

  async function handleAck(alarmId: string) {
    setAckingId(alarmId)
    try {
      await ackMutation.mutateAsync({ alarmId })
    } finally {
      setAckingId(null)
    }
  }

  // get_trend_data sudah mengurutkan bucket naik (lama → baru); jangan dibalik,
  // agar sumbu waktu berjalan kiri → kanan dan titik "+1j" berada setelah data terbaru.
  const chartData = (trendData ?? []).map((p) => ({
    time: formatTimestamp(p.bucket, 'HH:mm'), avg: p.avg_value,
  }))

  const flowChartData = (flowTrendData ?? []).map((p) => ({
    time: formatTimestamp(p.bucket, 'HH:mm'), avg: p.avg_value,
  }))

  const powerChartData = (powerTrendData ?? []).map((p) => ({
    time: formatTimestamp(p.bucket, 'HH:mm'), avg: p.avg_value,
  }))

  const { station } = useStation()
  const powerForecast = useMemo(() => predictPower(
    (powerTrendData ?? []).map((point) => point.avg_value ?? Number.NaN),
    1, 0.25, station?.power_max_kw,
  ), [powerTrendData, station?.power_max_kw])

  const panelTemp = m['PANEL.TEMPERATURE']?.value
  const panelTempColor = panelTemp == null ? 'text-text-secondary'
    : panelTemp >= 55 ? 'text-accent-red'
    : panelTemp >= 45 ? 'text-accent-yellow' : 'text-status-good'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Dashboard — ${brand.name}`}
        subtitle={`Selamat datang, ${profile?.full_name ?? profile?.role ?? 'User'}`}
        actions={
          <div className="flex items-center gap-3">
            {/* Sama dengan status telemetry di sidebar (Terhubung / Ready / Terputus). */}
            <div title={telemetry.detail} className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border',
              telemetry.state === 'connected' ? 'text-status-good border-status-good/30 bg-status-good/10'
                : telemetry.state === 'ready' ? 'text-status-warning border-status-warning/30 bg-status-warning/10'
                  : 'text-status-bad border-status-bad/30 bg-status-bad/10')}>
              {telemetry.state === 'disconnected' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              {telemetry.label}
            </div>
            {lastUpdate && (
              <span className="text-[10px] text-text-secondary hidden sm:block">
                <RefreshCw className="w-3 h-3 inline mr-1" />{formatRelativeTime(lastUpdate)}
              </span>
            )}
          </div>
        }
      />
      <main className="dashboard-shell min-h-full w-full max-w-[1920px] mx-auto p-3 sm:p-6 lg:p-8 space-y-5 sm:space-y-6">
        {measurementError && <div className="rounded-card border border-accent-orange/30 bg-accent-orange/5 px-4 py-3 text-xs text-accent-orange" role="status">Data sensor sementara tidak tersedia: {measurementError}</div>}
        <section className="dashboard-hero" aria-label="Status ringkas stasiun">
          <div className="relative z-[1] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-blue">Operational overview</p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-text-primary sm:text-xl">Kondisi stasiun saat ini</h2>
              <p className="mt-1 text-xs text-text-secondary">Ringkasan telemetry, alarm, dan perangkat lapangan dalam satu tampilan.</p>
            </div>
            <div className="status-strip relative z-[1] sm:min-w-[280px] sm:justify-end">
              <span className="inline-flex items-center gap-1.5" title={telemetry.detail}><span className={cn('h-2 w-2 rounded-full', TELEMETRY_TONE[telemetry.state].dot, telemetry.state === 'connected' && 'animate-pulse')} />Telemetry {telemetry.label.toLowerCase()}</span>
              <span>{onlineCount}/{totalCount || 0} perangkat online</span>
              <span className={cn(hasCritical ? 'text-accent-red' : 'text-text-secondary')}>{alarmCount} alarm aktif</span>
            </div>
          </div>
        </section>
        {/* KPI row */}
        <DashKpi m={m} panelTempColor={panelTempColor} powerTag={powerTag} powerEstimated={powerEstimated}
          levelHistory={chartData.map((p) => p.avg)} powerHistory={powerChartData.map((p) => p.avg)} />
        {/* Superadmin melihat estimasi pendapatan di sini; akun stasiun
            melihatnya di Trend & History dengan opsi sembunyikan. */}
        {profile?.role === 'superadmin' && <PowerForecastPanel
          forecast={powerForecast}
          currentPowerKw={m[powerTag]?.quality === 'good' ? (m[powerTag]?.value ?? null) : null}
          estimated={powerEstimated}
          dailyEnergyKwh={stationKpi?.daily_energy ?? null}
          loading={powerForecastLoading}
          hasHistory={powerChartData.some((point) => point.avg != null)}
        />}
        {/* Prediksi model AI (tabel predictions), terpisah dari estimasi regresi linear di atas. */}
        <AiPredictionPanel />
        {/* Trend (atas-bawah) + alarm */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-4 xl:gap-6 items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <TrendChartCard title="Level Air" subtitle="6 jam terakhir · rata-rata per 15 menit" data={chartData} unit="m" precision={2}
              color="accent-blue" seriesName="Level air" loading={trendLoading} error={trendError}
              emptyText="Belum ada data level air dalam 6 jam terakhir" />
            <TrendChartCard title="Debit" subtitle="6 jam terakhir · rata-rata per 15 menit" data={flowChartData} unit="m³/s" precision={2}
              color="accent-green" seriesName="Debit" loading={flowTrendLoading} error={flowTrendError}
              emptyText="Belum ada data debit dalam 6 jam terakhir" />
            <TrendChartCard title={powerEstimated ? 'Daya Estimasi dari Debit' : 'Daya Aktif'} subtitle="6 jam terakhir · titik +1 jam adalah estimasi"
              data={powerChartData} unit="kW" precision={0} color="accent-yellow" seriesName={powerEstimated ? 'Daya estimasi' : 'Daya aktif'}
              loading={powerForecastLoading} error={powerForecastError} emptyText="Menunggu histori daya"
              forecast={{ label: '+1j', value: powerForecast.powerKw }} />
          </div>
          <div className="chart-card flex min-h-[300px] flex-col lg:sticky lg:top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-text-primary">Alarm Aktif</h2>
              <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
                hasCritical ? 'bg-accent-red/20 text-accent-red' : 'bg-surface-2 text-text-secondary')}>
                {alarmCount}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AlarmList alarms={alarms} loading={alarmsLoading}
                onAck={canAccess('acknowledgeAlarm') ? (id) => { void handleAck(id) } : undefined}
                ackingId={ackingId} canAck={canAccess('acknowledgeAlarm')} maxRows={6} />
            </div>
          </div>
        </div>
        {/* Alur proses + status perangkat lapangan */}
        <EquipmentOverview measurements={m} devices={devices} devicesLoading={devicesLoading} alarms={alarms}
          station={station} powerTag={powerTag} powerEstimated={powerEstimated} />
        {/* Energy meter dan detail radar/panel (hanya tag yang ada) */}
        <EnergyMeterSection m={m} />
        <RadarPanelSection m={m} />
      </main>
    </div>
  )
}


// ---------------------------------------------------------------------------

type MeasMap = Record<string, { value: number | null; quality: string; timestamp: string }>

function DashKpi({ m, panelTempColor, powerTag, powerEstimated, levelHistory, powerHistory }: {
  m: MeasMap; panelTempColor: string; powerTag: string; powerEstimated: boolean
  levelHistory: (number | null)[]; powerHistory: (number | null)[]
}) {
  const { station } = useStation()
  const power = m[powerTag]
  const overCapacity = powerEstimated && power?.quality === 'good' && isAtCapacity(power.value, station?.power_max_kw)
  // Daya terukur dari HMI: tampilkan estimasi debit sebagai pembanding.
  const estimate = m['HYDRO.POWER_EST']
  const powerDetail = !powerEstimated && estimate?.quality === 'good'
    ? `Estimasi dari debit: ${(estimate.value ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })} kW`
    : undefined
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-blue">Live telemetry</p><h2 className="mt-1 text-sm font-semibold text-text-primary">Hidrologi & energi</h2></div><span className="hidden text-[10px] text-text-secondary sm:block">Nilai terakhir diterima dari gateway</span></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <LevelCard measurement={m['HYDRO.WATER_LEVEL']} history={levelHistory} to="/dashboard/trend" />
        <VelocityCard measurement={m['HYDRO.VELOCITY']} to="/dashboard/trend" />
        <FlowCard measurement={m['HYDRO.FLOW_RATE']} designFlow={station?.power_design_flow_m3s ?? null} to="/dashboard/trend" />
        <PowerCard title={powerEstimated ? 'Daya (estimasi dari debit)' : 'Daya aktif'} measurement={power} history={powerHistory}
          maxKw={station?.power_max_kw ?? null} detail={powerDetail} to="/dashboard/trend"
          note={overCapacity ? 'Melebihi kapasitas turbin: debit di atas kemampuan turbin, ditampilkan sebesar kapasitas' : undefined} />
        <IconStatCard title="Energi kumulatif" icon="energy" measurement={m['POWER.ENERGY_KWH']} unit="kWh" digits={1}
          caption="Total dari energy meter" iconClass="bg-accent-orange/10 text-accent-orange" />
        <IconStatCard title="Suhu panel" icon="temperature" measurement={m['PANEL.TEMPERATURE']} unit="°C" digits={1}
          caption={panelTempCaption(m['PANEL.TEMPERATURE']?.value)} valueClass={panelTempColor} iconClass="bg-accent-purple/10 text-accent-purple" />
      </div>
    </section>
  )
}

/** Keterangan suhu panel: batas sama dengan warna angka (45 / 55 °C). */
function panelTempCaption(value: number | null | undefined): string {
  if (value == null) return 'Sensor suhu panel'
  return value >= 55 ? 'Panas, periksa kipas panel' : value >= 45 ? 'Hangat' : 'Normal'
}



