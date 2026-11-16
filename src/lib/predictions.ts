import { useQuery } from '@tanstack/react-query'
import { supabase, type Prediction, type PredictionAccuracy } from './supabase'

// ============================================================================
// Prediksi modul AI (tabel predictions, 11-prediksi-ai.sql). Ditulis worker
// prediksi di komputer PLTMH; web hanya membaca.
// ============================================================================

export const PREDICTION_TAG = 'HYDRO.POWER_EST'
/** Worker berjalan tiap 5 menit; lebih dari 15 menit tanpa prediksi baru = layanan AI tidak aktif. */
export const PREDICTION_STALE_MS = 15 * 60_000

export interface PredictionBatch {
  model: string
  modelVersion: string
  baseTimestamp: string
  createdAt: string
  outOfRange: boolean
  steps: Prediction[]
}

/** Kelompokkan baris menjadi satu batch terbaru (base_timestamp terbesar). */
export function latestBatch(rows: Prediction[]): PredictionBatch | null {
  if (rows.length === 0) return null
  const newest = rows.reduce((a, b) => (b.base_timestamp > a.base_timestamp ? b : a))
  const steps = rows
    .filter((row) => row.base_timestamp === newest.base_timestamp && row.model === newest.model && row.model_version === newest.model_version)
    .sort((a, b) => a.horizon_step - b.horizon_step)
  return {
    model: newest.model,
    modelVersion: newest.model_version,
    baseTimestamp: newest.base_timestamp,
    createdAt: steps.reduce((max, row) => (row.created_at > max ? row.created_at : max), newest.created_at),
    outOfRange: steps.some((row) => row.out_of_range),
    steps,
  }
}

export function useLatestPrediction(stationId: string) {
  return useQuery({
    queryKey: ['predictions-latest', stationId],
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString()
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('station_id', stationId)
        .eq('tag_id', PREDICTION_TAG)
        .gte('base_timestamp', since)
        .order('base_timestamp', { ascending: false })
        .order('horizon_step', { ascending: true })
        .limit(60)
      if (error) throw error
      return latestBatch((data ?? []) as Prediction[])
    },
    enabled: !!stationId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

export function usePredictionAccuracy(stationId: string, hours = 24) {
  return useQuery({
    queryKey: ['predictions-accuracy', stationId, hours],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_prediction_accuracy', { p_station_id: stationId, p_hours: hours })
      if (error) throw error
      return (data ?? []) as PredictionAccuracy[]
    },
    enabled: !!stationId,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  })
}
