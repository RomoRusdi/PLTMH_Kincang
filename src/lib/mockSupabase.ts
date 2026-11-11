import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase'

type Row = Record<string, unknown>
type Filter = { column: string; operator: 'eq' | 'in'; value: unknown }

const STATION_ID = (import.meta.env.VITE_STATION_ID as string | undefined) ?? 'ce9ceebb-921b-4275-83f1-1679cff06d04'
const MOCK_USER_ID = '00000000-0000-4000-8000-000000000001'
const STORAGE_KEY = 'river-flow-guardian-mock-db-v7'
const now = () => new Date().toISOString()

interface MockStore {
  stations: Row[]
  devices: Row[]
  tags: Row[]
  measurements: Row[]
  alarms: Row[]
  events: Row[]
  profiles: Row[]
  monthly_reports: Row[]
  breakdown_reports: Row[]
  station_calibrations?: Row[]
  calibration_references?: Row[]
}

function station(id: string, name: string, location: string, latitude: number, longitude: number, status: string = 'active'): Row {
  return {
    id, name, location, latitude, longitude, status,
    description: 'Stasiun pemantauan Digihydrotek', river_name: 'Sungai Citarum',
    installation_date: '2024-03-15', elevation_m: 48, created_at: now(), updated_at: now(),
    power_head_m: id === STATION_ID ? 4.7 : null, power_efficiency: 0.8, power_max_kw: id === STATION_ID ? 320 : null, power_design_flow_m3s: null,
  }
}

