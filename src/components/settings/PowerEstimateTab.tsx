import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase, type StationPowerMonthly } from '@/lib/supabase'
import { useStation } from '@/lib/station'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { GRAVITY, MONTH_NAMES, currentMonthWib, daysInMonth, estimatePowerKw, type PowerParams } from '@/lib/powerEstimate'
import { Field, SaveBtn, Section } from './atoms'

// ============================================================================
// Parameter estimasi daya (05 + 09-daya-tabel-pltmh.sql). Rumus sama dengan
// tabel rencana produksi PLTMH; perhitungan di sini hanya untuk pratinjau,
// nilai yang tersimpan dihitung oleh database.
// ============================================================================

interface StationDraft { head: string; turbine: string; generator: string; maxKw: string; designFlow: string }
interface MonthDraft { head: string; permit: string; drying: string; maintenance: string }

const EMPTY_MONTHS: MonthDraft[] = MONTH_NAMES.map(() => ({ head: '', permit: '', drying: '0', maintenance: '0' }))

/** Teks input → angka; kosong = null, tidak valid = NaN. */
function parse(value: string): number | null {
  const text = value.trim().replace(',', '.')
  if (text === '') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : Number.NaN
}

const toText = (value: number | null | undefined) => (value == null ? '' : String(value).replace('.', ','))
const format = (value: number, digits = 1) => value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const invalid = (value: number | null) => value != null && Number.isNaN(value)

/** Pesan yang lebih jelas bila file SQL 09 belum dijalankan di Supabase. */
function saveErrorMessage(message: string) {
  return /station_power_monthly|power_turbine_efficiency|power_generator_efficiency/.test(message)
    ? 'Database belum diperbarui. Jalankan database/09-daya-tabel-pltmh.sql di Supabase SQL Editor.'
    : message
}

