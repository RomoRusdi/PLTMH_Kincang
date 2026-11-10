import { createFileRoute } from '@tanstack/react-router'
import { useStationId } from '@/lib/station'
import { useState, type ReactNode } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Download, FileText, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/UiState'
import { exportCsv } from '@/lib/exportCsv'
import { useAlarmStatistics, useMonthlyReports } from '@/lib/monitoring'
import { formatTimestamp, formatValue } from '@/lib/utils'
import { useThemeColor } from '@/lib/useThemeColor'
import type { MonthlyReport } from '@/lib/supabase'

export const Route = createFileRoute('/dashboard/reports')({ component: ReportsPage })

const COLORS: Record<string, string> = { critical: '#f85149', high: '#e3b341', medium: '#d29922', low: '#58a6ff', info: '#8b949e' }

function StatCard({ label, value, color = 'text-text-primary', suffix = '' }: { label: string; value: number | null | undefined; color?: string; suffix?: string }) {
  return <div className="bg-surface border border-border rounded-card p-4"><p className="text-[10px] text-text-secondary mb-1">{label}</p><p className={`text-2xl font-bold tabular-nums ${color}`}>{formatValue(value, suffix || null, 1)}</p></div>
}

function ChartBox({ title, loading, children }: { title: string; loading: boolean; children: ReactNode }) {
  return <div className="bg-surface border border-border rounded-card p-4"><h3 className="text-sm font-semibold text-text-primary mb-4">{title}</h3>{loading ? <div className="h-48 skeleton rounded" /> : children}</div>
}

function monthLabel(date: string) {
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(new Date(`${date}T00:00:00`))
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}d`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${formatValue(seconds / 3600, null, 1)}j`
}