function createSeed(): MockStore {
  const stationRows = [
    station(STATION_ID, 'Stasiun Citarum 01', 'Bendung Citarum', -6.914744, 107.609810),
    station('ce9ceebb-921b-4275-83f1-1679cff06d05', 'Stasiun Citarum 02', 'Majalaya', -7.050500, 107.756700),
    station('ce9ceebb-921b-4275-83f1-1679cff06d06', 'Stasiun Citarum 03', 'Rancaekek', -6.959700, 107.758400, 'maintenance'),
    station('ce9ceebb-921b-4275-83f1-1679cff06d07', 'Stasiun Citarum 04', 'Bojongsoang', -6.982200, 107.630600),
    station('ce9ceebb-921b-4275-83f1-1679cff06d08', 'Stasiun Citarum 05', 'Dayeuhkolot', -6.987700, 107.623100),
    station('ce9ceebb-921b-4275-83f1-1679cff06d09', 'Stasiun Citarum 06', 'Sapan', -6.991600, 107.751200, 'inactive'),
  ]
  const stationIds = stationRows.map((row) => String(row.id))
  const deviceRows: Row[] = [
    { id: '10000000-0000-4000-8000-000000000001', station_id: STATION_ID, name: 'Radar Flowmeter', device_type: 'radar_flowmeter', protocol: 'modbus_tcp', status: 'online', last_seen: now(), enabled: true, scan_interval_sec: 5, firmware_version: 'v2.4.1' },
    { id: '10000000-0000-4000-8000-000000000002', station_id: STATION_ID, name: 'Power Meter', device_type: 'power_meter', protocol: 'modbus_rtu', status: 'online', last_seen: now(), enabled: true, scan_interval_sec: 5, firmware_version: 'v1.8.0' },
    { id: '10000000-0000-4000-8000-000000000003', station_id: STATION_ID, name: 'PLC Turbin', device_type: 'plc', protocol: 'opc_ua', status: 'online', last_seen: now(), enabled: true, scan_interval_sec: 10, firmware_version: 'v5.1.2' },
    { id: '10000000-0000-4000-8000-000000000004', station_id: STATION_ID, name: 'Gateway IoT', device_type: 'gateway', protocol: 'mqtt', status: 'offline', last_seen: new Date(Date.now() - 18 * 60000).toISOString(), enabled: true, scan_interval_sec: 10, firmware_version: 'v3.0.4' },
    { id: '10000000-0000-4000-8000-000000000005', station_id: stationIds[1], name: 'Radar Flowmeter 02', device_type: 'radar_flowmeter', protocol: 'modbus_tcp', status: 'online', last_seen: now(), enabled: true, scan_interval_sec: 5, firmware_version: 'v2.4.1' },
    ...stationIds.slice(2).flatMap((stationId, index) => [
      { id: `10000000-0000-4000-8000-${String(index + 6).padStart(12, '0')}`, station_id: stationId, name: `Gateway IoT ${index + 3}`, device_type: 'gateway', protocol: 'mqtt', status: index === 1 ? 'error' : 'online', last_seen: index === 1 ? new Date(Date.now() - 35 * 60000).toISOString() : now(), enabled: true, scan_interval_sec: 10, firmware_version: 'v3.1.0' },
    ]),
  ]
  const tagDefinitions = [
    ['HYDRO.WATER_LEVEL', 'Muka Air', 'm', 2.5, 2, 0.8, 0.5],
    ['HYDRO.VELOCITY', 'Kecepatan Aliran', 'm/s', 2.2, 1.8, 0.3, 0.1],
    ['HYDRO.FLOW_RATE', 'Debit Aliran', 'm³/s', 9, 7.5, 0.5, 0.2],
    ['POWER.ACTIVE_POWER', 'Daya Aktif', 'kW', 90, 80, 5, 0],
    ['POWER.ENERGY_KWH', 'Energi Kumulatif', 'kWh', null, null, null, null],
    ['TURBINE.RPM', 'Putaran Turbin', 'rpm', 1600, 1500, 800, 700],
    ['SYS.BATTERY_VOLTAGE', 'Tegangan Baterai', 'V', 14.5, 14, 11.5, 11],
    ['SYS.SIGNAL_STRENGTH', 'Kekuatan Sinyal', 'dBm', null, null, null, null],
  ] as const
  const tags: Row[] = tagDefinitions.map(([tag_id, name, unit, hh, hi, lo, ll], index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    device_id: deviceRows[index < 4 ? index : 2]?.id ?? null, station_id: STATION_ID,
    tag_id, name, description: name, value_type: 'float', unit, alarm_high_high: hh,
    alarm_high: hi, alarm_low: lo, alarm_low_low: ll, deadband: 0, enabled: true, display_precision: 2,
  }))
  const baseValues: Record<string, number> = {
    'HYDRO.WATER_LEVEL': 1.45, 'HYDRO.VELOCITY': 1.1, 'HYDRO.FLOW_RATE': 3.2,
    'POWER.ACTIVE_POWER': 50, 'POWER.ENERGY_KWH': 123456.7, 'TURBINE.RPM': 1250,
    'SYS.BATTERY_VOLTAGE': 12.8, 'SYS.SIGNAL_STRENGTH': -72,
  }
  const seedNow = Date.now()
  const measurementPoints = [
    ...Array.from({ length: 1993 }, (_, i) => ({ index: i, timestamp: new Date(seedNow - (2160 - i) * 3600000).toISOString() })),
    ...Array.from({ length: 2016 }, (_, i) => ({ index: 1993 + i, timestamp: new Date(seedNow - (2015 - i) * 5 * 60000).toISOString() })),
  ]
  const measurements: Row[] = measurementPoints.flatMap(({ index, timestamp }) => Object.entries(baseValues).map(([tagId, base], tagIndex) => {
    const variation = tagId === 'POWER.ENERGY_KWH' ? index * 0.72 + Math.sin(index / 20) * 0.2 : tagId === 'SYS.SIGNAL_STRENGTH' ? Math.sin(index / 8) * 4 : Math.sin(index / 23) * (base * 0.06) + Math.sin(index / 7) * (base * 0.02)
    return { id: index * 10 + tagIndex, tag_id: tagId, station_id: STATION_ID, value: Number((base + variation).toFixed(3)), quality: 'good', source_timestamp: timestamp, received_timestamp: timestamp }
  }))
  const activeAt = new Date(Date.now() - 42 * 60000).toISOString()
  const historicalAlarms = Array.from({ length: 240 }, (_, index) => {
    const alarmAt = new Date(Date.now() - (index + 1) * 9 * 3600000).toISOString()
    const clearedAt = new Date(Date.now() - (index + 1) * 9 * 3600000 + 45 * 60000).toISOString()
    const tagId = ['HYDRO.WATER_LEVEL', 'HYDRO.FLOW_RATE', 'POWER.ACTIVE_POWER', 'SYS.BATTERY_VOLTAGE'][index % 4]!
    return { id: `30000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`, station_id: STATION_ID, tag_id: tagId, alarm_type: index % 3 === 0 ? 'high' : 'low', priority: index % 4 === 0 ? 'critical' : index % 2 === 0 ? 'high' : 'medium', message: `Riwayat alarm ${tagId}`, value_at_alarm: 1.9 + index / 20, threshold_value: 2, status: 'cleared', active_at: alarmAt, acknowledged_at: new Date(Date.parse(alarmAt) + 10 * 60000).toISOString(), acknowledged_by: MOCK_USER_ID, ack_comment: 'Ditangani operator', cleared_at: clearedAt, cleared_by: MOCK_USER_ID, duration_seconds: 2700, created_at: alarmAt }
  })
  return {
    stations: stationRows,
    devices: deviceRows,
    tags,
    measurements,
    alarms: [
      { id: '30000000-0000-4000-8000-000000000001', station_id: STATION_ID, tag_id: 'HYDRO.WATER_LEVEL', alarm_type: 'high', priority: 'high', message: 'Muka air mendekati batas tinggi', value_at_alarm: 2.08, threshold_value: 2, status: 'active', active_at: activeAt, acknowledged_at: null, acknowledged_by: null, ack_comment: null, cleared_at: null, cleared_by: null, duration_seconds: null, created_at: activeAt },
      { id: '30000000-0000-4000-8000-000000000002', station_id: STATION_ID, tag_id: 'SYS.GATEWAY_STATUS', alarm_type: 'device_offline', priority: 'critical', message: 'Gateway IoT tidak merespons', value_at_alarm: null, threshold_value: null, status: 'active', active_at: new Date(Date.now() - 18 * 60000).toISOString(), acknowledged_at: null, acknowledged_by: null, ack_comment: null, cleared_at: null, cleared_by: null, duration_seconds: null, created_at: activeAt },
      { id: '30000000-0000-4000-8000-000000000003', station_id: STATION_ID, tag_id: 'POWER.ACTIVE_POWER', alarm_type: 'low', priority: 'medium', message: 'Daya aktif di bawah target operasi', value_at_alarm: 4.2, threshold_value: 5, status: 'acknowledged', active_at: new Date(Date.now() - 3 * 3600000).toISOString(), acknowledged_at: new Date(Date.now() - 2 * 3600000).toISOString(), acknowledged_by: MOCK_USER_ID, ack_comment: 'Sedang dilakukan pemeriksaan', cleared_at: null, cleared_by: null, duration_seconds: null, created_at: activeAt },
      ...historicalAlarms,
    ],
    events: Array.from({ length: 216 }, (_, index) => ({
      id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, station_id: STATION_ID,
      event_type: index === 0 ? 'system' : 'config_change', severity: index === 0 ? 'warning' : 'info',
      message: index === 0 ? 'Gateway IoT kehilangan koneksi' : 'Konfigurasi monitoring diperbarui',
      actor_id: MOCK_USER_ID, actor_email: 'operator@demo.local', actor_role: 'operator', device_id: null, tag_id: null,
      old_value: null, new_value: null, ip_address: '127.0.0.1', user_agent: 'Mock Browser', metadata: {},
      created_at: new Date(Date.now() - index * 10 * 3600000).toISOString(),
    })),
    profiles: [{ id: MOCK_USER_ID, full_name: 'Demo Operator', email: 'operator@demo.local', role: 'superadmin', station_access: stationIds, phone: '+62 812-0000-0000', avatar_url: null, is_active: true, last_login: now(), created_at: now(), updated_at: now() }],
    monthly_reports: Array.from({ length: 12 }, (_, index) => {
      const date = new Date()
      date.setDate(1)
      date.setMonth(date.getMonth() - index)
      return {
        id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        station_id: STATION_ID,
        report_date: date.toISOString().slice(0, 10),
        total_energy_kwh: 18500 + (11 - index) * 340,
        avg_power_kw: 48 + (11 - index),
        max_power_kw: 82 + (11 - index),
        min_power_kw: 12 + (11 - index) / 2,
        operational_hours: 640 - index * 3,
        avg_water_level_m: 1.4 + index / 100,
        max_water_level_m: 1.95 + index / 100,
        min_water_level_m: 0.9 + index / 100,
        avg_flow_rate_m3s: 3.1 + index / 20,
        max_flow_rate_m3s: 7.2 + index / 20,
        availability_percent: 97.5 - index / 2,
        capacity_factor_percent: 61 + index / 3,
        total_alarms: 12 + index,
        critical_alarms: 2 + (index % 3),
        data_quality_percent: 99 - index / 3,
        notes: 'Laporan demo untuk pengujian dashboard',
        created_by: MOCK_USER_ID,
        is_auto_generated: true,
        created_at: now(),
      }
    }),
    breakdown_reports: Array.from({ length: 90 }, (_, index) => ({
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, station_id: stationIds[index % stationIds.length], event_date: new Date(Date.now() - (index + 1) * 86400000).toISOString().slice(0, 10), outage_start: new Date(Date.now() - (index + 1) * 86400000).toISOString(), outage_end: index % 3 === 0 ? null : new Date(Date.now() - (index + 1) * 86400000 + 90 * 60000).toISOString(), duration_hours: index % 3 === 0 ? 1.5 : 0.75, cause: ['Gateway kehilangan koneksi', 'Tegangan listrik tidak stabil', 'Sensor perlu kalibrasi'][index % 3]!, cause_category: ['communication', 'electrical', 'maintenance'][index % 3]!, affected_devices: ['Gateway IoT'], corrective_action: 'Pemeriksaan dan pemulihan perangkat lapangan', operator_name: 'Demo Operator', technician_name: 'Teknisi Lapangan', status: index % 3 === 0 ? 'in_progress' : 'resolved', created_at: now(),
    })),
  }
}

