import type { DeviceHealthView } from './supabase'

// ============================================================================
// Status tampilan perangkat. Satu aturan untuk kartu, ringkasan, dan filter,
// agar label kartu tidak bertentangan dengan angka ringkasan.
//
// Kolom devices.status hanya menyimpan status terakhir yang pernah dicatat
// (mis. "online" dua hari lalu) dan tidak turun sendiri saat perangkat diam.
// Yang menentukan online adalah is_online dari device_health_view: perangkat
// aktif, berstatus online, dan terlihat dalam 3 interval scan terakhir.
// ============================================================================

export type DeviceState = 'online' | 'offline' | 'error' | 'maintenance' | 'disabled'

export function deviceState(device: Pick<DeviceHealthView, 'enabled' | 'status' | 'is_online'>): DeviceState {
  if (!device.enabled) return 'disabled'
  if (device.status === 'maintenance') return 'maintenance'
  if (device.status === 'error') return 'error'
  return device.is_online ? 'online' : 'offline'
}

export const DEVICE_STATE_LABEL: Record<DeviceState, string> = {
  online: 'Online',
  offline: 'Offline',
  error: 'Error',
  maintenance: 'Maintenance',
  disabled: 'Nonaktif',
}

/** Offline = seharusnya mengirim tetapi tidak terlihat (nonaktif tidak dihitung). */
export const isOfflineState = (state: DeviceState) => state === 'offline' || state === 'error'

/** Perlu perhatian = bermasalah, sedang dirawat, atau monitoring dimatikan. */
export const isAttentionState = (state: DeviceState) => state === 'error' || state === 'maintenance' || state === 'disabled'
