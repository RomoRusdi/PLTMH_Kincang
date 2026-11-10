import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Station } from './supabase'

// ============================================================================
// Stasiun aktif di dashboard. Setiap lokasi pemasangan radar adalah satu
// stasiun; daftar yang muncul sudah dibatasi RLS sesuai station_access user.
// ============================================================================

const STORAGE_KEY = 'dht-station'
const DEFAULT_STATION_ID = import.meta.env.VITE_STATION_ID as string | undefined

interface StationContextValue {
  stations: Station[]
  stationId: string
  station: Station | null
  setStationId: (id: string) => void
  isLoading: boolean
}

const StationContext = createContext<StationContextValue | undefined>(undefined)

function savedStationId(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

export function StationProvider({ children }: { children: ReactNode }) {
  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['stations', 'accessible'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stations').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Station[]
    },
    staleTime: 60_000,
  })
  const [selected, setSelected] = useState<string | null>(() => savedStationId() ?? DEFAULT_STATION_ID ?? null)

  // Pilihan tersimpan bisa tidak lagi valid (stasiun dihapus atau akses dicabut):
  // jatuh ke stasiun default, lalu stasiun pertama yang boleh diakses.
  const stationId = useMemo(() => {
    if (stations.some((s) => s.id === selected)) return selected as string
    if (stations.some((s) => s.id === DEFAULT_STATION_ID)) return DEFAULT_STATION_ID as string
    return stations[0]?.id ?? selected ?? DEFAULT_STATION_ID ?? ''
  }, [stations, selected])

  useEffect(() => {
    if (!stationId) return
    try { localStorage.setItem(STORAGE_KEY, stationId) } catch { /* pilihan tetap berlaku di sesi ini */ }
  }, [stationId])

  const value = useMemo<StationContextValue>(() => ({
    stations,
    stationId,
    station: stations.find((s) => s.id === stationId) ?? null,
    setStationId: setSelected,
    isLoading,
  }), [stations, stationId, isLoading])

  return <StationContext.Provider value={value}>{children}</StationContext.Provider>
}

export function useStation(): StationContextValue {
  const ctx = useContext(StationContext)
  if (!ctx) throw new Error('useStation harus dipanggil di dalam <StationProvider>')
  return ctx
}

/** Seperti useStation, tetapi aman dipanggil di luar StationProvider. */
export function useOptionalStation(): StationContextValue | undefined {
  return useContext(StationContext)
}

/** Id stasiun yang sedang dipilih di dashboard. */
export function useStationId(): string {
  return useStation().stationId
}