function readStore(): MockStore {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved) as MockStore
  } catch { /* localStorage unavailable or corrupt: recreate demo data */ }
  const seed = createSeed()
  if (seed.stations.length < 3 || seed.measurements.length === 0 || seed.devices.length === 0) {
    throw new Error('Mock database seed tidak valid')
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)) } catch { /* memory-only fallback */ }
  return seed
}

let store = readStore()
function saveStore() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch { /* memory-only fallback */ }
}

function error(message: string) { return { message, details: '', hint: '', code: 'MOCK_ERROR' } }

class MockQuery {
  private filters: Filter[] = []
  private sort: { column: string; ascending: boolean } | null = null
  private maxRows: number | null = null
  private one = false
  private selected = '*'
  private operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null

  constructor(private readonly table: string) {}
  select(columns = '*') { this.selected = columns; return this }
  eq(column: string, value: unknown) { this.filters.push({ column, operator: 'eq', value }); return this }
  in(column: string, value: unknown[]) { this.filters.push({ column, operator: 'in', value }); return this }
  order(column: string, options?: { ascending?: boolean }) { this.sort = { column, ascending: options?.ascending ?? true }; return this }
  limit(value: number) { this.maxRows = value; return this }
  single() { this.one = true; return this }
  maybeSingle() { this.one = true; return this }
  insert(payload: Row | Row[]) { this.operation = 'insert'; this.payload = payload; return this }
  update(payload: Row) { this.operation = 'update'; this.payload = payload; return this }
  delete() { this.operation = 'delete'; return this }

