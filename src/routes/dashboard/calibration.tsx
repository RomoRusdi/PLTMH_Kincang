import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Gauge, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { CalibrationDetail } from '@/components/calibration/CalibrationDetail'
import { EmptyState, ErrorState, LoadingState } from '@/components/UiState'
import { useAuth } from '@/lib/auth'
import { useStation } from '@/lib/station'
import { useLatestMeasurements } from '@/lib/monitoring'
import {
  calibratedFlow,
  calibratedLevel,
  fetchRadarReading,
  fitCalibration,
  useApplyCalibration,
  useCalibrationReferenceCounts,
  useCalibrations,
  type ReferencePoint,
} from '@/lib/calibration'
import type { CalibrationParams, CalibrationReferenceInput, SectionType, StationCalibration } from '@/lib/supabase'
import { cn, formatTimestamp } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { CALIBRATION_LABEL, calibrationStatus, type CalibrationState } from '@/lib/stationStatus'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export const Route = createFileRoute('/dashboard/calibration')({ component: CalibrationPage })

type Tab = 'field' | 'manual'

function CalibrationPage() {
  const { stationId, station } = useStation()
  const { hasRole } = useAuth()
  const canEdit = hasRole('admin')
  const { data: calibrations = [], isLoading, isError, refetch } = useCalibrations(stationId)
  const { data: referenceCounts = {} } = useCalibrationReferenceCounts(stationId)
  const active = calibrations[0] ?? null
  const [tab, setTab] = useState<Tab>('field')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = calibrations.find((c) => c.id === selectedId) ?? null
  const detailRef = useRef<HTMLDivElement>(null)

  // Ganti stasiun: tutup detail versi milik stasiun sebelumnya.
  useEffect(() => { setSelectedId(null) }, [stationId])

  function selectVersion(id: string) {
    setSelectedId(id)
    // Tunggu panel detail ter-render sebelum menggulir ke sana.
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Kalibrasi Sensor"
        subtitle={`Radar flow-meter RS-RAD-N01-3 · ${station?.name ?? 'stasiun terpilih'}`}
        actions={<button type="button" onClick={() => void refetch()} className="scada-button-secondary"><RefreshCw className="h-3 w-3" /> Refresh</button>}
      />
      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        {isError ? <ErrorState message="Data kalibrasi tidak dapat dimuat. Pastikan migrasi 002 sudah dijalankan." onRetry={() => void refetch()} />
          : isLoading ? <LoadingState label="Memuat kalibrasi…" />
          : <>
            <ActiveCalibration calibration={active} stationId={stationId} />

            <section className="scada-card space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Kalibrasi baru</h2>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    Kalibrasi hanya mengubah perhitungan di sistem untuk data yang masuk setelah disimpan. Parameter di dalam radar tidak diubah.
                  </p>
                </div>
                <div role="tablist" aria-label="Metode kalibrasi" className="inline-flex rounded-input border border-border bg-surface-2 p-0.5 text-xs">
                  <TabButton active={tab === 'field'} onClick={() => setTab('field')}>Pengukuran lapangan</TabButton>
                  <TabButton active={tab === 'manual'} onClick={() => setTab('manual')}>Parameter manual</TabButton>
                </div>
              </div>
              {!canEdit && (
                <p className="rounded-input border border-accent-yellow/30 bg-accent-yellow/10 px-3 py-2 text-xs text-accent-yellow">
                  Hanya admin yang dapat menyimpan kalibrasi. Anda dapat melihat perhitungannya.
                </p>
              )}
              {tab === 'field'
                ? <FieldCalibration key={`field-${stationId}-${active?.id ?? 'none'}`} stationId={stationId} active={active} canEdit={canEdit} />
                : <ManualCalibration key={`manual-${stationId}-${active?.id ?? 'none'}`} stationId={stationId} active={active} canEdit={canEdit} />}
            </section>

            <CalibrationHistory calibrations={calibrations} referenceCounts={referenceCounts} selectedId={selected?.id ?? null} onSelect={selectVersion} />
            {selected && (
              <div ref={detailRef} className="scroll-mt-4">
                <CalibrationDetail
                  key={selected.id}
                  calibration={selected}
                  previous={calibrations[calibrations.indexOf(selected) + 1] ?? null}
                  station={station}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            )}
          </>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status kalibrasi aktif + nilai live
// ---------------------------------------------------------------------------

function ActiveCalibration({ calibration, stationId }: { calibration: StationCalibration | null; stationId: string }) {
  const { data: live } = useLatestMeasurements(stationId)
  const airGap = live['HYDRO.AIR_GAP']
  const velocity = live['HYDRO.VELOCITY']
  const level = live['HYDRO.WATER_LEVEL']
  const flow = live['HYDRO.FLOW_RATE']

  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="scada-card">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', calibration ? 'bg-status-good/10 text-status-good' : 'bg-accent-yellow/10 text-accent-yellow')}>
            {calibration ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">
              {calibration ? `Kalibrasi versi ${calibration.version} aktif` : 'Belum dikalibrasi'}
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              {calibration
                ? `Berlaku sejak ${formatTimestamp(calibration.effective_from, 'dd MMM yyyy HH:mm')} · ${calibration.method === 'field_reference' ? 'dari pengukuran lapangan' : 'parameter manual'}${calibration.created_by_email ? ` · ${calibration.created_by_email}` : ''}`
                : 'Level air dan debit masih memakai hitungan internal radar. Simpan kalibrasi untuk memakai parameter lokasi ini.'}
            </p>
          </div>
        </div>
        {calibration && (
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Param label="Tinggi pasang" value={`${fmt(calibration.install_height_m, 3)} m`} />
            <Param label="Offset level" value={`${signed(calibration.level_offset_m, 3)} m`} />
            <Param label="Penampang" value={sectionLabel(calibration)} />
            <Param label="Koefisien kecepatan" value={fmt(calibration.velocity_coefficient, 3)} />
          </dl>
        )}
        <CalibrationSchedule key={stationId} calibration={calibration} />
      </div>

      <div className="scada-card">
        <h2 className="text-sm font-semibold text-text-primary">Pembacaan saat ini</h2>
        <p className="mt-0.5 text-xs text-text-secondary">Data mentah radar dan hasil perhitungan sistem</p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Param label="Jarak sensor ke air (mentah)" value={liveValue(airGap?.value, 'm', 3)} quality={airGap?.quality} />
          <Param label="Kecepatan permukaan (mentah)" value={liveValue(velocity?.value, 'm/s', 2)} quality={velocity?.quality} />
          <Param label="Level air" value={liveValue(level?.value, 'm', 3)} quality={level?.quality} />
          <Param label="Debit" value={liveValue(flow?.value, 'm³/s', 3)} quality={flow?.quality} />
        </dl>
      </div>
    </section>
  )
}

/** Jadwal kalibrasi ulang: status umur kalibrasi dan interval per stasiun. */
function CalibrationSchedule({ calibration }: { calibration: StationCalibration | null }) {
  const { station } = useStation()
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()
  const interval = station?.calibration_interval_days ?? 90
  const [draft, setDraft] = useState(String(interval))
  const [saving, setSaving] = useState(false)
  // Daftar stasiun bisa selesai dimuat setelah komponen tampil: ikuti nilai tersimpan.
  useEffect(() => { setDraft(String(interval)) }, [interval])
  const status = calibrationStatus(calibration?.effective_from ?? null, interval)

  async function saveInterval() {
    const days = Number(draft)
    if (!station || !Number.isInteger(days) || days < 7 || days > 730) {
      toast.error('Interval harus bilangan bulat 7–730 hari'); return
    }
    setSaving(true)
    const { error } = await supabase.from('stations').update({ calibration_interval_days: days }).eq('id', station.id)
    setSaving(false)
    if (error) { toast.error(`Gagal menyimpan interval: ${error.message}`); return }
    toast.success(`Interval kalibrasi ulang ${station.name}: ${days} hari`)
    void queryClient.invalidateQueries({ queryKey: ['stations', 'accessible'] })
    void queryClient.invalidateQueries({ queryKey: ['station-overview'] })
  }

  const message = status.state === 'none'
    ? 'Belum pernah dikalibrasi.'
    : status.state === 'overdue'
      ? `Lewat ${Math.abs(status.dueInDays ?? 0)} hari dari jadwal kalibrasi ulang.`
      : `Kalibrasi ulang dalam ${status.dueInDays} hari (umur ${status.ageDays} hari).`

  return (
    <div className="mt-5 rounded-input border border-border bg-surface-2/40 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <span className={cn('mr-2 rounded-full px-2 py-0.5 font-semibold', CALIBRATION_BADGE[status.state])}>{CALIBRATION_LABEL[status.state]}</span>
          <span className="text-text-secondary">{message}</span>
        </p>
        <label className="flex items-center gap-2 text-text-secondary">
          Kalibrasi ulang tiap
          <input type="number" min={7} max={730} step={1} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!hasRole('admin')} aria-label="Interval kalibrasi ulang (hari)" className="scada-input w-20 py-1 text-xs" />
          hari
          {hasRole('admin') && Number(draft) !== interval && (
            <button type="button" onClick={() => void saveInterval()} disabled={saving} className="scada-button-secondary px-2 py-1 text-[11px]">{saving ? 'Menyimpan…' : 'Simpan'}</button>
          )}
        </label>
      </div>
      <p className="mt-2 text-text-secondary">
        Kalibrasi ulang juga diperlukan di luar jadwal setelah banjir besar, radar dipindah atau disetel ulang, atau bentuk saluran berubah.
      </p>
    </div>
  )
}

const CALIBRATION_BADGE: Record<CalibrationState, string> = {
  none: 'bg-accent-yellow/15 text-accent-yellow',
  ok: 'bg-status-good/10 text-status-good',
  due_soon: 'bg-accent-blue/10 text-accent-blue',
  overdue: 'bg-accent-red/10 text-accent-red',
}

// ---------------------------------------------------------------------------
// Wizard: kalibrasi dari pengukuran lapangan
// ---------------------------------------------------------------------------

interface PointDraft {
  id: number
  measuredAt: string // nilai input datetime-local
  refLevel: string
  refMode: 'velocity' | 'flow'
  refValue: string
  radarAirGap: string
  radarVelocity: string
  radarAt: string | null
  fetching: boolean
  fetchError: string | null
}

let pointCounter = 0
function newPoint(): PointDraft {
  pointCounter += 1
  return { id: pointCounter, measuredAt: toLocalInput(new Date()), refLevel: '', refMode: 'velocity', refValue: '', radarAirGap: '', radarVelocity: '', radarAt: null, fetching: false, fetchError: null }
}

function FieldCalibration({ stationId, active, canEdit }: { stationId: string; active: StationCalibration | null; canEdit: boolean }) {
  const [geometry, setGeometry] = useState(() => geometryDraft(active))
  const [points, setPoints] = useState<PointDraft[]>(() => [newPoint()])
  const [notes, setNotes] = useState('')
  const apply = useApplyCalibration(stationId)

  const geometryParsed = parseGeometry(geometry)
  const referencePoints: ReferencePoint[] = points.map((p) => ({
    refLevel: num(p.refLevel),
    refVelocity: p.refMode === 'velocity' ? num(p.refValue) : null,
    refFlow: p.refMode === 'flow' ? num(p.refValue) : null,
    radarAirGap: num(p.radarAirGap),
    radarVelocity: num(p.radarVelocity),
  }))
  const fit = geometryParsed ? fitCalibration(geometryParsed, referencePoints) : null
  const proposed: CalibrationParams | null = geometryParsed && fit ? {
    ...geometryParsed,
    level_offset_m: round(fit.levelOffset ?? active?.level_offset_m ?? 0, 4),
    velocity_coefficient: round(fit.velocityCoefficient ?? active?.velocity_coefficient ?? 0.85, 4),
  } : null
  const problems = validateProposal(proposed, fit)
  // Form baru belum diisi: tampilkan petunjuk netral, bukan daftar error merah.
  const touched = points.some((p) => p.refLevel || p.refValue || p.radarAirGap || p.radarVelocity)

  function updatePoint(id: number, patch: Partial<PointDraft>) {
    setPoints((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function loadRadar(point: PointDraft) {
    const at = new Date(point.measuredAt)
    if (Number.isNaN(at.getTime())) return
    updatePoint(point.id, { fetching: true, fetchError: null })
    try {
      const reading = await fetchRadarReading(stationId, at)
      updatePoint(point.id, {
        fetching: false,
        radarAirGap: reading.airGap == null ? point.radarAirGap : String(reading.airGap),
        radarVelocity: reading.velocity == null ? point.radarVelocity : String(reading.velocity),
        radarAt: reading.at,
        fetchError: reading.airGap == null && reading.velocity == null ? 'Tidak ada data radar GOOD dalam ±5 menit dari waktu ini' : null,
      })
    } catch (error) {
      updatePoint(point.id, { fetching: false, fetchError: (error as Error).message })
    }
  }

  function save() {
    if (!proposed || problems.length) return
    const references: CalibrationReferenceInput[] = points.map((p, i) => ({
      measured_at: new Date(p.measuredAt).toISOString(),
      ref_level_m: referencePoints[i]!.refLevel,
      ref_velocity_ms: referencePoints[i]!.refVelocity,
      ref_flow_m3s: referencePoints[i]!.refFlow,
      radar_air_gap_m: referencePoints[i]!.radarAirGap,
      radar_velocity_ms: referencePoints[i]!.radarVelocity,
    }))
    apply.mutate({ params: proposed, references, notes })
  }

  return (
    <div className="space-y-6">
      <Step number={1} title="Geometri saluran dan pemasangan" description="Ukur langsung di lokasi. Tinggi pasang adalah jarak vertikal dari permukaan bawah radar ke dasar saluran.">
        <GeometryFields value={geometry} onChange={setGeometry} disabled={!canEdit} />
      </Step>

      <Step number={2} title="Pengukuran acuan" description="Catat pembacaan papan duga dan current meter, lalu ambil data radar pada waktu yang sama. Semakin banyak titik pada kondisi aliran berbeda, semakin baik.">
        <div className="space-y-3">
          {points.map((point, index) => (
            <div key={point.id} className="rounded-card border border-border bg-surface-2/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-text-primary">Titik {index + 1}</p>
                {points.length > 1 && (
                  <button type="button" onClick={() => setPoints((prev) => prev.filter((p) => p.id !== point.id))} aria-label={`Hapus titik ${index + 1}`} className="rounded-input p-1 text-text-secondary hover:bg-accent-red/10 hover:text-accent-red">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Waktu pengukuran">
                  <input type="datetime-local" value={point.measuredAt} onChange={(e) => updatePoint(point.id, { measuredAt: e.target.value })} className="scada-input text-sm" />
                </Field>
                <Field label="Papan duga / meteran (m)">
                  <input type="number" step="any" inputMode="decimal" value={point.refLevel} onChange={(e) => updatePoint(point.id, { refLevel: e.target.value })} placeholder="mis. 0,85" className="scada-input text-sm" />
                </Field>
                <Field label={point.refMode === 'velocity' ? 'Current meter: kecepatan rata-rata (m/s)' : 'Current meter: debit (m³/s)'}>
                  <div className="flex gap-1">
                    <select aria-label="Jenis hasil current meter" value={point.refMode} onChange={(e) => updatePoint(point.id, { refMode: e.target.value as PointDraft['refMode'] })} className="scada-input w-24 text-xs">
                      <option value="velocity">m/s</option>
                      <option value="flow">m³/s</option>
                    </select>
                    <input type="number" step="any" inputMode="decimal" value={point.refValue} onChange={(e) => updatePoint(point.id, { refValue: e.target.value })} placeholder="opsional" className="scada-input text-sm" />
                  </div>
                </Field>
                <Field label="Data radar pada waktu tsb.">
                  <button type="button" onClick={() => void loadRadar(point)} disabled={point.fetching} className="scada-button-secondary w-full justify-center disabled:opacity-60">
                    {point.fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />} Ambil data radar
                  </button>
                </Field>
                <Field label="Radar: jarak ke air (m)">
                  <input type="number" step="any" value={point.radarAirGap} onChange={(e) => updatePoint(point.id, { radarAirGap: e.target.value })} className="scada-input text-sm" />
                </Field>
                <Field label="Radar: kecepatan permukaan (m/s)">
                  <input type="number" step="any" value={point.radarVelocity} onChange={(e) => updatePoint(point.id, { radarVelocity: e.target.value })} className="scada-input text-sm" />
                </Field>
                <div className="flex items-end text-[11px] text-text-secondary sm:col-span-2">
                  {point.fetchError
                    ? <span className="text-accent-yellow">{point.fetchError}</span>
                    : point.radarAt ? <span>Data radar dari {formatTimestamp(point.radarAt, 'dd MMM yyyy HH:mm:ss')}</span>
                    : <span>Isi manual bila data radar tidak tersedia di sistem.</span>}
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setPoints((prev) => [...prev, newPoint()])} className="scada-button-secondary">
            <Plus className="h-3 w-3" /> Tambah titik pengukuran
          </button>
        </div>
      </Step>

      <Step number={3} title="Hasil perhitungan" description="Periksa selisih sebelum dan sesudah kalibrasi pada setiap titik sebelum menyimpan.">
        {!proposed ? (
          <p className="text-xs text-text-secondary">Lengkapi geometri saluran terlebih dahulu.</p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Param label="Offset level" value={`${signed(proposed.level_offset_m, 3)} m`} hint={fit?.levelPoints ? `dari ${fit.levelPoints} titik${fit.offsetSpread ? ` · sebaran ${fmt(fit.offsetSpread, 3)} m` : ''}` : 'tidak berubah (tidak ada data papan duga)'} />
              <Param label="Koefisien kecepatan" value={fmt(proposed.velocity_coefficient, 3)} hint={fit?.velocityPoints ? `dari ${fit.velocityPoints} titik${fit.coefficientSpread ? ` · sebaran ${fmt(fit.coefficientSpread, 3)}` : ''}` : 'tidak berubah (tidak ada data current meter)'} />
              <Param label="Tinggi pasang" value={`${fmt(proposed.install_height_m, 3)} m`} />
              <Param label="Penampang" value={sectionLabel(proposed)} />
            </dl>
            <ComparisonTable points={referencePoints} before={active} after={proposed} />
            {problems.length > 0 && (touched ? (
              <ul className="space-y-1 rounded-input border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-xs text-accent-red">
                {problems.map((p) => <li key={p}>• {p}</li>)}
              </ul>
            ) : (
              <p className="text-xs text-text-secondary">Isi minimal satu titik pengukuran (papan duga atau current meter, beserta data radar) untuk menghitung kalibrasi.</p>
            ))}
            <Field label="Catatan (alat yang dipakai, kondisi aliran, petugas)">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="scada-input text-sm" disabled={!canEdit} />
            </Field>
            {canEdit && (
              <button type="button" onClick={save} disabled={problems.length > 0 || apply.isPending} className="inline-flex items-center gap-2 rounded-input bg-accent-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-background">
                {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan kalibrasi
              </button>
            )}
          </div>
        )}
      </Step>
    </div>
  )
}

function ComparisonTable({ points, before, after }: { points: ReferencePoint[]; before: StationCalibration | null; after: CalibrationParams }) {
  const rows = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.radarAirGap != null && (p.refLevel != null || p.radarVelocity != null))
  if (rows.length === 0) return <p className="text-xs text-text-secondary">Belum ada titik dengan data radar untuk dibandingkan.</p>

  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface-2 text-left text-text-secondary">
          <tr>
            <th className="px-3 py-2 font-medium">Titik</th>
            <th className="px-3 py-2 font-medium">Level acuan</th>
            <th className="px-3 py-2 font-medium">Level sebelum</th>
            <th className="px-3 py-2 font-medium">Level sesudah</th>
            <th className="px-3 py-2 font-medium">Debit sesudah</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, i }) => {
            const levelBefore = before ? calibratedLevel(before, p.radarAirGap!) : null
            const levelAfter = calibratedLevel(after, p.radarAirGap!)
            const flowAfter = p.radarVelocity != null ? calibratedFlow(after, p.radarAirGap!, p.radarVelocity) : null
            return (
              <tr key={i} className="border-t border-border tabular-nums">
                <td className="px-3 py-2 text-text-primary">{i + 1}</td>
                <td className="px-3 py-2">{p.refLevel != null ? `${fmt(p.refLevel, 3)} m` : '—'}</td>
                <td className="px-3 py-2">{levelBefore != null ? <WithError value={levelBefore} reference={p.refLevel} /> : <span className="text-text-secondary">hitungan radar</span>}</td>
                <td className="px-3 py-2"><WithError value={levelAfter} reference={p.refLevel} /></td>
                <td className="px-3 py-2">{flowAfter != null ? `${fmt(flowAfter, 3)} m³/s` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function WithError({ value, reference }: { value: number; reference: number | null }) {
  const error = reference != null ? value - reference : null
  return (
    <span>
      {fmt(value, 3)} m
      {error != null && <span className={cn('ml-1.5', Math.abs(error) <= 0.01 ? 'text-status-good' : 'text-accent-yellow')}>({signed(error, 3)})</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Parameter manual
// ---------------------------------------------------------------------------

function ManualCalibration({ stationId, active, canEdit }: { stationId: string; active: StationCalibration | null; canEdit: boolean }) {
  const [geometry, setGeometry] = useState(() => geometryDraft(active))
  const [offset, setOffset] = useState(String(active?.level_offset_m ?? 0))
  const [coefficient, setCoefficient] = useState(String(active?.velocity_coefficient ?? 0.85))
  const [notes, setNotes] = useState('')
  const apply = useApplyCalibration(stationId)

  const parsed = parseGeometry(geometry)
  const params: CalibrationParams | null = parsed && num(offset) != null && num(coefficient) != null
    ? { ...parsed, level_offset_m: num(offset)!, velocity_coefficient: num(coefficient)! }
    : null
  const problems = validateProposal(params, null)

  return (
    <div className="space-y-5">
      <GeometryFields value={geometry} onChange={setGeometry} disabled={!canEdit} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Offset level (m)" hint="Ditambahkan ke level hitungan; positif bila radar membaca lebih rendah dari papan duga">
          <input type="number" step="any" value={offset} onChange={(e) => setOffset(e.target.value)} className="scada-input text-sm" disabled={!canEdit} />
        </Field>
        <Field label="Koefisien kecepatan" hint="Kecepatan rata-rata ÷ kecepatan permukaan; umumnya 0,80–0,90">
          <input type="number" step="any" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} className="scada-input text-sm" disabled={!canEdit} />
        </Field>
      </div>
      {problems.length > 0 && (
        <ul className="space-y-1 rounded-input border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-xs text-accent-red">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}
      <Field label="Catatan">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="scada-input text-sm" disabled={!canEdit} />
      </Field>
      {canEdit && (
        <button type="button" onClick={() => params && apply.mutate({ params, references: [], notes })} disabled={!params || problems.length > 0 || apply.isPending} className="inline-flex items-center gap-2 rounded-input bg-accent-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-background">
          {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Simpan kalibrasi
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Riwayat
// ---------------------------------------------------------------------------

function CalibrationHistory({ calibrations, referenceCounts, selectedId, onSelect }: {
  calibrations: StationCalibration[]
  referenceCounts: Record<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Riwayat kalibrasi</h2>
        <p className="mt-0.5 text-xs text-text-secondary">Setiap perubahan disimpan sebagai versi baru dan tercatat di Audit Events. Pilih versi untuk melihat evaluasi akurasi dan mencetak laporan.</p>
      </div>
      {calibrations.length === 0 ? (
        <EmptyState title="Belum ada riwayat" description="Kalibrasi pertama akan muncul di sini setelah disimpan." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-left text-text-secondary">
              <tr>
                {['Versi', 'Berlaku sejak', 'Metode', 'Tinggi pasang', 'Offset', 'Penampang', 'Koef. kecepatan', 'Oleh', 'Catatan'].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>)}
                <th className="px-4 py-2"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {calibrations.map((cal, index) => (
                <tr key={cal.id} onClick={() => onSelect(cal.id)} aria-selected={selectedId === cal.id} className={cn('cursor-pointer border-t border-border tabular-nums transition-colors', selectedId === cal.id ? 'bg-accent-blue/10' : 'hover:bg-surface-2/60')}>
                  <td className="whitespace-nowrap px-4 py-2 font-semibold text-text-primary">v{cal.version}{index === 0 && <span className="ml-2 rounded-full bg-status-good/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-good">aktif</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2">{formatTimestamp(cal.effective_from, 'dd MMM yyyy HH:mm')}</td>
                  <td className="whitespace-nowrap px-4 py-2">{cal.method === 'field_reference' ? `Lapangan (${referenceCounts[cal.id] ?? 0} titik)` : 'Manual'}</td>
                  <td className="whitespace-nowrap px-4 py-2">{fmt(cal.install_height_m, 3)} m</td>
                  <td className="whitespace-nowrap px-4 py-2">{signed(cal.level_offset_m, 3)} m</td>
                  <td className="whitespace-nowrap px-4 py-2">{sectionLabel(cal)}</td>
                  <td className="whitespace-nowrap px-4 py-2">{fmt(cal.velocity_coefficient, 3)}</td>
                  <td className="whitespace-nowrap px-4 py-2">{cal.created_by_email ?? '—'}</td>
                  <td className="min-w-[12rem] px-4 py-2 text-text-secondary">{cal.notes ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(cal.id) }} className="scada-button-secondary whitespace-nowrap px-2.5 py-1 text-[11px]">Detail & laporan</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Komponen & util bersama
// ---------------------------------------------------------------------------

interface GeometryDraft { installHeight: string; sectionType: SectionType; bottomWidth: string; sideSlope: string }

function geometryDraft(cal: StationCalibration | null): GeometryDraft {
  return {
    installHeight: cal ? String(cal.install_height_m) : '',
    sectionType: cal?.section_type ?? 'rectangle',
    bottomWidth: cal ? String(cal.bottom_width_m) : '',
    sideSlope: cal ? String(cal.side_slope) : '0',
  }
}

function parseGeometry(g: GeometryDraft): Omit<CalibrationParams, 'level_offset_m' | 'velocity_coefficient'> | null {
  const installHeight = num(g.installHeight)
  const bottomWidth = num(g.bottomWidth)
  const sideSlope = g.sectionType === 'trapezoid' ? num(g.sideSlope) : 0
  if (installHeight == null || bottomWidth == null || sideSlope == null) return null
  return { install_height_m: installHeight, section_type: g.sectionType, bottom_width_m: bottomWidth, side_slope: sideSlope }
}

function GeometryFields({ value, onChange, disabled }: { value: GeometryDraft; onChange: (v: GeometryDraft) => void; disabled?: boolean }) {
  const set = (patch: Partial<GeometryDraft>) => onChange({ ...value, ...patch })
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Tinggi pasang radar (m)" hint="Radar ke dasar saluran">
        <input type="number" step="any" min="0" value={value.installHeight} onChange={(e) => set({ installHeight: e.target.value })} placeholder="mis. 3,000" className="scada-input text-sm" disabled={disabled} />
      </Field>
      <Field label="Bentuk penampang">
        <select value={value.sectionType} onChange={(e) => set({ sectionType: e.target.value as SectionType })} className="scada-input text-sm" disabled={disabled}>
          <option value="rectangle">Persegi</option>
          <option value="trapezoid">Trapesium</option>
        </select>
      </Field>
      <Field label="Lebar dasar saluran (m)">
        <input type="number" step="any" min="0" value={value.bottomWidth} onChange={(e) => set({ bottomWidth: e.target.value })} placeholder="mis. 2,000" className="scada-input text-sm" disabled={disabled} />
      </Field>
      {value.sectionType === 'trapezoid' && (
        <Field label="Kemiringan talud (H:V)" hint="Jarak horizontal per 1 m tinggi">
          <input type="number" step="any" min="0" value={value.sideSlope} onChange={(e) => set({ sideSlope: e.target.value })} placeholder="mis. 1" className="scada-input text-sm" disabled={disabled} />
        </Field>
      )}
    </div>
  )
}

function validateProposal(params: CalibrationParams | null, fit: ReturnType<typeof fitCalibration> | null): string[] {
  if (!params) return ['Tinggi pasang dan lebar dasar saluran wajib diisi.']
  const problems: string[] = []
  if (params.install_height_m <= 0 || params.install_height_m > 65) problems.push('Tinggi pasang harus antara 0 dan 65 m (rentang ukur radar).')
  if (params.bottom_width_m <= 0) problems.push('Lebar dasar saluran harus lebih dari 0.')
  if (params.section_type === 'trapezoid' && (params.side_slope < 0 || params.side_slope > 10)) problems.push('Kemiringan talud harus antara 0 dan 10.')
  if (Math.abs(params.level_offset_m) > 5) problems.push('Offset level lebih dari 5 m; periksa tinggi pasang atau pembacaan papan duga.')
  if (params.velocity_coefficient <= 0 || params.velocity_coefficient > 1.5) problems.push('Koefisien kecepatan di luar 0–1,5; periksa data current meter.')
  if (fit && fit.levelPoints === 0 && fit.velocityPoints === 0) problems.push('Belum ada titik pengukuran yang lengkap (papan duga atau current meter + data radar).')
  return problems
}

function Step({ number, title, description, children }: { number: number; title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-[2rem_1fr]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-blue/10 text-sm font-bold text-accent-blue">{number}</span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mb-3 mt-0.5 text-xs text-text-secondary">{description}</p>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-text-secondary">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10px] text-text-secondary/80">{hint}</span>}
    </label>
  )
}

function Param({ label, value, hint, quality }: { label: string; value: string; hint?: string; quality?: string }) {
  return (
    <div className="min-w-0 rounded-input bg-surface-2/60 px-3 py-2">
      <dt className="truncate text-[10px] text-text-secondary">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-text-primary">{value}</dd>
      {hint && <dd className="mt-0.5 text-[10px] text-text-secondary">{hint}</dd>}
      {quality && quality !== 'good' && <dd className="mt-0.5 text-[10px] text-accent-yellow">{quality}</dd>}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn('rounded-[5px] px-3 py-1.5 font-medium transition-colors', active ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}>
      {children}
    </button>
  )
}

function sectionLabel(p: Pick<CalibrationParams, 'section_type' | 'bottom_width_m' | 'side_slope'>) {
  return p.section_type === 'trapezoid'
    ? `Trapesium ${fmt(p.bottom_width_m, 2)} m, talud ${fmt(p.side_slope, 2)}`
    : `Persegi ${fmt(p.bottom_width_m, 2)} m`
}

function num(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function round(value: number, digits: number) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function fmt(value: number, digits: number) {
  return value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function signed(value: number, digits: number) {
  return `${value > 0 ? '+' : ''}${fmt(value, digits)}`
}

function liveValue(value: number | null | undefined, unit: string, digits: number) {
  return value == null ? '—' : `${fmt(value, digits)} ${unit}`
}

function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