export function PowerEstimateTab() {
  const { station } = useStation()
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()
  const canEdit = hasRole('admin')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<StationDraft>({ head: '', turbine: '', generator: '', maxKw: '', designFlow: '' })
  const [months, setMonths] = useState<MonthDraft[]>(EMPTY_MONTHS)
  const thisMonth = currentMonthWib()
  const year = new Date().getFullYear()

  const monthlyQuery = useQuery({
    queryKey: ['station-power-monthly', station?.id],
    enabled: !!station,
    queryFn: async (): Promise<StationPowerMonthly[]> => {
      const { data, error } = await supabase.from('station_power_monthly').select('*').eq('station_id', station!.id)
      if (error) throw error
      return (data ?? []) as StationPowerMonthly[]
    },
  })

  // Isi ulang form saat stasiun berganti atau data selesai dimuat.
  useEffect(() => {
    if (!station) return
    setDraft({
      head: toText(station.power_head_m),
      turbine: toText(station.power_turbine_efficiency),
      generator: toText(station.power_generator_efficiency),
      maxKw: toText(station.power_max_kw),
      designFlow: toText(station.power_design_flow_m3s),
    })
  }, [station])

  useEffect(() => {
    const rows = monthlyQuery.data ?? []
    setMonths(MONTH_NAMES.map((_, index) => {
      const row = rows.find((item) => item.month === index + 1)
      return row
        ? { head: toText(row.head_m), permit: toText(row.permit_flow_m3s), drying: String(row.drying_days), maintenance: String(row.maintenance_days) }
        : EMPTY_MONTHS[index]!
    }))
  }, [monthlyQuery.data])

  const head = parse(draft.head)
  const turbine = parse(draft.turbine)
  const generator = parse(draft.generator)
  const maxKw = parse(draft.maxKw)
  const designFlow = parse(draft.designFlow)

  const parsedMonths = months.map((row, index) => {
    const month = index + 1
    const days = daysInMonth(year, month)
    return { month, days, head: parse(row.head), permit: parse(row.permit), drying: parse(row.drying), maintenance: parse(row.maintenance) }
  })

  const active = head != null || parsedMonths.some((row) => row.head != null)

  const error = (() => {
    if (invalid(head) || (head != null && (head <= 0 || head > 1000))) return 'Rated head bawaan harus lebih dari 0 dan paling besar 1000 m.'
    for (const [label, value] of [['turbin', turbine], ['generator', generator]] as const) {
      if (invalid(value) || (value != null && (value <= 0 || value > 1))) return `Efisiensi ${label} diisi antara 0 dan 1, misalnya 0,91.`
    }
    if (active && (turbine == null || generator == null)) return 'Isi efisiensi turbin dan generator.'
    if (invalid(maxKw) || (maxKw != null && maxKw <= 0)) return 'Daya terpasang harus lebih dari 0 kW, atau kosongkan.'
    if (invalid(designFlow) || (designFlow != null && designFlow <= 0)) return 'Debit desain harus lebih dari 0 m³/s, atau kosongkan.'
    for (const row of parsedMonths) {
      const name = MONTH_NAMES[row.month - 1]
      if (invalid(row.head) || (row.head != null && (row.head <= 0 || row.head > 1000))) return `Rated head ${name} harus lebih dari 0 m, atau kosongkan.`
      if (invalid(row.permit) || (row.permit != null && row.permit < 0)) return `Debit PSDA ${name} tidak boleh negatif.`
      for (const value of [row.drying, row.maintenance]) {
        if (value == null || !Number.isInteger(value) || value < 0) return `Hari pengeringan/pemeliharaan ${name} diisi bilangan bulat 0 atau lebih.`
      }
      if ((row.drying ?? 0) + (row.maintenance ?? 0) > row.days) return `Hari tidak produksi ${name} melebihi ${row.days} hari.`
    }
    return null
  })()

  const efficiency = turbine != null && generator != null && !invalid(turbine) && !invalid(generator) ? turbine * generator : null
  const paramsFor = (monthHead: number | null): PowerParams | null => {
    const usedHead = monthHead ?? head
    if (error || usedHead == null || efficiency == null) return null
    return { headM: usedHead, efficiency, maxKw, designFlowM3s: designFlow }
  }

  // Tabel rencana produksi: debit PSDA → daya mampu → produksi kWh.
  const plan = parsedMonths.map((row) => {
    const params = paramsFor(row.head)
    const productionDays = row.days - (row.drying ?? 0) - (row.maintenance ?? 0)
    const kw = params && row.permit != null ? estimatePowerKw(row.permit, params) : null
    return { ...row, usedHead: params?.headM ?? null, productionDays, kw, kwh: kw == null ? null : kw * productionDays * 24 }
  })
  const planned = plan.filter((row) => row.kw != null)
  const totals = {
    days: plan.reduce((sum, row) => sum + row.days, 0),
    drying: plan.reduce((sum, row) => sum + (row.drying ?? 0), 0),
    maintenance: plan.reduce((sum, row) => sum + (row.maintenance ?? 0), 0),
    avgKw: planned.length ? planned.reduce((sum, row) => sum + row.kw!, 0) / planned.length : null,
    kwh: planned.length ? planned.reduce((sum, row) => sum + row.kwh!, 0) : null,
  }

  // Pratinjau debit terukur → daya untuk bulan berjalan.
  const previewParams = paramsFor(parsedMonths[thisMonth - 1]?.head ?? null)
  const preview = (() => {
    if (!previewParams) return []
    const perFlow = GRAVITY * previewParams.headM * previewParams.efficiency
    const fullFlow = Math.min(previewParams.maxKw != null ? previewParams.maxKw / perFlow : 8, previewParams.designFlowM3s ?? Number.POSITIVE_INFINITY)
    const last = Math.min(Math.max(6, Math.ceil(fullFlow) + 1), 20)
    return Array.from({ length: last }, (_, i) => {
      const flow = i + 1
      const kw = estimatePowerKw(flow, previewParams)
      const capped = (previewParams.maxKw != null && kw >= previewParams.maxKw) || (previewParams.designFlowM3s != null && flow > previewParams.designFlowM3s)
      return { flow, kw, capped }
    })
  })()

  async function save() {
    if (!station || error) return
    setSaving(true)
    const { error: stationError } = await supabase.from('stations').update({
      power_head_m: head,
      power_turbine_efficiency: turbine,
      power_generator_efficiency: generator,
      power_efficiency: efficiency ?? station.power_efficiency,
      power_max_kw: maxKw,
      power_design_flow_m3s: designFlow,
    }).eq('id', station.id)
    const { error: monthlyError } = stationError
      ? { error: null }
      : await supabase.from('station_power_monthly').upsert(
          parsedMonths.map((row) => ({
            station_id: station.id,
            month: row.month,
            head_m: row.head,
            permit_flow_m3s: row.permit,
            drying_days: row.drying ?? 0,
            maintenance_days: row.maintenance ?? 0,
          })),
          { onConflict: 'station_id,month' },
        )
    setSaving(false)
    const saveError = stationError ?? monthlyError
    if (saveError) { toast.error(`Gagal menyimpan: ${saveErrorMessage(saveError.message)}`); return }
    toast.success(active ? `Parameter daya ${station.name} disimpan` : `Estimasi daya ${station.name} dinonaktifkan`)
    void queryClient.invalidateQueries({ queryKey: ['stations', 'accessible'] })
    void queryClient.invalidateQueries({ queryKey: ['station-power-monthly', station.id] })
  }

  const setStation = (key: keyof StationDraft) => (event: React.ChangeEvent<HTMLInputElement>) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))
  const setMonth = (index: number, key: keyof MonthDraft) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setMonths((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: event.target.value } : row)))

  const cellInput = 'scada-input w-[4.5rem] px-2 py-1 text-right text-xs tabular-nums'

  return (
    <div className="space-y-4">
      <Section title={`Parameter pembangkit ${station?.name ?? ''}`.trim()}>
        <p className="text-xs leading-5 text-text-secondary">
          Selama energy meter belum terpasang, daya dihitung dari debit radar dengan rumus tabel produksi PLTMH:
          <span className="font-mono text-text-primary"> 9,8 × debit × rated head × η turbin × η generator</span>.
          Debit di atas debit desain tidak dihitung, dan daya tidak melebihi daya terpasang. Rated head mengikuti bulan
          pengukuran (tabel di bawah). Perubahan berlaku untuk data berikutnya.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Daya terpasang (kW)">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.maxKw} onChange={setStation('maxKw')} disabled={!canEdit} placeholder="mis. 320" />
          </Field>
          <Field label="Debit desain sesuai FS kontrak (m³/s)">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.designFlow} onChange={setStation('designFlow')} disabled={!canEdit} placeholder="mis. 8,2" />
          </Field>
          <Field label="Rated head bawaan (m) — bila bulan tidak diisi">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.head} onChange={setStation('head')} disabled={!canEdit} placeholder="mis. 4,75" />
          </Field>
          <Field label="Efisiensi turbin (0–1)">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.turbine} onChange={setStation('turbine')} disabled={!canEdit} placeholder="mis. 0,91" />
          </Field>
          <Field label="Efisiensi generator (0–1)">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.generator} onChange={setStation('generator')} disabled={!canEdit} placeholder="mis. 0,93" />
          </Field>
          <Field label="Efisiensi total">
            <p className="flex h-9 items-center text-sm font-semibold tabular-nums text-text-primary">{efficiency == null ? '–' : format(efficiency, 4)}</p>
          </Field>
        </div>
        {!active && !error && <p className="text-xs text-text-secondary">Rated head belum diisi: estimasi daya nonaktif untuk stasiun ini.</p>}
      </Section>

      <Section title="Parameter bulanan & rencana produksi">
        <p className="text-xs leading-5 text-text-secondary">
          Disalin dari tabel rencana produksi PLTMH. Daya mampu dihitung dari debit rencana PSDA; produksi =
          daya mampu × (hari − pengeringan − pemeliharaan) × 24. Saat data masuk, sistem memakai debit terukur radar,
          bukan debit PSDA.
        </p>
        {monthlyQuery.error && (
          <p role="alert" className="text-xs text-accent-red">{saveErrorMessage((monthlyQuery.error as Error).message)}</p>
        )}
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[46rem] text-xs">
            <thead>
              <tr className="border-b border-border text-left align-bottom text-text-secondary">
                <th className="py-2 pr-3 font-medium">Bulan</th>
                <th className="py-2 pr-3 text-right font-medium">Rated head (m)</th>
                <th className="py-2 pr-3 text-right font-medium">Debit PSDA (m³/s)</th>
                <th className="py-2 pr-3 text-right font-medium">Pengeringan (hari)</th>
                <th className="py-2 pr-3 text-right font-medium">Pemeliharaan (hari)</th>
                <th className="py-2 pr-3 text-right font-medium">Hari produksi</th>
                <th className="py-2 pr-3 text-right font-medium">Daya mampu (kW)</th>
                <th className="py-2 text-right font-medium">Produksi (kWh)</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((row, index) => (
                <tr key={row.month} className={cn('border-b border-border last:border-0', row.month === thisMonth && 'bg-accent-blue/5')}>
                  <td className="py-1.5 pr-3 text-text-primary">
                    {MONTH_NAMES[index]}
                    {row.month === thisMonth && <span className="ml-1.5 rounded-full bg-accent-blue/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-blue">bulan ini</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <input aria-label={`Rated head ${MONTH_NAMES[index]}`} className={cellInput} inputMode="decimal" value={months[index]!.head} onChange={setMonth(index, 'head')} disabled={!canEdit} placeholder={draft.head || '–'} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <input aria-label={`Debit PSDA ${MONTH_NAMES[index]}`} className={cellInput} inputMode="decimal" value={months[index]!.permit} onChange={setMonth(index, 'permit')} disabled={!canEdit} placeholder="–" />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <input aria-label={`Hari pengeringan ${MONTH_NAMES[index]}`} className={cellInput} inputMode="numeric" value={months[index]!.drying} onChange={setMonth(index, 'drying')} disabled={!canEdit} />
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <input aria-label={`Hari pemeliharaan ${MONTH_NAMES[index]}`} className={cellInput} inputMode="numeric" value={months[index]!.maintenance} onChange={setMonth(index, 'maintenance')} disabled={!canEdit} />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-text-primary">{row.productionDays}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-text-primary">{row.kw == null ? '–' : format(row.kw)}</td>
                  <td className="py-1.5 text-right tabular-nums text-text-primary">{row.kwh == null ? '–' : format(row.kwh, 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold text-text-primary">
                <td className="py-2 pr-3">Jumlah</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right tabular-nums">{totals.drying}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{totals.maintenance}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{totals.days - totals.drying - totals.maintenance}</td>
                <td className="py-2 pr-3 text-right tabular-nums" title="Rata-rata daya mampu">{totals.avgKw == null ? '–' : `${format(totals.avgKw)} (rata-rata)`}</td>
                <td className="py-2 text-right tabular-nums">{totals.kwh == null ? '–' : format(totals.kwh, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {error && <p role="alert" className="text-xs text-accent-red">{error}</p>}
        {canEdit
          ? <SaveBtn saving={saving} onClick={() => void save()} />
          : <p className="text-xs text-text-secondary">Hanya admin yang dapat mengubah parameter ini.</p>}
      </Section>

      <Section title={`Pratinjau debit terukur → daya (${MONTH_NAMES[thisMonth - 1]})`}>
        {preview.length === 0 ? (
          <p className="text-xs text-text-secondary">Isi rated head serta efisiensi turbin dan generator untuk melihat pratinjau.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="py-2 pr-4 font-medium">Debit (m³/s)</th>
                  <th className="py-2 pr-4 font-medium">Estimasi daya (kW)</th>
                  <th className="py-2 font-medium">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.flow} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-4 tabular-nums text-text-primary">{row.flow}</td>
                    <td className="py-1.5 pr-4 font-semibold tabular-nums text-text-primary">{format(row.kw)}</td>
                    <td className="py-1.5 text-text-secondary">{row.capped ? 'dibatasi daya terpasang/debit desain' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
