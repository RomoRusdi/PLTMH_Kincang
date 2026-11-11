import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  supabase,
  type CalibrationParams,
  type CalibrationReferenceRow,
  type CalibrationReferenceInput,
  type StationCalibration,
} from './supabase'

// ============================================================================
// Kalibrasi radar di sistem. Rumus di sini HARUS sama dengan
// apply_station_calibration di database/02-multistasiun-kalibrasi.sql agar pratinjau wizard
// sama dengan nilai yang nanti tersimpan saat data masuk.
// ============================================================================

export * from './calibrationMath'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export function useCalibrations(stationId: string) {
  return useQuery({
    queryKey: ['calibrations', stationId],
    queryFn: async (): Promise<StationCalibration[]> => {
      const { data, error } = await supabase
        .from('station_calibrations')
        .select('*')
        .eq('station_id', stationId)
        .order('version', { ascending: false })
      if (error) throw error
      return (data ?? []) as StationCalibration[]
    },
    enabled: !!stationId,
  })
}

export function useCalibrationReferenceCounts(stationId: string) {
  return useQuery({
    queryKey: ['calibration-references', stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calibration_references')
        .select('calibration_id')
        .eq('station_id', stationId)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data ?? []) counts[row.calibration_id] = (counts[row.calibration_id] ?? 0) + 1
      return counts
    },
    enabled: !!stationId,
  })
}

/** Titik acuan lapangan milik satu versi kalibrasi, urut waktu pengukuran. */
export function useCalibrationReferences(calibrationId: string | null) {
  return useQuery({
    queryKey: ['calibration-references', 'by-calibration', calibrationId],
    queryFn: async (): Promise<CalibrationReferenceRow[]> => {
      const { data, error } = await supabase
        .from('calibration_references')
        .select('*')
        .eq('calibration_id', calibrationId as string)
        .order('measured_at')
      if (error) throw error
      return (data ?? []) as CalibrationReferenceRow[]
    },
    enabled: !!calibrationId,
  })
}

/**
 * Pembacaan radar mentah (jarak ke air, kecepatan permukaan) yang paling dekat
 * dengan waktu pengukuran manual, dalam rentang ±5 menit. Kedua tag ini tidak
 * diubah oleh kalibrasi, sehingga aman dipakai sebagai acuan.
 */
export async function fetchRadarReading(stationId: string, at: Date): Promise<{ airGap: number | null; velocity: number | null; at: string | null }> {
  const from = new Date(at.getTime() - 5 * 60_000).toISOString()
  const to = new Date(at.getTime() + 5 * 60_000).toISOString()
  const { data, error } = await supabase
    .from('measurements')
    .select('tag_id,value,source_timestamp')
    .eq('station_id', stationId)
    .eq('quality', 'good')
    .in('tag_id', ['HYDRO.AIR_GAP', 'HYDRO.VELOCITY'])
    .gte('source_timestamp', from)
    .lte('source_timestamp', to)
  if (error) throw error

  const nearest = (tag: string) => {
    let best: { value: number | null; source_timestamp: string } | null = null
    for (const row of data ?? []) {
      if (row.tag_id !== tag) continue
      if (!best || Math.abs(new Date(row.source_timestamp).getTime() - at.getTime()) < Math.abs(new Date(best.source_timestamp).getTime() - at.getTime())) {
        best = row
      }
    }
    return best
  }
  const gap = nearest('HYDRO.AIR_GAP')
  const vel = nearest('HYDRO.VELOCITY')
  return { airGap: gap?.value ?? null, velocity: vel?.value ?? null, at: gap?.source_timestamp ?? vel?.source_timestamp ?? null }
}

export function useApplyCalibration(stationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ params, references, notes }: { params: CalibrationParams; references: CalibrationReferenceInput[]; notes: string }) => {
      const { data, error } = await supabase.rpc('apply_calibration', {
        p_station_id: stationId,
        p_params: params,
        p_references: references,
        p_notes: notes || null,
      })
      if (error) throw error
      return data as StationCalibration
    },
    onSuccess: (cal) => {
      toast.success(`Kalibrasi versi ${cal.version} disimpan dan berlaku untuk data berikutnya`)
      void queryClient.invalidateQueries({ queryKey: ['calibrations', stationId] })
      void queryClient.invalidateQueries({ queryKey: ['calibration-references', stationId] })
    },
    onError: (error: Error) => toast.error(`Gagal menyimpan kalibrasi: ${error.message}`),
  })
}
