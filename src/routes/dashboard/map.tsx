import { createFileRoute } from '@tanstack/react-router'
import { CALIBRATION_LABEL, calibrationStatus, connectionState } from '@/lib/stationStatus'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type StationStatus } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { Activity, Check, MapPinned, Navigation, Pencil, Plus, Search, SlidersHorizontal, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { EmptyState, LoadingState } from '@/components/UiState'

export const Route = createFileRoute('/dashboard/map')({ component: MapPage })

type MapStation = {
  id: string
  name: string
  location: string
  river_name: string | null
  description: string | null
  elevation_m: number | null
  latitude: number | null
  longitude: number | null
  status: StationStatus
  is_online: boolean
  water_level: number | null
  flow_rate: number | null
  velocity: number | null
  latest_at: string | null
  alarm_count: number
  calibration_label: string
}
type StationDraft = Pick<MapStation, 'name' | 'location' | 'river_name' | 'description' | 'elevation_m' | 'latitude' | 'longitude' | 'status'>

function MapPage() {
  const { canAccess } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<MapStation | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'alarm'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: stations = [], isLoading, isError, error } = useQuery({
    queryKey: ['map-stations'],
    queryFn: async (): Promise<MapStation[]> => {
      const { data: stationRows, error: stationError } = await supabase.from('stations').select('*').order('name')
      if (stationError) throw stationError
      // Status dihitung dengan aturan yang sama seperti halaman Ringkasan Stasiun.
      const { data: overviewRows, error: overviewError } = await supabase.from('station_overview').select('*')
      if (overviewError) throw overviewError
      const now = Date.now()
      return (stationRows ?? []).flatMap((station) => {
        const overview = (overviewRows ?? []).find((row) => row.id === station.id)
        const calibration = calibrationStatus(overview?.calibration_at ?? null, overview?.calibration_interval_days ?? 90, now)
        return [{
          id: station.id,
          name: station.name,
          location: station.location,
          river_name: station.river_name,
          description: station.description,
          elevation_m: station.elevation_m,
          latitude: station.latitude,
          longitude: station.longitude,
          status: station.status,
          is_online: connectionState(overview?.last_data_at ?? null, now) === 'live',
          water_level: overview?.level_m ?? null,
          flow_rate: overview?.flow_m3s ?? null,
          velocity: overview?.velocity_ms ?? null,
          latest_at: overview?.last_data_at ?? null,
          alarm_count: overview?.active_alarms ?? 0,
          calibration_label: calibration.state === 'none' || overview?.calibration_version == null
            ? CALIBRATION_LABEL.none
            : `${CALIBRATION_LABEL[calibration.state]} (v${overview.calibration_version}, ${calibration.ageDays} hari)`,
        }]
      })
    },
    staleTime: 3000,
    refetchInterval: 5000,
  })
  const saveStation = useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: StationDraft }) => {
      const payload = { ...draft, river_name: draft.river_name || null, description: draft.description || null, elevation_m: draft.elevation_m ?? null }
      const result = id
        ? await supabase.from('stations').update(payload).eq('id', id)
        : await supabase.from('stations').insert(payload)
      if (result.error) throw result.error
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['map-stations'] }); setEditing(null); setCreating(false) },
  })
  const deleteStation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['map-stations'] }); setEditing(null) },
  })
  const mapStations = stations as MapStation[]
  const visibleStations = mapStations.filter((s) => {
    const needle = search.trim().toLowerCase()
    if (needle && !`${s.name} ${s.location} ${s.river_name ?? ''}`.toLowerCase().includes(needle)) return false
    if (filter === 'online' && !s.is_online) return false
    if (filter === 'offline' && s.is_online) return false
    if (filter === 'alarm' && s.alarm_count === 0) return false
    return true
  })
  const locatedCount = mapStations.filter((s) => s.latitude != null && s.longitude != null).length
  const onlineCount = mapStations.filter((s) => s.is_online).length
  const alarmStationCount = mapStations.filter((s) => s.alarm_count > 0).length
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Peta Stasiun" eyebrow="Semua stasiun" subtitle="Lokasi dan status seluruh stasiun pengukuran"
        actions={canAccess('systemSettings') && <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-accent-blue text-white rounded-input"><Plus className="w-3.5 h-3.5" />Tambah stasiun</button>} />
      <div className="dashboard-shell min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MapStat icon={<MapPinned className="h-4 w-4" />} label="Total stasiun" value={mapStations.length} detail={`${locatedCount} punya koordinat`} />
          <MapStat icon={<Wifi className="h-4 w-4" />} label="Online" value={onlineCount} tone="good" detail={`${mapStations.length - onlineCount} offline`} />
          <MapStat icon={<Activity className="h-4 w-4" />} label="Data terbaru" value={mapStations.filter((s) => s.latest_at).length} detail="dari telemetry" />
          <MapStat icon={<SlidersHorizontal className="h-4 w-4" />} label="Perlu perhatian" value={alarmStationCount} tone={alarmStationCount ? 'bad' : 'good'} detail="stasiun beralarm" />
        </div>
        <div className="flex min-h-0 flex-col gap-3 md:flex-row md:overflow-hidden md:h-[calc(100%-76px)]">
        <div className="relative h-[clamp(360px,55vh,520px)] min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-surface-2 shadow-sm md:h-auto">
          {isLoading ? <LoadingState label="Memuat stasiun…" /> : isError ? <MapLoadError message={error instanceof Error ? error.message : 'Gagal memuat data stasiun'} /> : mapStations.length === 0 ? <EmptyState title="Belum ada stasiun" description="Tambahkan stasiun dengan koordinat untuk menampilkannya di peta." /> : <LiveMap stations={visibleStations} selectedStationId={selectedId} />}
        </div>
        <aside className="max-h-[38vh] w-full flex-shrink-0 overflow-y-auto rounded-card border border-border bg-surface shadow-sm md:max-h-none md:w-72">
          <div className="p-4 border-b border-border">
            <p className="text-xs font-semibold text-text-primary">{visibleStations.length} dari {mapStations.length} Stasiun</p>
            <p className="text-[10px] text-text-secondary mt-0.5">
              {mapStations.filter((s) => s.is_online).length} online ·{' '}
              {mapStations.filter((s) => !s.is_online).length} offline
            </p>
          </div>
          <div className="divide-y divide-border">
            <div className="space-y-2 p-3 border-b border-border">
              <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari stasiun…" aria-label="Cari stasiun" className="scada-input pl-9" /></label>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter stasiun" className="scada-input"><option value="all">Semua status</option><option value="online">Online</option><option value="offline">Offline</option><option value="alarm">Ada alarm</option></select>
            </div>
            {visibleStations.map((s) => <StationItem key={s.id} s={s} selected={selectedId === s.id} canEdit={canAccess('systemSettings')} onSelect={setSelectedId} onEdit={setEditing} />)}
            {visibleStations.length === 0 && <p className="p-4 text-xs text-text-secondary">Stasiun tidak ditemukan.</p>}
          </div>
        </aside>
      </div>
      </div>
      {(creating || editing) && <StationEditor station={editing} saving={saveStation.isPending} error={saveStation.error?.message ?? null}
        onClose={() => { setCreating(false); setEditing(null) }}
        onDelete={editing && canAccess('deleteData') ? () => { if (window.confirm(`Hapus stasiun ${editing.name}?`)) deleteStation.mutate(editing.id) } : undefined}
        onSave={(draft) => saveStation.mutate({ id: editing?.id, draft })} />}
    </div>
  )
}