  then<TResult1 = { data: unknown; error: ReturnType<typeof error> | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: ReturnType<typeof error> | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined)
  }

  private execute(): Promise<{ data: unknown; error: ReturnType<typeof error> | null }> {
    const rows = rowsFor(this.table)
    if (this.operation === 'insert') {
      const values = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]
      const inserted = values.map((value) => ({ id: value.id ?? crypto.randomUUID(), ...value, created_at: value.created_at ?? now(), updated_at: value.updated_at ?? now() }))
      rows.push(...inserted)
      saveStore()
      return Promise.resolve(this.result(inserted))
    }
    const matched = rows.filter((row) => this.filters.every((filter) => filter.operator === 'eq' ? row[filter.column] === filter.value : (filter.value as unknown[]).includes(row[filter.column])))
    if (this.operation === 'update') {
      matched.forEach((row) => Object.assign(row, this.payload ?? {}, { updated_at: now() }))
      saveStore()
      return Promise.resolve(this.result(matched))
    }
    if (this.operation === 'delete') {
      const remaining = rows.filter((row) => !matched.includes(row))
      store[this.table as keyof MockStore] = remaining
      saveStore()
      return Promise.resolve(this.result(matched))
    }
    let result = matched.map((row) => ({ ...row }))
    if (this.sort) result.sort((a, b) => String(a[this.sort!.column] ?? '').localeCompare(String(b[this.sort!.column] ?? '')) * (this.sort!.ascending ? 1 : -1))
    if (this.maxRows != null) result = result.slice(0, this.maxRows)
    if (this.selected !== '*') {
      const columns = this.selected.split(',').map((column) => column.trim())
      result = result.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])))
    }
    return Promise.resolve(this.result(result))
  }

  private result(rows: Row[]) {
    if (this.one) return rows[0] ? { data: rows[0], error: null } : { data: null, error: error(`Data ${this.table} tidak ditemukan`) }
    return { data: rows, error: null }
  }
}

