import { useEffect, useMemo, useState } from 'react'
import { Copy, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useStation } from '@/lib/station'
import { useAuth } from '@/lib/auth'

// Nilai null berarti batas tidak dipakai. Jangan diganti 0: trigger alarm
// membandingkan nilai <= alarm_low, sehingga 0 memicu alarm palsu untuk tag
// yang wajar bernilai 0 (arah aliran, status kipas).
interface ThRow {
  tag_id: string
  name: string
  unit: string
  hh: number | null
  hi: number | null
  lo: number | null
  ll: number | null
}
type Field = 'hh' | 'hi' | 'lo' | 'll'

const FIELD_LABELS: Record<Field, string> = { hh: 'High-High', hi: 'High', lo: 'Low', ll: 'Low-Low' }
const FIELD_COLORS: Record<Field, string> = {
  hh: 'text-accent-red', hi: 'text-accent-yellow', lo: 'text-accent-blue', ll: 'text-accent-purple',
}

export function ThresholdsTab() {
  const [rows, setRows]       = useState<ThRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)
  const [search, setSearch]   = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const { stationId, station, stations } = useStation()

  useEffect(() => {
    if (!stationId) return
    setLoading(true)
    void supabase.from('tags')
      .select('tag_id,name,unit,alarm_high_high,alarm_high,alarm_low,alarm_low_low')
      .eq('station_id', stationId)
      .order('tag_id')
      .then(({ data, error }) => {
        setLoading(false)
        if (error) { toast.error(`Gagal memuat threshold: ${error.message}`); return }
        setRows((data ?? []).map((r) => ({
          tag_id: r.tag_id, name: r.name, unit: r.unit ?? '',
          hh: r.alarm_high_high, hi: r.alarm_high, lo: r.alarm_low, ll: r.alarm_low_low,
        })))
      })
  }, [stationId, reloadKey])

  function update(tag_id: string, f: Field, val: string) {
    const next = val.trim() === '' ? null : Number(val)
    setRows((prev) => prev.map((r) => r.tag_id === tag_id ? { ...r, [f]: next } : r))
  }

  const visibleRows = useMemo(() => rows.filter((row) => `${row.name} ${row.tag_id}`.toLowerCase().includes(search.trim().toLowerCase())), [rows, search])

  async function save(row: ThRow) {
    const limits = [row.ll, row.lo, row.hi, row.hh]
    if (limits.some((v) => v != null && !Number.isFinite(v))) {
      toast.error(`Threshold ${row.name} harus berupa angka`); return
    }
    const ordered = limits.filter((v): v is number => v != null)
    if (ordered.some((v, i, all) => i > 0 && v <= all[i - 1]!)) {
      toast.error(`Urutan threshold ${row.name} harus Low-Low < Low < High < High-High`); return
    }
    setSaving(row.tag_id)
    const { error } = await supabase.from('tags').update({
      alarm_high_high: row.hh, alarm_high: row.hi,
      alarm_low: row.lo, alarm_low_low: row.ll,
    }).eq('tag_id', row.tag_id).eq('station_id', stationId)
    setSaving(null)
    if (error) { toast.error(`Gagal menyimpan threshold: ${error.message}`); return }
    toast.success(`Threshold ${row.name} disimpan`)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Atur batas alarm High-High, High, Low, Low-Low untuk setiap tag di stasiun{' '}
        <span className="font-semibold text-text-primary">{station?.name ?? 'terpilih'}</span>. Setiap stasiun punya threshold sendiri.
        Kosongkan kolom bila batas tersebut tidak dipakai.
      </p>
      <label className="relative block max-w-md"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau tag…" className="scada-input pl-9" /></label>
      {loading && <p className="rounded-card border border-border bg-surface p-4 text-xs text-text-secondary">Memuat threshold…</p>}
      {!loading && rows.length === 0 && (
        <CopyConfigPanel
          targetId={stationId}
          sources={stations.filter((s) => s.id !== stationId)}
          onCopied={() => setReloadKey((key) => key + 1)}
        />
      )}
      {rows.length > 0 && visibleRows.length === 0 && <p className="rounded-card border border-border bg-surface p-4 text-xs text-text-secondary">Tag tidak ditemukan.</p>}
      {visibleRows.map((row) => (
        <div key={row.tag_id} className="bg-surface border border-border rounded-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">{row.name}</p>
              <p className="text-[10px] text-text-secondary font-mono">{row.tag_id} · {row.unit}</p>
            </div>
            <button
              onClick={() => { void save(row) }}
              disabled={saving === row.tag_id}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent-blue/10 border border-accent-blue/30 text-accent-blue rounded-input hover:bg-accent-blue/20 transition-colors disabled:opacity-50">
              <Save className="w-3 h-3" />
              {saving === row.tag_id ? 'Simpan…' : 'Simpan'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['hh', 'hi', 'lo', 'll'] as Field[]).map((f) => (
              <div key={f}>
                <label className={cn('text-[10px] font-medium mb-1 block', FIELD_COLORS[f])}>
                  {FIELD_LABELS[f]}
                </label>
                <input
                  type="number" step="any" value={row[f] ?? ''} placeholder="Tidak dipakai"
                  onChange={(e) => update(row.tag_id, f, e.target.value)}
                  aria-label={`${FIELD_LABELS[f]} ${row.name}`}
                  className="scada-input text-sm w-full" />
                <span className="text-[10px] text-text-secondary">{row.unit}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Stasiun baru belum punya tag; salin perangkat dan tag (beserta threshold) dari stasiun lain. */
function CopyConfigPanel({ targetId, sources, onCopied }: { targetId: string; sources: { id: string; name: string }[]; onCopied: () => void }) {
  const { hasRole } = useAuth()
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [copying, setCopying] = useState(false)

  async function copy() {
    if (!sourceId) return
    setCopying(true)
    const { data, error } = await supabase.rpc('copy_station_config', { p_from: sourceId, p_to: targetId })
    setCopying(false)
    if (error) { toast.error(`Gagal menyalin konfigurasi: ${error.message}`); return }
    toast.success(`${data?.tags ?? 0} tag dan ${data?.devices ?? 0} perangkat disalin`)
    onCopied()
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4 text-xs text-text-secondary">
      <p className="font-medium text-text-primary">Belum ada tag pada stasiun ini.</p>
      <p className="mt-1">Stasiun baru perlu daftar perangkat dan tag sebelum gateway-nya dapat mengirim data.</p>
      {hasRole('admin') && sources.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Salin dari stasiun" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="scada-input w-auto text-xs">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" onClick={() => { void copy() }} disabled={copying || !sourceId} className="scada-button-secondary disabled:opacity-50">
            <Copy className="h-3 w-3" /> {copying ? 'Menyalin…' : 'Salin konfigurasi'}
          </button>
        </div>
      )}
    </div>
  )
}