function MapLoadError({ message }: { message: string }) {
  return <div className="h-full min-h-[420px] flex items-center justify-center p-6"><div className="max-w-md rounded-card border border-accent-red/40 bg-surface p-5 text-center"><p className="text-sm font-semibold text-accent-red">Peta stasiun tidak dapat dimuat</p><p className="mt-2 text-xs text-text-secondary">Periksa koneksi Supabase dan kolom latitude/longitude pada tabel stations.</p><p className="mt-3 break-words font-mono text-[10px] text-text-secondary">{message}</p></div></div>
}

function MapStat({ icon, label, value, detail, tone = 'default' }: { icon: ReactNode; label: string; value: number; detail: string; tone?: 'default' | 'good' | 'bad' }) {
  return <div className="rounded-card border border-border bg-surface p-3 shadow-sm">
    <div className="flex items-center justify-between text-text-secondary"><span className="text-[10px]">{label}</span><span className={cn(tone === 'good' ? 'text-status-good' : tone === 'bad' ? 'text-status-bad' : 'text-accent-blue')}>{icon}</span></div>
    <p className={cn('mt-1 text-xl font-bold tabular-nums', tone === 'good' ? 'text-status-good' : tone === 'bad' ? 'text-status-bad' : 'text-text-primary')}>{value}</p>
    <p className="text-[10px] text-text-secondary">{detail}</p>
  </div>
}