function viewRows(table: string): Row[] {
  if (table === 'latest_measurements') {
    return store.tags.map((tag) => {
      const values = store.measurements.filter((row) => row.tag_id === tag.tag_id).sort((a, b) => String(b.source_timestamp).localeCompare(String(a.source_timestamp)))
      const latest = values[0] ?? {}
      return { ...latest, station_id: tag.station_id, tag_name: tag.name, unit: tag.unit, display_precision: tag.display_precision, alarm_high: tag.alarm_high, alarm_high_high: tag.alarm_high_high, alarm_low: tag.alarm_low, alarm_low_low: tag.alarm_low_low }
    })
  }
  if (table === 'device_health_view') {
    return store.devices.map((device) => ({ ...device, minutes_since_last_seen: device.last_seen ? Math.floor((Date.now() - Date.parse(String(device.last_seen))) / 60000) : null, is_online: device.status === 'online' && device.enabled === true }))
  }
  if (table === 'active_alarms_view') return store.alarms.filter((row) => row.status === 'active' || row.status === 'acknowledged')
  if (table === 'daily_energy_summary') {
    const grouped = new Map<string, { power: number[]; energy: number[] }>()
    store.measurements
      .filter((row) => row.station_id === STATION_ID && ['POWER.ACTIVE_POWER', 'POWER.ENERGY_KWH'].includes(String(row.tag_id)))
      .forEach((row) => {
        const day = String(row.source_timestamp).slice(0, 10)
        const bucket = grouped.get(day) ?? { power: [], energy: [] }
        const value = Number(row.value)
        if (row.tag_id === 'POWER.ACTIVE_POWER') bucket.power.push(value)
        else bucket.energy.push(value)
        grouped.set(day, bucket)
      })
    return [...grouped.entries()].map(([day, values]) => ({
      station_id: STATION_ID,
      day,
      avg_power_kw: values.power.length ? values.power.reduce((sum, value) => sum + value, 0) / values.power.length : null,
      max_power_kw: values.power.length ? Math.max(...values.power) : null,
      min_power_kw: values.power.length ? Math.min(...values.power) : null,
      total_energy_kwh: values.energy.length > 1 ? Math.max(...values.energy) - Math.min(...values.energy) : null,
      sample_count: values.power.length,
    }))
  }
  return (store[table as keyof MockStore] ?? []) as Row[]
}