function ReportsPage() {
  const STATION_ID = useStationId()
  const [days, setDays] = useState(30)
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useAlarmStatistics(STATION_ID, days)
  const { data: reports = [], isLoading: reportsLoading, isError: reportsError, refetch: refetchReports } = useMonthlyReports(STATION_ID)
  const byPriority = stats?.by_priority as Record<string, number> | undefined
  const byType = stats?.by_type as Record<string, number> | undefined
  const byDay = (stats?.by_day as { day: string; cnt: number }[] | undefined) ?? []
  const byResolve = stats?.avg_resolve_seconds_by_priority as Record<string, number> | undefined
  const monthRows = [...reports].sort((a, b) => b.report_date.localeCompare(a.report_date))
  const latest = monthRows[0]
  const typeData = Object.entries(byType ?? {})
    .map(([type, count]) => ({ label: ALARM_TYPE_LABEL[type] ?? type, count }))
    .sort((a, b) => b.count - a.count)
  const dayData = fillDays(byDay, Math.min(days, 30))

  function exportReport() {
    exportCsv(monthRows.map((r) => ({ periode: r.report_date, energi_kwh: r.total_energy_kwh ?? '', daya_rata_rata_kw: r.avg_power_kw ?? '', jam_operasi: r.operational_hours ?? '', availability_percent: r.availability_percent ?? '', kualitas_data_percent: r.data_quality_percent ?? '', total_alarm: r.total_alarms ?? '', alarm_critical: r.critical_alarms ?? '' })), `laporan-performa-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return <div className="flex flex-col h-full">
    <PageHeader title="Laporan" subtitle={`Performa stasiun dan statistik alarm ${days} hari terakhir`} actions={<div className="flex gap-2"><select aria-label="Periode statistik alarm" value={days} onChange={(e) => setDays(Number(e.target.value))} className="scada-input w-auto"><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select><button type="button" onClick={() => { void refetchStats(); void refetchReports() }} className="scada-button-secondary"><RefreshCw className="w-3 h-3" /> Refresh</button><button type="button" disabled={monthRows.length === 0} onClick={exportReport} className="scada-button-secondary disabled:opacity-50"><Download className="w-3 h-3" /> Export CSV</button></div>} />
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {reportsError ? <ErrorState message="Laporan performa belum tersedia." onRetry={() => void refetchReports()} /> : reportsLoading ? <LoadingState label="Memuat laporan performa…" /> : monthRows.length === 0 ? <EmptyState title="Belum ada laporan performa" description="Laporan bulanan akan tampil setelah tersedia di database." /> : <>
        <section aria-label="Ringkasan performa"><div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-accent-blue" /><h2 className="text-sm font-semibold text-text-primary">Ringkasan performa terakhir</h2><span className="text-xs text-text-secondary">{latest ? monthLabel(latest.report_date) : '-'}</span></div><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><StatCard label="Energi" value={latest?.total_energy_kwh} suffix="kWh" /><StatCard label="Daya rata-rata" value={latest?.avg_power_kw} suffix="kW" /><StatCard label="Jam operasi" value={latest?.operational_hours} suffix="jam" /><StatCard label="Availability" value={latest?.availability_percent} suffix="%" color="text-accent-green" /><StatCard label="Kualitas data" value={latest?.data_quality_percent} suffix="%" color="text-accent-blue" /></div></section>
        <MonthlyTable reports={monthRows} />
      </>}

      {statsError ? <ErrorState message="Statistik alarm belum tersedia." onRetry={() => void refetchStats()} /> : <>
        <div className="flex items-center gap-2"><div className="h-px flex-1 bg-border" /><span className="text-xs text-text-secondary uppercase tracking-wider">Statistik alarm</span><div className="h-px flex-1 bg-border" /></div>
        {statsLoading ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20 rounded-card" />)}</div> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><StatCard label="Total alarm" value={stats?.total_alarms} /><StatCard label="Critical" value={byPriority?.critical ?? 0} color="text-accent-red" /><StatCard label="High" value={byPriority?.high ?? 0} color="text-accent-orange" /><StatCard label="Jenis unik" value={Object.keys(byType ?? {}).length} color="text-accent-purple" /></div>}
        <ChartBox title={`Alarm per hari (${dayData.length} hari terakhir)`} loading={statsLoading}><AlarmPerDayChart data={dayData} /></ChartBox>
        <ChartBox title="Alarm per jenis" loading={statsLoading}><RankedBars data={typeData} /></ChartBox>
        {byResolve && <div className="bg-surface border border-border rounded-card overflow-hidden"><div className="px-4 py-3 border-b border-border"><h3 className="text-sm font-semibold text-text-primary">Rata-rata waktu penyelesaian</h3></div><table className="w-full text-xs"><thead className="bg-surface-2"><tr><th className="text-left px-4 py-2 text-text-secondary font-medium">Prioritas</th><th className="text-left px-4 py-2 text-text-secondary font-medium">Waktu rata-rata</th></tr></thead><tbody>{Object.entries(byResolve).map(([priority, seconds]) => <tr key={priority} className="border-t border-border hover:bg-surface-2"><td className="px-4 py-2 capitalize" style={{ color: COLORS[priority] ?? '#8b949e' }}>{priority}</td><td className="px-4 py-2 text-text-primary tabular-nums">{formatDuration(seconds)}</td></tr>)}</tbody></table></div>}
      </>}
    </div>
  </div>
}

const ALARM_TYPE_LABEL: Record<string, string> = {
  high_high: 'Melewati batas atas kritis (High-High)',
  high: 'Melewati batas atas (High)',
  low: 'Di bawah batas bawah (Low)',
  low_low: 'Di bawah batas bawah kritis (Low-Low)',
  data_stale: 'Data berhenti masuk',
  device_offline: 'Perangkat offline',
  comm_failure: 'Gangguan komunikasi',
  system: 'Sistem',
  manual: 'Manual',
}

/**
 * Database hanya mengembalikan hari yang punya alarm. Tanpa hari kosong, satu
 * hari beralarm tergambar sebagai satu balok selebar grafik dan terbaca
 * seolah alarm terjadi setiap hari. Tanggal memakai UTC, sama seperti
 * pengelompokan date_trunc('day', ...) di database.
 */
function fillDays(rows: { day: string; cnt: number }[], count: number) {
  const byDay = new Map(rows.map((row) => [row.day, Number(row.cnt)]))
  const today = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (count - 1 - index)))
    const day = date.toISOString().slice(0, 10)
    return { day, label: formatTimestamp(`${day}T00:00:00`, 'dd MMM'), cnt: byDay.get(day) ?? 0 }
  })
}

function AlarmPerDayChart({ data }: { data: ReturnType<typeof fillDays> }) {
  const barColor = useThemeColor('--accent-blue')
  const gridColor = useThemeColor('--border')
  const axisColor = useThemeColor('--text-secondary')
  const total = data.reduce((sum, row) => sum + row.cnt, 0)
  if (total === 0) return <p className="flex h-48 items-center justify-center text-xs text-text-secondary">Tidak ada alarm pada periode ini.</p>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke={gridColor} strokeOpacity={0.6} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={{ stroke: gridColor }} interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: 'hsl(var(--text-secondary) / 0.08)' }}
          contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: 'hsl(var(--text-secondary))' }}
          itemStyle={{ color: 'hsl(var(--text-primary))' }}
          formatter={(value: number) => [`${value} alarm`, 'Jumlah']}
        />
        <Bar dataKey="cnt" name="Alarm" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Batang horizontal berurutan: label panjang tetap terbaca dan nilai tertulis di ujung batang. */
function RankedBars({ data }: { data: { label: string; count: number }[] }) {
  if (data.length === 0) return <p className="py-10 text-center text-xs text-text-secondary">Tidak ada alarm pada periode ini.</p>
  const max = Math.max(...data.map((row) => row.count), 1)
  return (
    <ul className="space-y-3">
      {data.map((row) => (
        <li key={row.label} title={`${row.label}: ${row.count} alarm`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-text-primary">{row.label}</span>
            <span className="flex-shrink-0 font-semibold tabular-nums text-text-primary">{row.count}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent-blue" style={{ width: `${Math.max((row.count / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function MonthlyTable({ reports }: { reports: MonthlyReport[] }) {
  return <section className="bg-surface border border-border rounded-card overflow-hidden"><div className="px-4 py-3 border-b border-border"><h2 className="text-sm font-semibold text-text-primary">Riwayat laporan bulanan</h2></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-surface-2"><tr>{['Periode', 'Energi', 'Daya rata-rata', 'Jam operasi', 'Availability', 'Alarm', 'Sumber'].map((header) => <th key={header} className="text-left px-4 py-2 text-text-secondary font-medium whitespace-nowrap">{header}</th>)}</tr></thead><tbody>{reports.map((report) => <tr key={report.id} className="border-t border-border hover:bg-surface-2"><td className="px-4 py-2 text-text-primary whitespace-nowrap">{monthLabel(report.report_date)}<span className="block text-[10px] text-text-secondary">{formatTimestamp(report.created_at, 'dd MMM yyyy')}</span></td><td className="px-4 py-2 tabular-nums">{formatValue(report.total_energy_kwh, 'kWh', 0)}</td><td className="px-4 py-2 tabular-nums">{formatValue(report.avg_power_kw, 'kW', 1)}</td><td className="px-4 py-2 tabular-nums">{formatValue(report.operational_hours, 'jam', 1)}</td><td className="px-4 py-2 tabular-nums">{formatValue(report.availability_percent, '%', 1)}</td><td className="px-4 py-2 tabular-nums">{report.total_alarms ?? '--'} <span className="text-accent-red">({report.critical_alarms ?? 0} critical)</span></td><td className="px-4 py-2">{report.is_auto_generated ? <span className="text-accent-blue">Otomatis</span> : <span className="text-text-secondary">Manual</span>}</td></tr>)}</tbody></table></div></section>
}