function StationItem({ s, selected, canEdit, onSelect, onEdit }: { s: MapStation; selected: boolean; canEdit: boolean; onSelect: (id: string) => void; onEdit: (station: MapStation) => void }) {
  const OnOff = s.is_online ? Wifi : WifiOff
  return (
    <div className={cn('p-4 transition-colors', selected ? 'bg-accent-blue/10' : 'hover:bg-surface-2')}>
      <div className="flex items-start gap-3">
        <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
          s.is_online ? 'bg-status-good' : 'bg-status-bad')} />
        <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onSelect(s.id)} aria-pressed={selected}>
          <p className="text-xs font-semibold text-text-primary leading-tight">{s.name}</p>
          <p className="text-[10px] text-text-secondary">{s.river_name}</p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px]">
            <span className={cn('flex items-center gap-1', s.is_online ? 'text-status-good' : 'text-status-bad')}>
              <OnOff className="w-3 h-3" />
              {s.is_online ? 'Online' : 'Offline'}
            </span>
            {s.water_level != null && (
              <span className="text-text-secondary">
                Muka air: <span className="text-text-primary">{s.water_level} m</span>
              </span>
            )}
            {s.flow_rate != null && <span className="text-text-secondary">Debit: <span className="text-text-primary">{s.flow_rate.toFixed(2)} m³/s</span></span>}
            {s.alarm_count > 0 && (
              <span className="text-accent-red font-bold">{s.alarm_count} ⚠</span>
            )}
          </div>
          <p className="text-[9px] text-text-secondary mt-1 font-mono">
            {s.latitude != null && s.longitude != null ? `${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}` : 'Koordinat belum diatur'}
          </p>
          {s.latest_at && <p className="mt-1 text-[9px] text-text-secondary">Telemetry {new Date(s.latest_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>}
        </button>
        {canEdit && <button type="button" onClick={() => onEdit(s)} className="text-text-secondary hover:text-accent-blue" title="Ubah koordinat">
          <Pencil className="w-3.5 h-3.5" />
        </button>}
        {s.latitude != null && s.longitude != null && <a href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
          target="_blank" rel="noreferrer"
          className="text-text-secondary hover:text-accent-blue transition-colors flex-shrink-0"
          title="Google Maps">
          <Navigation className="w-3.5 h-3.5" />
        </a>}
      </div>
    </div>
  )
}

function StationEditor({ station, saving, error, onClose, onDelete, onSave }: {
  station: MapStation | null
  saving: boolean
  error: string | null
  onClose: () => void
  onDelete?: () => void
  onSave: (draft: StationDraft) => void
}) {
  const [name, setName] = useState(station?.name ?? '')
  const [location, setLocation] = useState(station?.location ?? '')
  const [riverName, setRiverName] = useState(station?.river_name ?? '')
  const [description, setDescription] = useState(station?.description ?? '')
  const [status, setStatus] = useState<StationStatus>(station?.status ?? 'active')
  const [latitude, setLatitude] = useState(String(station?.latitude ?? ''))
  const [longitude, setLongitude] = useState(String(station?.longitude ?? ''))
  const [elevation, setElevation] = useState(station?.elevation_m == null ? '' : String(station.elevation_m))
  const lat = Number(latitude), lng = Number(longitude)
  const elevationValue = elevation === '' ? null : Number(elevation)
  const valid = name.trim().length > 0 && location.trim().length > 0 && Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180 && (elevationValue == null || Number.isFinite(elevationValue))
  return <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="coordinate-title">
    <form onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ name: name.trim(), location: location.trim(), river_name: riverName.trim() || null, description: description.trim() || null, status, latitude: lat, longitude: lng, elevation_m: elevationValue }) }} className="w-full max-w-lg bg-surface border border-border rounded-card p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div><h2 id="coordinate-title" className="text-sm font-semibold text-text-primary">{station ? 'Ubah stasiun' : 'Tambah stasiun'}</h2><p className="text-xs text-text-secondary mt-1">Data stasiun dan titik koordinat</p></div>
        <button type="button" aria-label="Tutup" onClick={onClose}><X className="w-4 h-4 text-text-secondary" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-text-secondary col-span-2">Nama stasiun<input required value={name} onChange={(e) => setName(e.target.value)} className="scada-input mt-1 w-full" placeholder="PLTMH Monitoring" /></label>
        <label className="text-xs text-text-secondary">Lokasi<input required value={location} onChange={(e) => setLocation(e.target.value)} className="scada-input mt-1 w-full" placeholder="Kecamatan / desa" /></label>
        <label className="text-xs text-text-secondary">Nama sungai<input value={riverName} onChange={(e) => setRiverName(e.target.value)} className="scada-input mt-1 w-full" placeholder="Nama sungai" /></label>
        <label className="text-xs text-text-secondary">Status<select value={status} onChange={(e) => setStatus(e.target.value as StationStatus)} className="scada-input mt-1 w-full"><option value="active">Aktif</option><option value="inactive">Tidak aktif</option><option value="maintenance">Pemeliharaan</option></select></label>
        <label className="text-xs text-text-secondary">Elevasi (m)<input type="number" step="0.1" value={elevation} onChange={(e) => setElevation(e.target.value)} className="scada-input mt-1 w-full" /></label>
        <label className="text-xs text-text-secondary">Latitude<input required type="number" step="0.000001" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} className="scada-input mt-1 w-full" placeholder="-6.651800" /></label>
        <label className="text-xs text-text-secondary">Longitude<input required type="number" step="0.000001" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} className="scada-input mt-1 w-full" placeholder="106.831900" /></label>
        <label className="text-xs text-text-secondary col-span-2">Deskripsi<textarea value={description} onChange={(e) => setDescription(e.target.value)} className="scada-input mt-1 w-full min-h-16" /></label>
      </div>
      {!valid && (latitude || longitude || name || location) && <p className="text-xs text-status-bad mt-3">Nama/lokasi wajib diisi. Koordinat harus latitude -90..90 dan longitude -180..180.</p>}
      {error && <p className="text-xs text-status-bad mt-3">Gagal menyimpan: {error}</p>}
      <div className="flex justify-end gap-2 mt-5">
        {onDelete && <button type="button" onClick={onDelete} disabled={saving} className="mr-auto flex items-center gap-1.5 px-3 py-2 text-xs text-status-bad"><Trash2 className="w-3.5 h-3.5" />Hapus</button>}
        <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-text-secondary">Batal</button>
        <button type="submit" disabled={!valid || saving} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-accent-blue text-white rounded-input disabled:opacity-50"><Check className="w-3.5 h-3.5" />{saving ? 'Menyimpan…' : 'Simpan stasiun'}</button>
      </div>
    </form>
  </div>
}