/** Tiruan view station_overview (migrasi 003) untuk mode mock. */
function stationOverviewRows(): Row[] {
  return store.stations.map((station) => {
    const rows = store.measurements.filter((m) => m.station_id === station.id)
    const latest = (tag: string) => rows.filter((m) => m.tag_id === tag).sort((x, y) => String(y.source_timestamp).localeCompare(String(x.source_timestamp)))[0]
    const alarms = store.alarms.filter((a) => a.station_id === station.id && (a.status === 'active' || a.status === 'acknowledged'))
    const calibration = (store.station_calibrations ?? []).filter((c) => c.station_id === station.id).sort((x, y) => Number(y.version) - Number(x.version))[0]
    const level = latest('HYDRO.WATER_LEVEL'); const velocity = latest('HYDRO.VELOCITY'); const flow = latest('HYDRO.FLOW_RATE')
    return {
      id: station.id, name: station.name, location: station.location, status: station.status,
      calibration_interval_days: station.calibration_interval_days ?? 90,
      last_data_at: rows.reduce<string | null>((max, m) => (!max || String(m.source_timestamp) > max ? String(m.source_timestamp) : max), null),
      level_m: level?.value ?? null, level_quality: level?.quality ?? null,
      velocity_ms: velocity?.value ?? null, velocity_quality: velocity?.quality ?? null,
      flow_m3s: flow?.value ?? null, flow_quality: flow?.quality ?? null,
      active_alarms: alarms.length, critical_alarms: alarms.filter((a) => a.priority === 'critical').length,
      calibration_version: calibration?.version ?? null, calibration_at: calibration?.effective_from ?? null, calibration_method: calibration?.method ?? null,
    }
  })
}

function rowsFor(table: string) {
  if (table === 'latest_measurements' || table === 'device_health_view' || table === 'active_alarms_view' || table === 'daily_energy_summary') return viewRows(table)
  if (table === 'station_overview') return stationOverviewRows()
  return (store[table as keyof MockStore] ?? []) as Row[]
}

function mockUser() {
  return { id: MOCK_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'operator@demo.local', user_metadata: {}, app_metadata: {}, created_at: now() }
}

