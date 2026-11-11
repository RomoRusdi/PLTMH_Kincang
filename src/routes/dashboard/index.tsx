import { createFileRoute } from '@tanstack/react-router'
import { useStationId } from '@/lib/station'
import { markOldMeasurements, useNow } from '@/lib/stationStatus'
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Banknote, TrendingUp, Wifi, WifiOff, RefreshCw, Zap } from 'lucide-react'
import { useLatestMeasurements, useAlarms, useDeviceStatus, useTrendData, useAcknowledgeAlarm, useKpiData } from '@/lib/monitoring'
import { useAuth } from '@/lib/auth'
import { KpiCard, qualityLabel } from '@/components/KpiCard'
import { AlarmList } from '@/components/AlarmBadge'
import { PageHeader } from '@/components/PageHeader'
import { cn, formatTimestamp, formatRelativeTime } from '@/lib/utils'
import { predictPower } from '@/lib/forecast'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

export const Route = createFileRoute('/dashboard/')({ component: DashboardPage })


function DashboardPage() {
  const STATION_ID = useStationId()
  const { profile, canAccess } = useAuth()
  const { data: latest, isConnected, lastUpdate, error: measurementError } = useLatestMeasurements(STATION_ID)
  // Nilai yang lama tidak diperbarui ditandai stale agar tidak terbaca sebagai data terkini.
  const now = useNow()
  const m = useMemo(() => markOldMeasurements(latest, now), [latest, now])
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

  const chartData = (trendData ?? []).map((p) => ({
    time: formatTimestamp(p.bucket, 'HH:mm'), avg: p.avg_value,
  })).reverse()

  const powerChartData = (powerTrendData ?? []).map((p) => ({
    time: formatTimestamp(p.bucket, 'HH:mm'), avg: p.avg_value,
  })).reverse()

  const powerForecast = useMemo(() => predictPower(
    (powerTrendData ?? []).map((point) => point.avg_value ?? Number.NaN),
  ), [powerTrendData])

  const panelTemp = m['PANEL.TEMPERATURE']?.value
  const panelTempColor = panelTemp == null ? 'text-text-secondary'
    : panelTemp >= 55 ? 'text-accent-red'
    : panelTemp >= 45 ? 'text-accent-yellow' : 'text-status-good'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Dashboard — ${import.meta.env.VITE_APP_NAME ?? 'SCADA'}`}
        subtitle={`Selamat datang, ${profile?.full_name ?? profile?.role ?? 'User'}`}
        actions={
          <div className="flex items-center gap-3">
            <div className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border',
              isConnected ? 'text-status-good border-status-good/30 bg-status-good/10'
                          : 'text-status-bad border-status-bad/30 bg-status-bad/10')}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? 'Live' : 'Offline'}
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
              <span className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-status-good animate-pulse' : 'bg-status-bad')} />{isConnected ? 'Telemetry live' : 'Telemetry offline'}</span>
              <span>{onlineCount}/{totalCount || 0} perangkat online</span>
              <span className={cn(hasCritical ? 'text-accent-red' : 'text-text-secondary')}>{alarmCount} alarm aktif</span>
            </div>
          </div>
        </section>
        {/* KPI row */}
        <DashKpi m={m} panelTempColor={panelTempColor} powerTag={powerTag} powerEstimated={powerEstimated} />
        <PowerForecastPanel
          forecast={powerForecast}
          currentPowerKw={m[powerTag]?.quality === 'good' ? (m[powerTag]?.value ?? null) : null}
          estimated={powerEstimated}
          dailyEnergyKwh={stationKpi?.daily_energy ?? null}
          loading={powerForecastLoading}
          hasHistory={powerChartData.some((point) => point.avg != null)}
        />
        {/* Trend + alarms */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-4 xl:gap-6 items-stretch">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
            <TrendPanel chartData={chartData} trendLoading={trendLoading} trendError={trendError} />
            <PowerTrendPanel chartData={powerChartData} forecast={powerForecast} trendLoading={powerForecastLoading} trendError={powerForecastError} estimated={powerEstimated} />
          </div>
          <div className="chart-card flex min-h-[300px] flex-col">
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
        {/* Devices */}
        <DevicePanel devices={devices} onlineCount={onlineCount} totalCount={totalCount} loading={devicesLoading} />
        <EquipmentOverview measurements={m} devicesOnline={onlineCount > 0} />
        {/* Secondary */}
        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Energy Meter</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Tegangan" value={m['POWER.VOLTAGE']?.value} unit="V" precision={1} quality={m['POWER.VOLTAGE']?.quality} colorClass="text-accent-orange" />
            <KpiCard label="Arus" value={m['POWER.CURRENT']?.value} unit="A" precision={2} quality={m['POWER.CURRENT']?.quality} colorClass="text-accent-orange" />
            <KpiCard label="Frekuensi" value={m['POWER.FREQUENCY']?.value} unit="Hz" precision={2} quality={m['POWER.FREQUENCY']?.quality} colorClass="text-accent-purple" />
            <KpiCard label="Power Factor" value={m['POWER.POWER_FACTOR']?.value} unit="PF" precision={2} quality={m['POWER.POWER_FACTOR']?.quality} colorClass="text-accent-purple" />
          </div>
        </section>
        <section>
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Radar & Panel</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Volume Kumulatif" value={m['HYDRO.VOLUME']?.value} unit="m³" precision={0} quality={m['HYDRO.VOLUME']?.quality} colorClass="text-accent-blue" />
            <KpiCard label="Jarak Sensor ke Air" value={m['HYDRO.AIR_GAP']?.value} unit="m" precision={3} quality={m['HYDRO.AIR_GAP']?.quality} colorClass="text-accent-blue" />
            <StatusTile label="Arah Aliran" tag={m['HYDRO.FLOW_DIRECTION']} text={(v) => (v === 1 ? 'Melawan arus' : 'Searah aliran')} />
            <StatusTile label="Kipas Panel" tag={m['PANEL.FAN_STATUS']} text={(v) => (v === 1 ? 'Menyala' : 'Mati')} />
            <StatusTile label="Komunikasi Radar" tag={m['SYS.RADAR_COMM']} text={(v) => (v === 0 ? 'Normal' : 'Terputus')} bad={(v) => v !== 0} />
          </div>
        </section>
      </main>
    </div>
  )
}

function EquipmentOverview({ measurements, devicesOnline }: { measurements: MeasMap; devicesOnline: boolean }) {
  const waterLevel = measurements['HYDRO.WATER_LEVEL']?.value
  const flow = measurements['HYDRO.FLOW_RATE']?.value
  const power = measurements['POWER.ACTIVE_POWER']?.value
  const frequency = measurements['POWER.FREQUENCY']?.value
  // Tidak ada sensor status turbin; pembangkit dianggap beroperasi bila
  // energy meter membaca daya aktif.
  const running = devicesOnline && (power ?? 0) > 0
  const live = (tag: string) => measurements[tag]?.quality === 'good'
  return (
    <section className="bg-[#070d18] border border-border rounded-card overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,.18)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div><h2 className="text-sm font-semibold text-text-primary">Overview Peralatan</h2><p className="text-[10px] text-text-secondary">Skema hidrometri dan pembangkit · visualisasi internal tanpa aset eksternal</p></div>
        <span className={cn('flex items-center gap-1.5 text-[10px]', running ? 'text-status-good' : 'text-text-secondary')}><span className={cn('w-1.5 h-1.5 rounded-full', running ? 'bg-status-good animate-pulse' : 'bg-text-secondary')} />{running ? 'Sistem berjalan' : 'Menunggu data'}</span>
      </div>
      <svg viewBox="0 0 1400 500" className="w-full h-auto min-h-[300px]" role="img" aria-label="Skema detail stasiun monitoring sungai dengan tiang sensor radar, panel kontrol, generator, turbin Kaplan, dan aliran energi">
        <defs>
          <linearGradient id="overviewBg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#0b1424" /><stop offset=".55" stopColor="#101d31" /><stop offset="1" stopColor="#07111e" /></linearGradient>
          <linearGradient id="overviewRiver" x1="0" x2="1"><stop stopColor="#123b70" /><stop offset=".5" stopColor="#087f9b" /><stop offset="1" stopColor="#164f8c" /></linearGradient>
          <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e5edf5" /><stop offset=".45" stopColor="#7e91a7" /><stop offset="1" stopColor="#334155" /></linearGradient>
          <linearGradient id="gold" x1="0" x2="1"><stop stopColor="#fbbf24" /><stop offset="1" stopColor="#f97316" /></linearGradient>
          <pattern id="overviewGrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#91a4bd" strokeOpacity=".08" /></pattern>
          <filter id="blueGlow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="greenGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <marker id="overviewArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#62e6ff" /></marker>
        </defs>
        <rect width="1400" height="500" fill="url(#overviewBg)" />
        <rect width="1400" height="500" fill="url(#overviewGrid)" />
        <path d="M0 395 C170 350 290 420 470 382 S760 350 920 390 S1190 430 1400 370V500H0Z" fill="url(#overviewRiver)" opacity=".92" />
        <path d="M0 404 C170 360 290 430 470 391 S760 359 920 399 S1190 440 1400 379" fill="none" stroke="#8df3ff" strokeOpacity=".6" strokeWidth="3" filter="url(#blueGlow)" />
        <path d="M30 444 C220 405 300 468 500 430 S790 405 970 441 S1220 476 1380 425" fill="none" stroke="#4ad7ef" strokeOpacity=".3" strokeWidth="2" />
        <path d="M110 410H360M520 405H735M875 416H1100M1190 400H1350" fill="none" stroke="#7cecff" strokeWidth="3" strokeDasharray="12 14" markerEnd="url(#overviewArrow)" opacity=".9" />

        <g transform="translate(52 52)">
          <rect width="260" height="176" rx="16" fill="#0d1a2c" stroke="#2a78a8" strokeWidth="2" />
          <rect x="1" y="1" width="258" height="38" rx="15" fill="#112942" />
          <circle cx="22" cy="20" r="7" fill={live('HYDRO.WATER_LEVEL') ? '#22c55e' : '#64748b'} filter="url(#greenGlow)" />
          <text x="40" y="25" fill="#f8fafc" fontSize="16" fontWeight="700">STASIUN HIDROMETRI</text>
          <text x="20" y="63" fill="#91a4bd" fontSize="11" letterSpacing="1">PERMUKAAN AIR</text>
          <text x="20" y="94" fill="#67e8f9" fontSize="30" fontWeight="700">{waterLevel == null ? '—' : waterLevel.toFixed(2)} <tspan fontSize="14" fill="#b7c8d9">m</tspan></text>
          <path d="M22 122h216" stroke="#263b55" />
          <path d="M25 151 C55 132 82 163 112 143 S168 134 195 151 S220 156 238 138" fill="none" stroke="#62e6ff" strokeWidth="3" />
          <text x="20" y="169" fill="#8fa4ba" fontSize="10">RADAR LEVEL · DATA REAL-TIME</text>
        </g>
        <path d="M312 158H390" stroke="#62e6ff" strokeWidth="2" strokeDasharray="5 6" markerEnd="url(#overviewArrow)" />
        <g aria-label="Tiang sensor radar permukaan air">
          <path d="M154 394h52" stroke="#1d2939" strokeWidth="8" strokeLinecap="round" />
          <path d="M180 394V251" stroke="#b8c6d5" strokeWidth="8" />
          <path d="M180 394V251" stroke="#51657b" strokeWidth="2" strokeDasharray="7 7" />
          <path d="M170 394h20l13 10h-46Z" fill="#5b6f84" stroke="#cbd5e1" strokeWidth="2" />
          <rect x="150" y="228" width="60" height="27" rx="7" fill="url(#metal)" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="158" y="234" width="16" height="12" rx="2" fill="#172b45" stroke="#67e8f9" />
          <circle cx="197" cy="241" r="4" fill={live('HYDRO.WATER_LEVEL') ? '#22c55e' : '#64748b'} filter="url(#greenGlow)" />
          <path d="M180 255l-18 48h36Z" fill="#dbeafe" opacity=".18" filter="url(#blueGlow)" />
          <path d="M167 279 Q180 291 193 279M163 294 Q180 308 197 294" fill="none" stroke="#67e8f9" strokeWidth="2" strokeOpacity=".8" />
          <path d="M135 405h90" stroke="#62e6ff" strokeWidth="2" strokeDasharray="5 6" />
          <rect x="114" y="420" width="132" height="34" rx="8" fill="#0b1728" stroke="#2c607e" />
          <text x="180" y="435" textAnchor="middle" fill="#e5edf5" fontSize="10" fontWeight="700">RADAR LEVEL SENSOR</text>
          <text x="180" y="448" textAnchor="middle" fill="#67e8f9" fontSize="9">NON-CONTACT · ONLINE</text>
        </g>

        <g transform="translate(388 52)">
          <rect width="278" height="194" rx="16" fill="#0c1727" stroke="#3b82f6" strokeOpacity=".75" strokeWidth="2" />
          <rect x="1" y="1" width="276" height="38" rx="15" fill="#122541" />
          <circle cx="22" cy="20" r="7" fill={devicesOnline ? '#22c55e' : '#ef4444'} filter="url(#greenGlow)" />
          <text x="40" y="25" fill="#f8fafc" fontSize="16" fontWeight="700">PANEL KONTROL</text>
          <text x="20" y="60" fill="#8fa4ba" fontSize="10" letterSpacing="1">PLC · GATEWAY · TELEMETRY</text>
          <rect x="20" y="78" width="238" height="87" rx="8" fill="#07111d" stroke="#223955" />
          <rect x="34" y="91" width="80" height="57" rx="5" fill="#142b44" stroke="#3c6f98" />
          <rect x="124" y="91" width="52" height="57" rx="5" fill="#142b44" stroke="#3c6f98" />
          <rect x="186" y="91" width="58" height="57" rx="5" fill="#142b44" stroke="#3c6f98" />
          <circle cx="53" cy="108" r="5" fill="#22c55e" /><circle cx="53" cy="126" r="5" fill="#22c55e" /><circle cx="53" cy="144" r="5" fill="#f59e0b" />
          <path d="M70 108h28M70 126h28M70 144h28" stroke="#7c9ab6" strokeWidth="3" />
          <path d="M136 105h28M136 120h28M136 135h18" stroke="#67e8f9" strokeWidth="3" />
          <path d="M198 106h34M198 121h25M198 136h34" stroke="#a5b4fc" strokeWidth="3" />
          <text x="20" y="184" fill="#62e6ff" fontSize="10">STATUS: {devicesOnline ? 'ONLINE / SYNCED' : 'OFFLINE'}</text>
        </g>

        <path d="M666 145H732" stroke="#fbbf24" strokeWidth="3" strokeDasharray="7 6" markerEnd="url(#overviewArrow)" />
        <g transform="translate(734 73)">
          <rect width="246" height="154" rx="18" fill="#171d2b" stroke="#d59628" strokeWidth="2" />
          <rect x="1" y="1" width="244" height="36" rx="17" fill="#342b1b" />
          <circle cx="22" cy="19" r="7" fill={running ? '#22c55e' : '#64748b'} filter="url(#greenGlow)" />
          <text x="40" y="24" fill="#fff7ed" fontSize="16" fontWeight="700">GENERATOR</text>
          <text x="20" y="69" fill="#9caabd" fontSize="10" letterSpacing="1">OUTPUT POWER</text>
          <text x="20" y="106" fill="#fbbf24" fontSize="32" fontWeight="700">{power == null ? '—' : power.toFixed(1)} <tspan fontSize="14" fill="#f6d48b">kW</tspan></text>
          <rect x="20" y="121" width="206" height="8" rx="4" fill="#3c3220" /><rect x="20" y="121" width={power == null ? 0 : Math.min(206, Math.max(18, power * 2.2))} height="8" rx="4" fill="url(#gold)" />
          <text x="20" y="145" fill="#b6c2d1" fontSize="10">{running ? 'OPERATING NOMINAL' : 'STANDBY'}</text>
        </g>
        <path d="M857 228V292" stroke="#fbbf24" strokeWidth="3" strokeDasharray="7 6" markerEnd="url(#overviewArrow)" />

        <g transform="translate(726 286)">
          <rect width="260" height="122" rx="16" fill="#111c2d" stroke="#73859b" strokeWidth="2" />
          <path d="M102 0v24M158 0v24" stroke="#f59e0b" strokeWidth="9" />
          <path d="M95 23h70l25 22H70Z" fill="url(#metal)" stroke="#9aaabd" />
          <g className={running ? 'animate-[spin_2s_linear_infinite]' : ''} style={{ transformOrigin: '130px 70px' }}>
            <path d="M130 70C65 38 70 90 130 78C190 90 195 38 130 70Z" fill="#dce7f0" stroke="#91a4b8" strokeWidth="2" />
            <path d="M130 70C98 15 151 18 137 70C153 125 99 125 130 70Z" fill="#f4f8fb" stroke="#91a4b8" strokeWidth="2" />
          </g>
          <circle cx="130" cy="70" r="11" fill="#52657a" stroke="#dbeafe" strokeWidth="2" />
          <text x="18" y="108" fill="#e5edf5" fontSize="13" fontWeight="700">TURBIN</text><text x="170" y="108" fill="#67e8f9" fontSize="13" fontWeight="700">{frequency == null ? '—' : frequency.toFixed(2)} Hz</text>
        </g>

        <g transform="translate(1040 54)">
          <rect width="300" height="184" rx="16" fill="#0d1a2c" stroke="#a855f7" strokeOpacity=".7" strokeWidth="2" />
          <rect x="1" y="1" width="298" height="38" rx="15" fill="#221b3b" />
          <circle cx="22" cy="20" r="7" fill={devicesOnline ? '#22c55e' : '#ef4444'} filter="url(#greenGlow)" />
          <text x="40" y="25" fill="#f8fafc" fontSize="16" fontWeight="700">DISTRIBUSI ENERGI</text>
          <text x="20" y="65" fill="#9caabd" fontSize="10" letterSpacing="1">PANEL 400 V · PROTEKSI AKTIF</text>
          <rect x="20" y="82" width="260" height="68" rx="8" fill="#080f1b" stroke="#31415b" />
          <path d="M38 103h72v26H38ZM128 103h58v26h-58ZM202 103h58v26h-58Z" fill="#1b3150" stroke="#5d83a8" />
          <circle cx="54" cy="116" r="5" fill="#22c55e" /><circle cx="144" cy="116" r="5" fill="#22c55e" /><circle cx="218" cy="116" r="5" fill="#22c55e" />
          <path d="M68 116h28M158 116h16M232 116h16" stroke="#9bc5e5" strokeWidth="3" />
          <text x="20" y="171" fill="#c4b5fd" fontSize="10">GRID STABLE · 3 FEEDER AKTIF</text>
        </g>
        <path d="M980 147H1038" stroke="#c4b5fd" strokeWidth="3" strokeDasharray="7 6" markerEnd="url(#overviewArrow)" />

        <g transform="translate(40 330)"><rect width="274" height="58" rx="10" fill="#0b1728" stroke="#28415c" /><text x="16" y="22" fill="#8fa4ba" fontSize="10">KONDISI ALIRAN</text><text x="16" y="45" fill="#67e8f9" fontSize="18" fontWeight="700">{flow == null ? '—' : flow.toFixed(3)} <tspan fontSize="11" fill="#b7c8d9">m³/s</tspan></text></g>
        <g transform="translate(1080 330)"><rect width="260" height="58" rx="10" fill="#0b1728" stroke="#28415c" /><text x="16" y="22" fill="#8fa4ba" fontSize="10">ALIRAN PROSES</text><text x="16" y="45" fill="#c4b5fd" fontSize="14" fontWeight="700">SENSOR  →  KONTROL  →  ENERGI</text></g>
        <text x="28" y="30" fill="#61758d" fontSize="10" letterSpacing="2">RIVER FLOW GUARDIAN  /  SYSTEM OVERVIEW</text>
        <text x="52" y="49" fill="#4f7190" fontSize="9" letterSpacing="1.5">MONITORING</text>
        <text x="734" y="49" fill="#806d46" fontSize="9" letterSpacing="1.5">POWER CONVERSION</text>
        <text x="1040" y="49" fill="#836ba7" fontSize="9" letterSpacing="1.5">DISTRIBUTION</text>
      </svg>
    </section>
  )
}


// ---------------------------------------------------------------------------

type MeasMap = Record<string, { value: number | null; quality: string; timestamp: string }>

/** Tile untuk tag bernilai kode (0/1) yang lebih jelas dibaca sebagai teks. */
function StatusTile({ label, tag, text, bad }: {
  label: string
  tag: MeasMap[string] | undefined
  text: (value: number) => string
  bad?: (value: number) => boolean
}) {
  const value = tag?.value
  const isBad = value != null && bad?.(value)
  return (
    <div className="scada-card kpi-card flex min-h-[116px] flex-col gap-1">
      <span className="text-xs text-text-secondary truncate">{label}</span>
      <div className={cn('text-lg font-bold leading-tight', value == null ? 'text-text-secondary' : isBad ? 'text-accent-red' : 'text-text-primary')}>
        {value == null ? '—' : text(value)}
      </div>
      {tag?.quality && <span className="text-[10px] text-text-secondary">{qualityLabel(tag.quality)}</span>}
    </div>
  )
}

function DashKpi({ m, panelTempColor, powerTag, powerEstimated }: { m: MeasMap; panelTempColor: string; powerTag: string; powerEstimated: boolean }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-blue">Live telemetry</p><h2 className="mt-1 text-sm font-semibold text-text-primary">Hidrologi & energi</h2></div><span className="hidden text-[10px] text-text-secondary sm:block">Nilai terakhir diterima dari gateway</span></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Level Air" value={m['HYDRO.WATER_LEVEL']?.value} unit="m" precision={3} quality={m['HYDRO.WATER_LEVEL']?.quality} colorClass="text-accent-blue" />
        <KpiCard label="Kecepatan Aliran" value={m['HYDRO.VELOCITY']?.value} unit="m/s" precision={2} quality={m['HYDRO.VELOCITY']?.quality} colorClass="text-accent-blue" />
        <KpiCard label="Debit" value={m['HYDRO.FLOW_RATE']?.value} unit="m³/s" precision={3} quality={m['HYDRO.FLOW_RATE']?.quality} colorClass="text-accent-blue" />
        <KpiCard label={powerEstimated ? 'Daya (estimasi dari debit)' : 'Daya Aktif'} value={m[powerTag]?.value} unit="kW" precision={1} quality={m[powerTag]?.quality} colorClass="text-accent-yellow" />
        <KpiCard label="Energi Kumulatif" value={m['POWER.ENERGY_KWH']?.value} unit="kWh" precision={1} quality={m['POWER.ENERGY_KWH']?.quality} colorClass="text-accent-orange" />
        <KpiCard label="Suhu Panel" value={m['PANEL.TEMPERATURE']?.value} unit="°C" precision={1} quality={m['PANEL.TEMPERATURE']?.quality} colorClass={panelTempColor} />
      </div>
    </section>
  )
}

const DEFAULT_TARIFF_RP_PER_KWH = Number(import.meta.env.VITE_ENERGY_TARIFF_RP_PER_KWH ?? 1500)

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(Math.max(0, value))
}

function PowerForecastPanel({
  forecast,
  currentPowerKw,
  dailyEnergyKwh,
  loading,
  hasHistory,
  estimated,
}: {
  forecast: ReturnType<typeof predictPower>
  estimated: boolean
  currentPowerKw: number | null
  dailyEnergyKwh: number | null
  loading: boolean
  hasHistory: boolean
}) {
  const [tariff, setTariff] = useState(() => Number.isFinite(DEFAULT_TARIFF_RP_PER_KWH) && DEFAULT_TARIFF_RP_PER_KWH > 0 ? DEFAULT_TARIFF_RP_PER_KWH : 1500)

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem('rfg-energy-tariff'))
      if (Number.isFinite(saved) && saved > 0) setTariff(saved)
    } catch { /* ponytail: storage optional; use the PLN estimate default */ }
  }, [])

  function updateTariff(value: string) {
    const next = Number(value)
    if (!Number.isFinite(next) || next <= 0 || next > 100000) return
    setTariff(next)
    try { localStorage.setItem('rfg-energy-tariff', String(next)) } catch { /* optional browser storage */ }
  }

  const hourlyRevenue = forecast.powerKw * tariff
  const dailyRevenue = (dailyEnergyKwh ?? forecast.powerKw * 24) * tariff
  const currentWatts = currentPowerKw == null ? null : currentPowerKw * 1000

  return (
    <section className="relative overflow-hidden rounded-card border border-accent-purple/30 bg-gradient-to-br from-accent-purple/10 via-surface to-surface p-4 shadow-[0_8px_30px_rgba(139,92,246,.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent-purple" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Estimasi Tren Daya & Pendapatan</h2>
            <span className="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] text-accent-purple">Regresi linear · 6 jam</span>
          </div>
          <p className="mt-1 text-[11px] text-text-secondary">Estimasi sederhana 1 jam ke depan dari tren daya {estimated ? 'estimasi (dihitung dari debit sungai)' : 'aktif'} 6 jam terakhir, bukan model AI. Prediksi dari modul AI akan tampil terpisah setelah terintegrasi. Bukan pengganti meter energi atau tagihan resmi.</p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-text-secondary">
          Tarif jual
          <span className="flex items-center rounded-input border border-border bg-surface-2 px-2 focus-within:border-accent-purple">
            <span className="mr-1">Rp</span>
            <input
              aria-label="Tarif energi rupiah per kWh"
              className="w-20 bg-transparent py-1 text-right text-xs text-text-primary outline-none"
              type="number" min="1" max="100000" step="1" value={tariff}
              onChange={(event) => updateTariff(event.target.value)}
            />
            <span className="ml-1">/kWh</span>
          </span>
        </label>
      </div>

      {loading ? <div className="mt-4 h-24 skeleton rounded-card" /> : !hasHistory ? (
        <div className="mt-4 rounded-card border border-accent-orange/30 bg-accent-orange/5 px-3 py-4 text-xs text-accent-orange">
          Histori daya belum tersedia. Prediksi akan tampil setelah data {estimated ? 'debit' : 'daya aktif'} masuk.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ForecastMetric icon={<Zap className="h-4 w-4" />} label="Estimasi 1 jam" value={`${forecast.powerKw.toFixed(1)} kW`} detail={`${Math.round(forecast.powerKw * 1000).toLocaleString('id-ID')} W · ${forecast.confidence}% yakin`} color="text-accent-yellow" />
          <ForecastMetric icon={<Banknote className="h-4 w-4" />} label="Potensi pendapatan / jam" value={formatRupiah(hourlyRevenue)} detail={`Rentang ${formatRupiah(forecast.lowerKw * tariff)}–${formatRupiah(forecast.upperKw * tariff)}`} color="text-status-good" />
          <ForecastMetric icon={<Banknote className="h-4 w-4" />} label="Estimasi hari ini" value={formatRupiah(dailyRevenue)} detail={dailyEnergyKwh == null ? 'Daya prediksi × 24 jam' : `${dailyEnergyKwh.toFixed(1)} kWh tercatat`} color="text-accent-blue" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-secondary">
        <span>{estimated ? 'Daya estimasi (dari debit)' : 'Daya aktual'}: {currentWatts == null ? '—' : `${Math.round(currentWatts).toLocaleString('id-ID')} W`}</span>
        <span>Tren: {!hasHistory ? '—' : `${forecast.slopeKwPerHour >= 0 ? '+' : ''}${forecast.slopeKwPerHour.toFixed(2)} kW/jam`}</span>
      </div>
    </section>
  )
}

function ForecastMetric({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/70 p-3">
      <div className="flex items-center gap-2 text-text-secondary"><span className={color}>{icon}</span><span className="text-[11px]">{label}</span></div>
      <div className={cn('mt-2 text-xl font-bold tabular-nums', color)}>{value}</div>
      <p className="mt-1 text-[10px] text-text-secondary">{detail}</p>
    </div>
  )
}

function TrendPanel({ chartData, trendLoading, trendError }: {
  chartData: { time: string; avg: number | null }[]
  trendLoading: boolean
  trendError: boolean
}) {
  return (
    <div className="chart-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">Trend Permukaan Air (6 jam terakhir)</h2>
        {trendLoading && <RefreshCw className="w-3.5 h-3.5 text-text-secondary animate-spin" />}
      </div>
      {trendError ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-accent-orange">
          Data trend tidak tersedia
        </div>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="wlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} unit=" m" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
              labelStyle={{ color: 'hsl(var(--text-secondary))', fontSize: 11 }}
              itemStyle={{ color: 'hsl(var(--accent-blue))', fontSize: 11 }}
              formatter={(v: number) => [`${v.toFixed(2)} m`, 'Permukaan Air']}
            />
            <Area type="monotone" dataKey="avg" stroke="#58a6ff" strokeWidth={2}
              fill="url(#wlGrad)" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] skeleton rounded" />
      )}
    </div>
  )
}

function PowerTrendPanel({ chartData, forecast, trendLoading, trendError, estimated }: {
  chartData: { time: string; avg: number | null }[]
  estimated: boolean
  forecast: ReturnType<typeof predictPower>
  trendLoading: boolean
  trendError: boolean
}) {
  const hasData = chartData.some((point) => point.avg != null)
  const chartWithForecast = hasData
    ? [...chartData, { time: '+1j', avg: forecast.powerKw, forecast: forecast.powerKw }]
    : []

  return (
    <div className="bg-surface border border-border rounded-card p-4 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{estimated ? 'Daya Estimasi dari Debit' : 'Daya Aktif & Estimasi'}</h2>
          <p className="mt-0.5 text-[10px] text-text-secondary">6 jam terakhir · titik +1 jam adalah estimasi</p>
        </div>
        {trendLoading && <RefreshCw className="w-3.5 h-3.5 text-text-secondary animate-spin" />}
      </div>
      {trendError ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-accent-orange">Data daya tidak tersedia</div>
      ) : hasData ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartWithForecast} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} unit=" kW" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
              labelStyle={{ color: 'hsl(var(--text-secondary))', fontSize: 11 }}
              formatter={(value: number, name: string) => [`${value.toFixed(1)} kW`, name === 'forecast' ? 'Estimasi' : 'Daya aktif']}
            />
            <Area type="monotone" dataKey="avg" stroke="#fbbf24" strokeWidth={2} fill="url(#powerGrad)" dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="forecast" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: '#a855f7' }} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex items-center justify-center rounded-card bg-surface-2/40 text-xs text-text-secondary">Menunggu histori daya</div>
      )}
    </div>
  )
}

import type { DeviceHealthView } from '@/lib/supabase'

function DevicePanel({ devices, onlineCount, totalCount, loading }: {
  devices: DeviceHealthView[]
  onlineCount: number
  totalCount: number
  loading: boolean
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Status Perangkat</h2>
        <span className="text-xs text-text-secondary">{onlineCount}/{totalCount} online</span>
      </div>
      {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-card" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {devices.map((device) => (
            <div key={device.id} className="bg-surface border border-border rounded-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0',
                  device.is_online ? 'bg-status-good' : 'bg-status-bad')} />
                <span className="text-xs font-medium text-text-primary truncate">{device.name}</span>
              </div>
              <p className="text-[10px] text-text-secondary capitalize pl-4">
                {device.status}
                {device.minutes_since_last_seen != null && !device.is_online && (
                  <span className="ml-1">· {device.minutes_since_last_seen}m lalu</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