function LiveMap({ stations, selectedStationId }: { stations: MapStation[]; selectedStationId: string | null }) {
  const located = stations.filter((station) => station.latitude != null && station.longitude != null)
  const center = useMemo<[number, number]>(() => located.length
    ? [located.reduce((sum, station) => sum + station.latitude!, 0) / located.length, located.reduce((sum, station) => sum + station.longitude!, 0) / located.length]
    : [-6.6, 106.8], [located])
  const points = useMemo(() => located.map((station) => [station.latitude!, station.longitude!] as [number, number]), [located])
  return (
    <MapContainer center={center} zoom={11} zoomControl scrollWheelZoom className="h-full w-full" style={{ minHeight: '420px' }}>
      <MapResizeFix />
      <MapViewport points={points} />
      <SelectedStationViewport station={located.find((station) => station.id === selectedStationId) ?? null} />
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {located.map((station) => <Marker key={station.id} position={[station.latitude!, station.longitude!]} icon={divIcon({ className: '', html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${station.is_online ? '#22c55e' : '#ef4444'};border:3px solid white;box-shadow:0 1px 5px #0008"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] })}>
        <Popup><strong>{station.name}</strong><br />{station.is_online ? 'Online' : 'Offline'}{station.alarm_count > 0 ? ` · ${station.alarm_count} alarm` : ''}<br />{station.location}<br />Level air: {station.water_level == null ? '—' : `${station.water_level.toFixed(3)} m`} · Kecepatan: {station.velocity == null ? '—' : `${station.velocity.toFixed(2)} m/s`}<br />Debit: {station.flow_rate == null ? '—' : `${station.flow_rate.toFixed(3)} m³/s`}<br />Kalibrasi: {station.calibration_label}</Popup>
      </Marker>)}
    </MapContainer>
  )
}

function SelectedStationViewport({ station }: { station: MapStation | null }) {
  const map = useMap()
  useEffect(() => {
    if (station?.latitude != null && station.longitude != null) map.flyTo([station.latitude, station.longitude], Math.max(map.getZoom(), 14), { duration: 0.5 })
  }, [map, station])
  return null
}

function MapResizeFix() {
  const map = useMap()
  useEffect(() => {
    const invalidate = () => map.invalidateSize(false)
    const frame = requestAnimationFrame(invalidate)
    window.addEventListener('resize', invalidate)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate)
    if (observer) observer.observe(map.getContainer())
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', invalidate)
      observer?.disconnect()
    }
  }, [map])
  return null
}

function MapViewport({ points }: { points: [number, number][] }) {
  const map = useMap()
  const signature = points.map((point) => point.join(',')).join('|')
  useEffect(() => {
    if (points.length === 1 && points[0]) map.setView(points[0], Math.max(map.getZoom(), 14))
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 14 })
  // The signature changes only when station coordinates change, not during polling.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature])
  return null
}