function rpc(name: string, args: Record<string, unknown>) {
  if (name === 'get_station_kpi') {
    const latest = viewRows('latest_measurements').filter((row) => row.station_id === args.p_station_id)
    const value = (tag: string) => Number(latest.find((row) => row.tag_id === tag)?.value ?? 0)
    const active = store.alarms.filter((row) => row.station_id === args.p_station_id && ['active', 'acknowledged'].includes(String(row.status)))
    const devices = viewRows('device_health_view').filter((row) => row.station_id === args.p_station_id)
    return { data: { water_level: value('HYDRO.WATER_LEVEL'), velocity: value('HYDRO.VELOCITY'), flow_rate: value('HYDRO.FLOW_RATE'), active_power: value('POWER.ACTIVE_POWER'), turbine_rpm: value('TURBINE.RPM'), daily_energy: 428.6, active_alarms: { total: active.length, critical: active.filter((row) => row.priority === 'critical').length, high: active.filter((row) => row.priority === 'high').length, medium: active.filter((row) => row.priority === 'medium').length, low: active.filter((row) => row.priority === 'low').length }, device_status_summary: { total: devices.length, online: devices.filter((row) => row.is_online).length, offline: devices.filter((row) => !row.is_online).length }, period_hours: args.p_period_hours ?? 24, generated_at: now() }, error: null }
  }
  if (name === 'run_alarm_engine') {
    const stationId = String(args.p_station_id)
    let created = 0
    let cleared = 0
    const active = (tagId: string | null, deviceId: string | null, type: string) => store.alarms.find((row) => row.station_id === stationId && row.tag_id === tagId && row.device_id === deviceId && row.alarm_type === type && ['active', 'acknowledged'].includes(String(row.status)))
    store.tags.filter((tag) => tag.station_id === stationId && tag.enabled !== false).forEach((tag) => {
      const latest = store.measurements.filter((row) => row.station_id === stationId && row.tag_id === tag.tag_id).sort((a, b) => String(b.source_timestamp).localeCompare(String(a.source_timestamp)))[0]
      const device = store.devices.find((row) => row.id === tag.device_id)
      const staleAfter = Math.max(Number(device?.scan_interval_sec ?? 10) * 3, 30) * 60000
      const stale = !latest || latest.quality !== 'good' || Date.now() - Date.parse(String(latest.source_timestamp)) > staleAfter
      const existing = active(String(tag.tag_id), null, 'data_stale')
      if (stale && !existing) { store.alarms.push({ id: crypto.randomUUID(), station_id: stationId, tag_id: tag.tag_id, device_id: null, alarm_type: 'data_stale', priority: 'high', message: `${tag.name} stale`, value_at_alarm: null, threshold_value: staleAfter / 1000, status: 'active', active_at: now(), acknowledged_at: null, acknowledged_by: null, ack_comment: null, cleared_at: null, cleared_by: null, duration_seconds: null, created_at: now() }); created++ }
      if (!stale && existing) { Object.assign(existing, { status: 'cleared', cleared_at: now() }); cleared++ }
    })
    store.devices.filter((device) => device.station_id === stationId && device.enabled !== false && device.status !== 'maintenance').forEach((device) => {
      const offline = device.status === 'offline' || device.status === 'error' || !device.last_seen || Date.now() - Date.parse(String(device.last_seen)) > Math.max(Number(device.scan_interval_sec ?? 10) * 3, 30) * 1000
      const existing = active(null, String(device.id), 'device_offline')
      if (offline && !existing) { store.alarms.push({ id: crypto.randomUUID(), station_id: stationId, tag_id: null, device_id: device.id, alarm_type: 'device_offline', priority: 'high', message: `${device.name} offline`, value_at_alarm: null, threshold_value: null, status: 'active', active_at: now(), acknowledged_at: null, acknowledged_by: null, ack_comment: null, cleared_at: null, cleared_by: null, duration_seconds: null, created_at: now() }); created++ }
      if (!offline && existing) { Object.assign(existing, { status: 'cleared', cleared_at: now() }); cleared++ }
    })
    saveStore(); return { data: { station_id: stationId, created, cleared, evaluated_at: now() }, error: null }
  }
  if (name === 'get_trend_data') {
    const from = Date.parse(String(args.p_from_ts)); const to = Date.parse(String(args.p_to_ts)); const interval = Number(args.p_interval_minutes ?? 15) * 60000
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(interval) || interval <= 0) return { data: null, error: error('Parameter periode trend tidak valid') }
    const buckets = new Map<number, number[]>()
    store.measurements
      .filter((row) => row.tag_id === args.p_tag_id && row.quality === 'good')
      .forEach((row) => {
        const timestamp = Date.parse(String(row.source_timestamp))
        if (timestamp >= from && timestamp <= to) {
          const bucket = Math.floor(timestamp / interval) * interval
          const values = buckets.get(bucket) ?? []
          values.push(Number(row.value)); buckets.set(bucket, values)
        }
      })
    // Keep the mock dashboard useful even when its seed predates the current clock.
    if (!buckets.size && args.p_tag_id === 'HYDRO.WATER_LEVEL') {
      for (let timestamp = Math.max(from, to - 6 * 3600000); timestamp <= to; timestamp += interval) {
        const hours = (timestamp - from) / 3600000
        buckets.set(timestamp, [1.35 + Math.sin(hours * 1.7) * 0.08 + Math.sin(hours * 0.4) * 0.03])
      }
    }
    const data = [...buckets.entries()].sort(([a], [b]) => a - b).map(([timestamp, numbers]) => ({
      bucket: new Date(timestamp).toISOString(), avg_value: numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
      min_value: Math.min(...numbers), max_value: Math.max(...numbers), sample_count: numbers.length,
    }))
    return { data, error: null }
  }
  if (name === 'get_alarm_statistics') {
    const alarms = store.alarms.filter((row) => row.station_id === args.p_station_id)
    const countBy = (key: string) => Object.fromEntries([...new Set(alarms.map((row) => String(row[key])))].map((value) => [value, alarms.filter((row) => row[key] === value).length]))
    return { data: { by_priority: countBy('priority'), by_type: countBy('alarm_type'), by_day: Object.entries(alarms.reduce<Record<string, number>>((acc, row) => { const day = String(row.active_at).slice(0, 10); acc[day] = (acc[day] ?? 0) + 1; return acc }, {})).map(([day, cnt]) => ({ day, cnt })).sort((x, y) => x.day.localeCompare(y.day)), avg_resolve_seconds_by_priority: { medium: 3600 }, total_alarms: alarms.length }, error: null }
  }
  if (name === 'apply_calibration') {
    const list = (store.station_calibrations ??= [])
    const refs = (args.p_references as Row[] | undefined) ?? []
    const version = Math.max(0, ...list.filter((row) => row.station_id === args.p_station_id).map((row) => Number(row.version))) + 1
    const calibration = { id: crypto.randomUUID(), station_id: args.p_station_id, version, ...(args.p_params as Row), method: refs.length ? 'field_reference' : 'manual', notes: args.p_notes ?? null, effective_from: now(), created_by: MOCK_USER_ID, created_by_email: 'operator@demo.local', created_at: now() }
    list.push(calibration)
    ;(store.calibration_references ??= []).push(...refs.map((ref) => ({ id: crypto.randomUUID(), calibration_id: calibration.id, station_id: args.p_station_id, ...ref, created_at: now() })))
    saveStore(); return { data: calibration, error: null }
  }
  if (name === 'acknowledge_alarm') {
    const alarm = store.alarms.find((row) => row.id === args.p_alarm_id && row.status === 'active')
    if (!alarm) return { data: null, error: error('Alarm tidak ditemukan atau sudah di-acknowledge') }
    Object.assign(alarm, { status: 'acknowledged', acknowledged_at: now(), acknowledged_by: MOCK_USER_ID, ack_comment: args.p_comment ?? null })
    saveStore(); return { data: alarm, error: null }
  }
  return { data: null, error: error(`RPC mock belum tersedia: ${name}`) }
}

