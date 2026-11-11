import { useMemo } from 'react'
import { CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { LoadingState } from '@/components/UiState'
import { evaluateCalibration, useCalibrationReferences, type CalibrationEvaluation, type ErrorSummary } from '@/lib/calibration'
import {
  PARAM_ROWS,
  cm,
  dateTime,
  exportCalibrationCsv,
  flowGrade,
  levelGrade,
  num,
  openCalibrationReport,
  pct,
} from '@/lib/calibrationReport'
import type { Station, StationCalibration } from '@/lib/supabase'
import { useThemeColor } from '@/lib/useThemeColor'
import { cn } from '@/lib/utils'
import { useBrand } from '@/lib/brand'

interface Props {
  calibration: StationCalibration
  previous: StationCalibration | null
  station: Station | null
  onClose: () => void
}

/** Detail satu versi kalibrasi: perubahan parameter, akurasi, grafik, titik acuan, dan laporan. */
export function CalibrationDetail({ calibration, previous, station, onClose }: Props) {
  const { data: references = [], isLoading } = useCalibrationReferences(calibration.id)
  const evaluation = useMemo(
    () => (references.length ? evaluateCalibration(calibration, previous, references) : null),
    [calibration, previous, references],
  )
  const brand = useBrand()
  const reportInput = { station, calibration, previous, evaluation, brandName: brand.name }

  function printReport() {
    if (!openCalibrationReport(reportInput)) toast.error('Pop-up diblokir browser. Izinkan pop-up untuk membuka laporan.')
  }

  return (
    <section aria-label={`Detail kalibrasi versi ${calibration.version}`} className="scada-card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Detail kalibrasi v{calibration.version}</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Berlaku sejak {dateTime(calibration.effective_from)} · {calibration.method === 'field_reference' ? `pengukuran lapangan (${references.length} titik)` : 'parameter manual'}
            {calibration.created_by_email ? ` · ${calibration.created_by_email}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={printReport} className="scada-button-secondary"><FileText className="h-3 w-3" /> Cetak / PDF</button>
          <button type="button" onClick={() => exportCalibrationCsv(reportInput)} className="scada-button-secondary"><Download className="h-3 w-3" /> CSV</button>
          <button type="button" onClick={onClose} aria-label="Tutup detail" className="rounded-input p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <ParameterDiff calibration={calibration} previous={previous} />

      {isLoading ? <LoadingState label="Memuat titik acuan…" />
        : !evaluation ? (
          <p className="rounded-input border border-border bg-surface-2/40 px-3 py-3 text-xs text-text-secondary">
            Versi ini disimpan sebagai parameter manual tanpa titik acuan, sehingga akurasinya belum dapat dievaluasi.
            Gunakan wizard pengukuran lapangan agar kalibrasi berikutnya memiliki bukti akurasi.
          </p>
        ) : <>
          <AccuracySummary evaluation={evaluation} hasPrevious={!!previous} />
          <div className="grid gap-4 lg:grid-cols-2">
            <EvaluationChart
              title="Level air: acuan vs hitungan"
              unit="m"
              digits={3}
              points={evaluation.points.map((p) => ({ ref: p.refLevel, before: p.levelBefore, after: p.levelAfter }))}
              emptyText="Tidak ada data papan duga pada titik acuan."
            />
            <EvaluationChart
              title="Debit: acuan vs hitungan"
              unit="m³/s"
              digits={3}
              points={evaluation.points.map((p) => ({ ref: p.refFlow, before: p.flowBefore, after: p.flowAfter }))}
              emptyText="Tidak ada data current meter pada titik acuan."
            />
          </div>
          <PointsTable evaluation={evaluation} />
        </>}

      {calibration.notes && <p className="text-xs text-text-secondary"><span className="font-medium text-text-primary">Catatan:</span> {calibration.notes}</p>}
    </section>
  )
}

function ParameterDiff({ calibration, previous }: { calibration: StationCalibration; previous: StationCalibration | null }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface-2 text-left text-text-secondary">
          <tr>
            <th className="px-3 py-2 font-medium">Parameter</th>
            <th className="px-3 py-2 font-medium">{previous ? `Sebelumnya (v${previous.version})` : 'Sebelumnya'}</th>
            <th className="px-3 py-2 font-medium">Versi ini (v{calibration.version})</th>
          </tr>
        </thead>
        <tbody>
          {PARAM_ROWS.map((row) => {
            const before = previous ? row.value(previous) : '—'
            const after = row.value(calibration)
            const changed = !!previous && before !== after
            return (
              <tr key={row.label} className="border-t border-border">
                <td className="px-3 py-2 text-text-secondary">{row.label}</td>
                <td className="px-3 py-2 tabular-nums text-text-secondary">{before}</td>
                <td className={cn('px-3 py-2 tabular-nums', changed ? 'font-semibold text-accent-blue' : 'text-text-primary')}>
                  {after}{changed && <span className="ml-2 rounded bg-accent-blue/10 px-1.5 py-0.5 text-[10px]">berubah</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const GRADE_TONE = { good: 'text-status-good', fair: 'text-accent-yellow', poor: 'text-accent-red' } as const

function AccuracySummary({ evaluation, hasPrevious }: { evaluation: CalibrationEvaluation; hasPrevious: boolean }) {
  const level = evaluation.level
  const flow = evaluation.flow
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <AccuracyTile
          label="Akurasi level (RMSE)"
          summary={level}
          format={(v) => cm(v)}
          grade={levelGrade(level.after.rmse)}
          hasPrevious={hasPrevious}
          detail={level.after.count ? `error maks ${cm(level.after.maxAbs)} · bias ${cm(level.after.bias, true)} · ${level.after.count} titik` : undefined}
        />
        <AccuracyTile
          label="Akurasi debit (RMSE relatif)"
          summary={flow}
          format={(v) => pct(v)}
          grade={flowGrade(flow.after.rmse)}
          hasPrevious={hasPrevious}
          detail={flow.after.count ? `error maks ${pct(flow.after.maxAbs)} · bias ${pct(flow.after.bias, true)} · ${flow.after.count} titik` : undefined}
        />
      </div>
      <p className="text-[11px] text-text-secondary">
        {hasPrevious ? '"Sebelum" dihitung dengan parameter versi sebelumnya pada titik acuan yang sama. ' : 'Versi pertama: belum ada parameter pembanding. '}
        Pedoman: level baik ≤ 1 cm, cukup ≤ 3 cm; debit baik ≤ 5%, cukup ≤ 10%.
      </p>
    </div>
  )
}

function AccuracyTile({ label, summary, format, grade, hasPrevious, detail }: {
  label: string
  summary: { before: ErrorSummary; after: ErrorSummary }
  format: (v: number | null) => string
  grade: ReturnType<typeof levelGrade>
  hasPrevious: boolean
  detail?: string
}) {
  if (summary.after.count === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-2/40 p-3">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="mt-1 text-sm text-text-secondary">Tidak ada titik acuan</p>
      </div>
    )
  }
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-text-secondary">{label}</p>
        {grade && <span className={cn('text-[11px] font-semibold', GRADE_TONE[grade.tone])}>{grade.label}</span>}
      </div>
      <p className="mt-1 flex items-baseline gap-2 tabular-nums">
        {hasPrevious && summary.before.rmse != null && (
          <>
            <span className="text-sm text-text-secondary">{format(summary.before.rmse)}</span>
            <span className="text-xs text-text-secondary">→</span>
          </>
        )}
        <span className="text-xl font-bold text-text-primary">{format(summary.after.rmse)}</span>
      </p>
      {detail && <p className="mt-1 text-[11px] text-text-secondary">{detail}</p>}
    </div>
  )
}

/** Grafik sebar acuan (x) vs hitungan (y); titik di garis putus-putus berarti sama dengan acuan. */
function EvaluationChart({ title, unit, digits, points, emptyText }: {
  title: string
  unit: string
  digits: number
  points: { ref: number | null; before: number | null; after: number | null }[]
  emptyText: string
}) {
  const accent = useThemeColor('--accent-blue')
  const muted = useThemeColor('--text-secondary')
  const grid = useThemeColor('--border')
  const surface = useThemeColor('--surface')
  const text = useThemeColor('--text-primary')

  const before = points.filter((p) => p.ref != null && p.before != null).map((p) => ({ x: p.ref!, y: p.before! }))
  const after = points.filter((p) => p.ref != null && p.after != null).map((p) => ({ x: p.ref!, y: p.after! }))
  const all = [...before, ...after].flatMap((p) => [p.x, p.y])

  return (
    <div className="rounded-card border border-border p-3">
      <h3 className="mb-2 text-xs font-semibold text-text-primary">{title}</h3>
      {all.length === 0 ? <p className="flex h-56 items-center justify-center text-xs text-text-secondary">{emptyText}</p> : (() => {
        const pad = Math.max((Math.max(...all) - Math.min(...all)) * 0.15, 10 ** -digits * 20)
        const lo = Math.min(...all) - pad
        const hi = Math.max(...all) + pad
        const fmt = (v: number) => num(v, digits)
        return (
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 4 }}>
              <CartesianGrid stroke={grid} strokeOpacity={0.6} />
              <XAxis type="number" dataKey="x" domain={[lo, hi]} tickFormatter={fmt} tick={{ fontSize: 10, fill: muted }} stroke={grid}
                label={{ value: `Acuan (${unit})`, position: 'insideBottom', offset: -10, fontSize: 10, fill: muted }} />
              <YAxis type="number" dataKey="y" domain={[lo, hi]} tickFormatter={fmt} tick={{ fontSize: 10, fill: muted }} stroke={grid} width={52}
                label={{ value: `Hitungan (${unit})`, angle: -90, position: 'insideLeft', fontSize: 10, fill: muted, dy: 40 }} />
              <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={muted} strokeDasharray="4 4" ifOverflow="extendDomain" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: grid }}
                contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 6, fontSize: 12, color: text }}
                formatter={(value: number, name: string) => [`${fmt(value)} ${unit}`, name === 'x' ? 'Acuan' : 'Hitungan']}
              />
              <Legend verticalAlign="top" height={24} iconSize={8} wrapperStyle={{ fontSize: 11, color: muted }} />
              {before.length > 0 && <Scatter name="Sebelum" data={before} fill={muted} isAnimationActive={false} />}
              <Scatter name="Sesudah" data={after} fill={accent} stroke={surface} strokeWidth={1.5} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        )
      })()}
    </div>
  )
}

function PointsTable({ evaluation }: { evaluation: CalibrationEvaluation }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface-2 text-left text-text-secondary">
          <tr>
            {['#', 'Waktu', 'Papan duga', 'Radar: jarak ke air', 'Level sebelum', 'Level sesudah', 'Error level', 'Debit acuan', 'Radar: kec. permukaan', 'Debit sesudah', 'Error debit']
              .map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {evaluation.points.map((p, i) => (
            <tr key={`${p.measuredAt}-${i}`} className="border-t border-border tabular-nums">
              <td className="px-3 py-2">{i + 1}</td>
              <td className="whitespace-nowrap px-3 py-2">{dateTime(p.measuredAt)}</td>
              <td className="px-3 py-2">{p.refLevel == null ? '—' : `${num(p.refLevel, 3)} m`}</td>
              <td className="px-3 py-2">{p.radarAirGap == null ? '—' : `${num(p.radarAirGap, 3)} m`}</td>
              <td className="px-3 py-2 text-text-secondary">{p.levelBefore == null ? '—' : `${num(p.levelBefore, 3)} m`}</td>
              <td className="px-3 py-2">{p.levelAfter == null ? '—' : `${num(p.levelAfter, 3)} m`}</td>
              <td className={cn('px-3 py-2', errorTone(p.levelErrorAfter, 0.01, 0.03))}>{cm(p.levelErrorAfter, true)}</td>
              <td className="px-3 py-2">{p.refFlow == null ? '—' : `${num(p.refFlow, 3)} m³/s`}</td>
              <td className="px-3 py-2">{p.radarSurfaceVelocity == null ? '—' : `${num(p.radarSurfaceVelocity, 2)} m/s`}</td>
              <td className="px-3 py-2">{p.flowAfter == null ? '—' : `${num(p.flowAfter, 3)} m³/s`}</td>
              <td className={cn('px-3 py-2', errorTone(p.flowErrorAfter, 0.05, 0.1))}>{pct(p.flowErrorAfter, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function errorTone(value: number | null, good: number, fair: number) {
  if (value == null) return 'text-text-secondary'
  const abs = Math.abs(value)
  return abs <= good ? 'text-status-good' : abs <= fair ? 'text-accent-yellow' : 'text-accent-red'
}
