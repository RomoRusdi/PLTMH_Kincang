import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type StationOverview } from './supabase'

// ============================================================================
// Aturan status stasiun yang dipakai bersama oleh Ringkasan Stasiun, Peta,
// dan Kalibrasi, agar label "live" atau "perlu kalibrasi" selalu konsisten.
// ============================================================================

/** Gateway mengirim tiap 60 detik; lebih dari 3 interval (3 menit) tanpa data = terhenti. */
export const LIVE_THRESHOLD_MS = 180_000

/** Peringatan "segera kalibrasi" mulai dari 80% interval. */
export const CALIBRATION_WARNING_RATIO = 0.8

export type ConnectionState = 'live' | 'stale' | 'nodata'

/** Waktu sekarang yang diperbarui berkala agar label "live/terhenti" ikut berubah. */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Tandai nilai "good" yang sudah lebih lama dari LIVE_THRESHOLD_MS sebagai
 * "stale". Nilai terakhir sebuah tag tetap tampil walau perangkatnya sudah
 * lama berhenti mengirim (mis. energy meter mati), jadi tanpa ini kartu
 * akan terus berlabel "Good" dengan angka lama.
 */
export function markOldMeasurements<T extends { quality: string; timestamp: string }>(
  measurements: Record<string, T>,
  now: number,
): Record<string, T> {
  let changed = false
  const result: Record<string, T> = {}
  for (const [tag, measurement] of Object.entries(measurements)) {
    const old = measurement.quality === 'good' && now - new Date(measurement.timestamp).getTime() > LIVE_THRESHOLD_MS
    result[tag] = old ? { ...measurement, quality: 'stale' } : measurement
    changed ||= old
  }
  return changed ? result : measurements
}

/**
 * Status telemetry stasiun dalam tiga tingkat:
 * - disconnected (Terputus): tidak ada kiriman dari stasiun selama 3 menit
 *   (komputer PLTMH mati, internet putus, gateway/ingest berhenti), atau web
 *   sendiri kehilangan koneksi realtime ke server.
 * - ready: gateway masih mengirim, tetapi tidak ada nilai sensor yang valid
 *   (port dipakai RadarWave, kabel radar lepas, radar tidak menjawab).
 * - connected (Terhubung): gateway mengirim dan nilai sensor terbaca normal.
 */
export type TelemetryState = 'disconnected' | 'ready' | 'connected'

export const TELEMETRY_LABEL: Record<TelemetryState, string> = {
  disconnected: 'Terputus',
  ready: 'Ready',
  connected: 'Terhubung',
}

/** Warna per status: merah, kuning, hijau. */
export const TELEMETRY_TONE: Record<TelemetryState, { text: string; dot: string }> = {
  disconnected: { text: 'text-status-bad', dot: 'bg-status-bad' },
  ready: { text: 'text-status-warning', dot: 'bg-status-warning' },
  connected: { text: 'text-status-good', dot: 'bg-status-good' },
}

export interface TelemetryStatus {
  state: TelemetryState
  label: string
  /** Penjelasan singkat penyebab status. */
  detail: string
}

export function telemetryStatus(
  realtimeConnected: boolean,
  measurements: Record<string, { quality: string; timestamp: string }>,
  now = Date.now(),
): TelemetryStatus {
  const status = (state: TelemetryState, detail: string) => ({ state, label: TELEMETRY_LABEL[state], detail })
  if (!realtimeConnected) return status('disconnected', 'Koneksi web ke server terputus')
  const fresh = Object.values(measurements).filter((m) => now - new Date(m.timestamp).getTime() <= LIVE_THRESHOLD_MS)
  if (fresh.length === 0) {
    const hasData = Object.values(measurements).some((m) => m.timestamp)
    return status('disconnected', hasData ? 'Stasiun tidak mengirim data' : 'Belum ada data dari stasiun')
  }
  if (!fresh.some((m) => m.quality === 'good')) return status('ready', 'Gateway aktif, sensor tak terbaca')
  return status('connected', 'Data sensor masuk normal')
}

export function connectionState(lastDataAt: string | null, now = Date.now()): ConnectionState {
  if (!lastDataAt) return 'nodata'
  return now - new Date(lastDataAt).getTime() <= LIVE_THRESHOLD_MS ? 'live' : 'stale'
}

export type CalibrationState = 'none' | 'ok' | 'due_soon' | 'overdue'

export interface CalibrationStatus {
  state: CalibrationState
  /** Umur kalibrasi aktif dalam hari (null bila belum pernah). */
  ageDays: number | null
  /** Sisa hari sebelum melewati interval; negatif bila sudah lewat. */
  dueInDays: number | null
}

export function calibrationStatus(calibratedAt: string | null, intervalDays: number, now = Date.now()): CalibrationStatus {
  if (!calibratedAt) return { state: 'none', ageDays: null, dueInDays: null }
  const ageDays = Math.floor((now - new Date(calibratedAt).getTime()) / 86_400_000)
  const dueInDays = intervalDays - ageDays
  const state: CalibrationState = ageDays > intervalDays
    ? 'overdue'
    : ageDays >= intervalDays * CALIBRATION_WARNING_RATIO ? 'due_soon' : 'ok'
  return { state, ageDays, dueInDays }
}

export const CALIBRATION_LABEL: Record<CalibrationState, string> = {
  none: 'Belum dikalibrasi',
  ok: 'Terkalibrasi',
  due_soon: 'Segera kalibrasi',
  overdue: 'Perlu kalibrasi ulang',
}

/** Stasiun dianggap bermasalah bila data terhenti, ada alarm, atau kalibrasi tidak valid. */
export function needsAttention(row: StationOverview, now = Date.now()) {
  const calibration = calibrationStatus(row.calibration_at, row.calibration_interval_days, now).state
  return connectionState(row.last_data_at, now) !== 'live'
    || row.active_alarms > 0
    || calibration === 'none'
    || calibration === 'overdue'
}

/** Kondisi terkini semua stasiun yang boleh diakses user (satu query, polling). */
export function useStationOverview() {
  return useQuery({
    queryKey: ['station-overview'],
    queryFn: async (): Promise<StationOverview[]> => {
      const { data, error } = await supabase.from('station_overview').select('*').order('name')
      if (error) throw error
      return (data ?? []) as StationOverview[]
    },
    refetchInterval: 15_000,
    staleTime: 5_000,
  })
}
