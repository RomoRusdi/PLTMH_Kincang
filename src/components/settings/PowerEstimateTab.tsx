import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useStation } from '@/lib/station'
import { useAuth } from '@/lib/auth'
import { Field, SaveBtn, Section } from './atoms'

// ============================================================================
// Parameter estimasi daya dari debit (migrasi 005). Rumus yang sama dengan
// fungsi database estimate_power_kw, dipakai di sini hanya untuk pratinjau.
// ============================================================================

interface Draft { head: string; efficiency: string; maxKw: string; designFlow: string }

/** Teks input → angka; kosong = null, tidak valid = NaN. */
function parse(value: string): number | null {
  const text = value.trim().replace(',', '.')
  if (text === '') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : Number.NaN
}

function estimate(flow: number, head: number, efficiency: number, maxKw: number | null, designFlow: number | null): number {
  const turbineFlow = Math.min(Math.max(flow, 0), designFlow ?? Number.POSITIVE_INFINITY)
  return Math.min(9.81 * turbineFlow * head * efficiency, maxKw ?? Number.POSITIVE_INFINITY)
}

const format = (value: number, digits = 1) => value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function PowerEstimateTab() {
  const { station } = useStation()
  const { hasRole } = useAuth()
  const queryClient = useQueryClient()
  const canEdit = hasRole('admin')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>({ head: '', efficiency: '0.8', maxKw: '', designFlow: '' })

  // Isi ulang form saat stasiun berganti atau data stasiun selesai dimuat.
  useEffect(() => {
    if (!station) return
    setDraft({
      head: station.power_head_m == null ? '' : String(station.power_head_m),
      efficiency: String(station.power_efficiency ?? 0.8),
      maxKw: station.power_max_kw == null ? '' : String(station.power_max_kw),
      designFlow: station.power_design_flow_m3s == null ? '' : String(station.power_design_flow_m3s),
    })
  }, [station])

  const head = parse(draft.head)
  const efficiency = parse(draft.efficiency)
  const maxKw = parse(draft.maxKw)
  const designFlow = parse(draft.designFlow)

  const error =
    head != null && (Number.isNaN(head) || head <= 0 || head > 1000) ? 'Tinggi jatuh harus lebih dari 0 dan paling besar 1000 m.'
    : efficiency == null || Number.isNaN(efficiency) || efficiency <= 0 || efficiency > 1 ? 'Efisiensi diisi antara 0 dan 1, misalnya 0,8.'
    : maxKw != null && (Number.isNaN(maxKw) || maxKw <= 0) ? 'Kapasitas maksimal harus lebih dari 0 kW, atau kosongkan.'
    : designFlow != null && (Number.isNaN(designFlow) || designFlow <= 0) ? 'Debit desain harus lebih dari 0 m³/s, atau kosongkan.'
    : null

  // Pratinjau: debit 1 m³/s sampai titik kapasitas penuh (minimal 6 baris).
  const preview = useMemo(() => {
    if (error || head == null || efficiency == null) return []
    const perFlow = 9.81 * head * efficiency
    const fullFlow = Math.min(maxKw != null ? maxKw / perFlow : 8, designFlow ?? Number.POSITIVE_INFINITY)
    const last = Math.min(Math.max(6, Math.ceil(fullFlow) + 1), 20)
    return Array.from({ length: last }, (_, i) => {
      const flow = i + 1
      const kw = estimate(flow, head, efficiency, maxKw, designFlow)
      const capped = (maxKw != null && kw >= maxKw) || (designFlow != null && flow > designFlow)
      return { flow, kw, capped }
    })
  }, [error, head, efficiency, maxKw, designFlow])

  async function save() {
    if (!station || error || efficiency == null) return
    setSaving(true)
    const { error: saveError } = await supabase.from('stations').update({
      power_head_m: head,
      power_efficiency: efficiency,
      power_max_kw: maxKw,
      power_design_flow_m3s: designFlow,
    }).eq('id', station.id)
    setSaving(false)
    if (saveError) { toast.error(`Gagal menyimpan: ${saveError.message}`); return }
    toast.success(head == null ? `Estimasi daya ${station.name} dinonaktifkan` : `Parameter estimasi daya ${station.name} disimpan`)
    void queryClient.invalidateQueries({ queryKey: ['stations', 'accessible'] })
  }

  const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement>) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))

  return (
    <div className="space-y-4">
      <Section title={`Parameter ${station?.name ?? 'stasiun'}`}>
        <p className="text-xs leading-5 text-text-secondary">
          Selama energy meter belum terpasang, daya dihitung dari debit radar:
          <span className="font-mono text-text-primary"> 9,81 × debit × tinggi jatuh × efisiensi</span>, dibatasi kapasitas maksimal.
          Dashboard memakai daya terukur dari energy meter bila tersedia. Perubahan berlaku untuk data berikutnya; data lama tidak dihitung ulang.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tinggi jatuh efektif (m) — kosong = estimasi nonaktif">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.head} onChange={set('head')} disabled={!canEdit} placeholder="mis. 4,7" />
          </Field>
          <Field label="Efisiensi turbin × generator (0–1)">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.efficiency} onChange={set('efficiency')} disabled={!canEdit} placeholder="0,8" />
          </Field>
          <Field label="Kapasitas maksimal (kW) — opsional">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.maxKw} onChange={set('maxKw')} disabled={!canEdit} placeholder="mis. 320" />
          </Field>
          <Field label="Debit desain turbin (m³/s) — opsional">
            <input className="scada-input w-full text-sm" inputMode="decimal" value={draft.designFlow} onChange={set('designFlow')} disabled={!canEdit} placeholder="kosong = seluruh debit dihitung" />
          </Field>
        </div>
        {error && <p role="alert" className="text-xs text-accent-red">{error}</p>}
        {canEdit
          ? <SaveBtn saving={saving} onClick={() => void save()} />
          : <p className="text-xs text-text-secondary">Hanya admin yang dapat mengubah parameter ini.</p>}
      </Section>

      <Section title="Pratinjau debit → daya">
        {preview.length === 0 ? (
          <p className="text-xs text-text-secondary">Isi tinggi jatuh dan efisiensi untuk melihat pratinjau.</p>
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
                    <td className="py-1.5 pr-4 tabular-nums font-semibold text-text-primary">{format(row.kw)}</td>
                    <td className="py-1.5 text-text-secondary">{row.capped ? 'dibatasi kapasitas/debit desain' : ''}</td>
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