export function createMockSupabase(): SupabaseClient<Database> {
  const listeners = new Set<(event: string, session: unknown) => void>()
  const client = {
    from(table: string) {
      const query = new MockQuery(table)
      const originalExecute = (query as unknown as { execute?: () => Promise<unknown> }).execute
      void originalExecute
      // Replace the query's backing rows for views without duplicating the builder API.
      return query
    },
    rpc,
    auth: {
      async getSession() { return { data: { session: { access_token: 'mock-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh', user: mockUser() } }, error: null } },
      onAuthStateChange(callback: (event: string, session: unknown) => void) { listeners.add(callback); callback('SIGNED_IN', { user: mockUser() }); return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } } },
      async signInWithPassword() { const session = { user: mockUser() }; listeners.forEach((listener) => listener('SIGNED_IN', session)); return { data: session, error: null } },
      async signOut() { listeners.forEach((listener) => listener('SIGNED_OUT', null)); return { error: null } },
      async updateUser() { return { data: { user: mockUser() }, error: null } },
    },
    channel() {
      const channel = { on() { return channel }, subscribe(callback?: (status: string) => void) { callback?.('SUBSCRIBED'); return channel } }
      return channel
    },
    removeChannel() { return 'ok' },
    // Tiruan Edge Function admin-users (lihat supabase/functions/admin-users).
    functions: {
      async invoke(name: string, options?: { body?: Record<string, unknown> }) {
        const body = options?.body ?? {}
        if (name !== 'admin-users') return { data: null, error: new Error('Fungsi tidak dikenal') }
        if (body.action === 'create') {
          if (store.profiles.some((p) => p.email === body.email)) return { data: null, error: new Error('Email ini sudah terdaftar.') }
          const id = crypto.randomUUID?.() ?? String(Date.now())
          store.profiles.push({ id, full_name: body.full_name || null, email: body.email, role: body.role, station_access: body.station_access ?? [], phone: null, avatar_url: null, is_active: true, last_login: null, created_at: now(), updated_at: now() })
          return { data: { id }, error: null }
        }
        return { data: { ok: true }, error: null }
      },
    },
  }
  return client as unknown as SupabaseClient<Database>
}