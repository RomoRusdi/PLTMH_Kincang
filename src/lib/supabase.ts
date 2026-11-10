import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createMockSupabase } from './mockSupabase'

// ============================================================================
// DATABASE TYPES - harus sinkron dengan supabase-schema.sql
// ============================================================================

export type StationStatus = 'active' | 'inactive' | 'maintenance'
export type DeviceType = 'radar_flowmeter' | 'power_meter' | 'plc' | 'gateway' | 'modem'
export type Protocol = 'modbus_rtu' | 'modbus_tcp' | 'mqtt' | 'https' | 'opc_ua'
export type DeviceStatus = 'online' | 'offline' | 'error' | 'maintenance'
export type ValueType = 'float' | 'integer' | 'boolean' | 'string'
export type Quality = 'good' | 'bad' | 'uncertain' | 'stale' | 'comm_failure'
export type AlarmType =
  | 'high_high'
  | 'high'
  | 'low'
  | 'low_low'
  | 'comm_failure'
  | 'data_stale'
  | 'device_offline'
  | 'system'
  | 'manual'
export type AlarmPriority = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type AlarmStatus = 'active' | 'acknowledged' | 'cleared' | 'suppressed'
export type EventType =
  | 'login'
  | 'logout'
  | 'command'
  | 'config_change'
  | 'alarm_ack'
  | 'alarm_clear'
  | 'device_change'
  | 'user_change'
  | 'system'
  | 'data_correction'
export type EventSeverity = 'critical' | 'warning' | 'info' | 'debug'
export type UserRole = 'superadmin' | 'admin' | 'operator' | 'technician' | 'viewer'
export type CauseCategory =
  | 'lightning'
  | 'mechanical'
  | 'electrical'
  | 'communication'
  | 'flood'
  | 'maintenance'
  | 'other'
export type BreakdownStatus = 'open' | 'in_progress' | 'resolved'

export type SectionType = 'rectangle' | 'trapezoid'
export type CalibrationMethod = 'manual' | 'field_reference'

/** Parameter kalibrasi radar satu stasiun (lihat migrasi 002). */
export interface CalibrationParams {
  install_height_m: number
  level_offset_m: number
  section_type: SectionType
  bottom_width_m: number
  side_slope: number
  velocity_coefficient: number
}

export interface StationCalibration extends CalibrationParams {
  id: string
  station_id: string
  version: number
  method: CalibrationMethod
  notes: string | null
  effective_from: string
  created_by: string | null
  created_by_email: string | null
  created_at: string
}

/** Baris tabel calibration_references. */
export type CalibrationReferenceRow = {
  id: string
  calibration_id: string
  station_id: string
  measured_at: string
  ref_level_m: number | null
  ref_velocity_ms: number | null
  ref_flow_m3s: number | null
  radar_air_gap_m: number | null
  radar_velocity_ms: number | null
  notes: string | null
  created_at: string
}

export interface CalibrationReferenceInput {
  measured_at: string
  ref_level_m: number | null
  ref_velocity_ms: number | null
  ref_flow_m3s: number | null
  radar_air_gap_m: number | null
  radar_velocity_ms: number | null
  notes?: string | null
}

export interface Station {
  id: string
  name: string
  location: string
  latitude: number | null
  longitude: number | null
  description: string | null
  status: StationStatus
  river_name: string | null
  installation_date: string | null
  elevation_m: number | null
  /** Batas umur kalibrasi sebelum stasiun ditandai perlu kalibrasi ulang. */
  calibration_interval_days: number
  created_at: string
  updated_at: string
}

/** Satu baris view station_overview (migrasi 003). */
export type StationOverview = {
  id: string
  name: string
  location: string
  status: StationStatus
  calibration_interval_days: number
  last_data_at: string | null
  level_m: number | null
  level_quality: Quality | null
  velocity_ms: number | null
  velocity_quality: Quality | null
  flow_m3s: number | null
  flow_quality: Quality | null
  active_alarms: number
  critical_alarms: number
  calibration_version: number | null
  calibration_at: string | null
  calibration_method: CalibrationMethod | null
}

export interface Device {
  id: string
  station_id: string | null
  name: string
  device_type: DeviceType
  protocol: Protocol
  modbus_address: number | null
  ip_address: string | null
  port: number | null
  firmware_version: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  status: DeviceStatus
  last_seen: string | null
  scan_interval_sec: number
  enabled: boolean
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  device_id: string | null
  station_id: string | null
  tag_id: string
  name: string
  description: string | null
  value_type: ValueType
  unit: string | null
  source_address: string | null
  alarm_high: number | null
  alarm_high_high: number | null
  alarm_low: number | null
  alarm_low_low: number | null
  deadband: number
  enabled: boolean
  display_precision: number
  created_at: string
}

export interface Measurement {
  id: number
  tag_id: string
  station_id: string | null
  value: number | null
  quality: Quality
  source_timestamp: string
  received_timestamp: string
  sequence_id: number | null
  raw_value: string | null
}

export interface Alarm {
  id: string
  station_id: string | null
  tag_id: string | null
  device_id?: string | null
  alarm_type: AlarmType
  priority: AlarmPriority
  message: string
  value_at_alarm: number | null
  threshold_value: number | null
  status: AlarmStatus
  active_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  ack_comment: string | null
  cleared_at: string | null
  cleared_by: string | null
  duration_seconds: number | null
  created_at: string
}

export interface Event {
  id: string
  station_id: string | null
  event_type: EventType
  severity: EventSeverity
  message: string
  actor_id: string | null
  actor_email: string | null
  actor_role: string | null
  device_id: string | null
  tag_id: string | null
  old_value: string | null
  new_value: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  role: UserRole
  station_access: string[]
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  last_login: string | null
  created_at: string
  updated_at: string
}

export interface MonthlyReport {
  id: string
  station_id: string | null
  report_date: string
  total_energy_kwh: number | null
  avg_power_kw: number | null
  max_power_kw: number | null
  min_power_kw: number | null
  operational_hours: number | null
  avg_water_level_m: number | null
  max_water_level_m: number | null
  min_water_level_m: number | null
  avg_flow_rate_m3s: number | null
  max_flow_rate_m3s: number | null
  availability_percent: number | null
  capacity_factor_percent: number | null
  total_alarms: number | null
  critical_alarms: number | null
  data_quality_percent: number | null
  notes: string | null
  created_by: string | null
  is_auto_generated: boolean
  created_at: string
}

export interface BreakdownReport {
  id: string
  station_id: string | null
  event_date: string
  outage_start: string | null
  outage_end: string | null
  duration_hours: number | null
  load_at_outage_kw: number | null
  energy_not_served_kwh: number | null
  cause: string
  cause_category: CauseCategory | null
  affected_devices: string[] | null
  corrective_action: string | null
  operator_name: string | null
  technician_name: string | null
  status: BreakdownStatus
  created_by: string | null
  created_at: string
}

// ---- Views ----

export interface LatestMeasurementView {
  tag_id: string
  station_id: string | null
  value: number | null
  quality: Quality
  source_timestamp: string
  received_timestamp: string
  tag_name: string
  unit: string | null
  display_precision: number
  alarm_high: number | null
  alarm_high_high: number | null
  alarm_low: number | null
  alarm_low_low: number | null
}

export interface ActiveAlarmView {
  id: string
  station_id: string | null
  station_name: string | null
  tag_id: string | null
  tag_name: string | null
  unit: string | null
  alarm_type: AlarmType
  priority: AlarmPriority
  message: string
  value_at_alarm: number | null
  threshold_value: number | null
  status: AlarmStatus
  active_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  ack_comment: string | null
  duration_seconds_live: number
}

export interface DeviceHealthView {
  id: string
  station_id: string | null
  name: string
  device_type: DeviceType
  protocol: Protocol
  status: DeviceStatus
  last_seen: string | null
  enabled: boolean
  scan_interval_sec: number
  firmware_version: string | null
  minutes_since_last_seen: number | null
  is_online: boolean
}

export interface DailyEnergySummaryView {
  station_id: string | null
  day: string
  avg_power_kw: number | null
  max_power_kw: number | null
  min_power_kw: number | null
  total_energy_kwh: number | null
  sample_count: number
}

// ---- RPC return shapes ----

export interface StationKpi {
  water_level: number | null
  velocity: number | null
  flow_rate: number | null
  active_power: number | null
  turbine_rpm: number | null
  daily_energy: number
  active_alarms: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  device_status_summary: {
    total: number
    online: number
    offline: number
  }
  period_hours: number
  generated_at: string
}

export interface TrendDataPoint {
  bucket: string
  avg_value: number | null
  min_value: number | null
  max_value: number | null
  sample_count: number
}

export interface AlarmStatistics {
  by_priority: Record<string, number>
  by_type: Record<string, number>
  by_day: Array<{ day: string; cnt: number }>
  avg_resolve_seconds_by_priority: Record<string, number>
  total_alarms: number
}

// ============================================================================
// DATABASE SCHEMA TYPE (dipakai oleh createClient<Database>)
// Semua Row/Insert/Update HARUS berupa plain literal object (bukan Omit<>/Partial<>
// atau intersection types) agar kompatibel dengan postgrest-js GenericTable constraint.
// ============================================================================

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: '13'
  }
  public: {
    Tables: {
      stations: {
        Row: {
          id: string; name: string; location: string
          latitude: number | null; longitude: number | null; description: string | null
          status: StationStatus; river_name: string | null; installation_date: string | null
          elevation_m: number | null; calibration_interval_days: number; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; name: string; location: string
          latitude?: number | null; longitude?: number | null; description?: string | null
          status?: StationStatus; river_name?: string | null; installation_date?: string | null
          elevation_m?: number | null; created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; name?: string; location?: string
          latitude?: number | null; longitude?: number | null; description?: string | null
          status?: StationStatus; river_name?: string | null; installation_date?: string | null
          elevation_m?: number | null; calibration_interval_days?: number; created_at?: string; updated_at?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          id: string; station_id: string | null; name: string; device_type: DeviceType; protocol: Protocol
          modbus_address: number | null; ip_address: string | null; port: number | null
          firmware_version: string | null; manufacturer: string | null; model: string | null
          serial_number: string | null; status: DeviceStatus; last_seen: string | null
          scan_interval_sec: number; enabled: boolean; config: Record<string, unknown>
          created_at: string; updated_at: string
        }
        Insert: {
          id?: string; station_id?: string | null; name: string; device_type: DeviceType; protocol?: Protocol
          modbus_address?: number | null; ip_address?: string | null; port?: number | null
          firmware_version?: string | null; manufacturer?: string | null; model?: string | null
          serial_number?: string | null; status?: DeviceStatus; last_seen?: string | null
          scan_interval_sec?: number; enabled?: boolean; config?: Record<string, unknown>
          created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; station_id?: string | null; name?: string; device_type?: DeviceType; protocol?: Protocol
          modbus_address?: number | null; ip_address?: string | null; port?: number | null
          firmware_version?: string | null; manufacturer?: string | null; model?: string | null
          serial_number?: string | null; status?: DeviceStatus; last_seen?: string | null
          scan_interval_sec?: number; enabled?: boolean; config?: Record<string, unknown>
          created_at?: string; updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string; device_id: string | null; station_id: string | null; tag_id: string; name: string
          description: string | null; value_type: ValueType; unit: string | null; source_address: string | null
          alarm_high: number | null; alarm_high_high: number | null; alarm_low: number | null
          alarm_low_low: number | null; deadband: number; enabled: boolean; display_precision: number; created_at: string
        }
        Insert: {
          id?: string; device_id?: string | null; station_id?: string | null; tag_id: string; name: string
          description?: string | null; value_type?: ValueType; unit?: string | null; source_address?: string | null
          alarm_high?: number | null; alarm_high_high?: number | null; alarm_low?: number | null
          alarm_low_low?: number | null; deadband?: number; enabled?: boolean; display_precision?: number; created_at?: string
        }
        Update: {
          id?: string; device_id?: string | null; station_id?: string | null; tag_id?: string; name?: string
          description?: string | null; value_type?: ValueType; unit?: string | null; source_address?: string | null
          alarm_high?: number | null; alarm_high_high?: number | null; alarm_low?: number | null
          alarm_low_low?: number | null; deadband?: number; enabled?: boolean; display_precision?: number; created_at?: string
        }
        Relationships: []
      }
      measurements: {
        Row: {
          id: number; tag_id: string; station_id: string | null; value: number | null; quality: Quality
          source_timestamp: string; received_timestamp: string; sequence_id: number | null; raw_value: string | null
        }
        Insert: {
          id?: number; tag_id: string; station_id?: string | null; value?: number | null; quality?: Quality
          source_timestamp: string; received_timestamp?: string; sequence_id?: number | null; raw_value?: string | null
        }
        Update: {
          id?: number; tag_id?: string; station_id?: string | null; value?: number | null; quality?: Quality
          source_timestamp?: string; received_timestamp?: string; sequence_id?: number | null; raw_value?: string | null
        }
        Relationships: []
      }
      alarms: {
        Row: {
          id: string; station_id: string | null; tag_id: string | null; alarm_type: AlarmType
          device_id: string | null
          priority: AlarmPriority; message: string; value_at_alarm: number | null; threshold_value: number | null
          status: AlarmStatus; active_at: string; acknowledged_at: string | null; acknowledged_by: string | null
          ack_comment: string | null; cleared_at: string | null; cleared_by: string | null
          duration_seconds: number | null; created_at: string
        }
        Insert: {
          id?: string; station_id?: string | null; tag_id?: string | null; alarm_type: AlarmType
          device_id?: string | null
          priority: AlarmPriority; message: string; value_at_alarm?: number | null; threshold_value?: number | null
          status?: AlarmStatus; active_at?: string; acknowledged_at?: string | null; acknowledged_by?: string | null
          ack_comment?: string | null; cleared_at?: string | null; cleared_by?: string | null
          duration_seconds?: number | null; created_at?: string
        }
        Update: {
          id?: string; station_id?: string | null; tag_id?: string | null; alarm_type?: AlarmType
          device_id?: string | null
          priority?: AlarmPriority; message?: string; value_at_alarm?: number | null; threshold_value?: number | null
          status?: AlarmStatus; active_at?: string; acknowledged_at?: string | null; acknowledged_by?: string | null
          ack_comment?: string | null; cleared_at?: string | null; cleared_by?: string | null
          duration_seconds?: number | null; created_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string; station_id: string | null; event_type: EventType; severity: EventSeverity; message: string
          actor_id: string | null; actor_email: string | null; actor_role: string | null
          device_id: string | null; tag_id: string | null; old_value: string | null; new_value: string | null
          ip_address: string | null; user_agent: string | null; metadata: Record<string, unknown>; created_at: string
        }
        Insert: {
          id?: string; station_id?: string | null; event_type: EventType; severity?: EventSeverity; message: string
          actor_id?: string | null; actor_email?: string | null; actor_role?: string | null
          device_id?: string | null; tag_id?: string | null; old_value?: string | null; new_value?: string | null
          ip_address?: string | null; user_agent?: string | null; metadata?: Record<string, unknown>; created_at?: string
        }
        Update: {
          id?: string; station_id?: string | null; event_type?: EventType; severity?: EventSeverity; message?: string
          actor_id?: string | null; actor_email?: string | null; actor_role?: string | null
          device_id?: string | null; tag_id?: string | null; old_value?: string | null; new_value?: string | null
          ip_address?: string | null; user_agent?: string | null; metadata?: Record<string, unknown>; created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string; full_name: string | null; role: UserRole; station_access: string[]
          phone: string | null; avatar_url: string | null; is_active: boolean
          last_login: string | null; created_at: string; updated_at: string
        }
        Insert: {
          id: string; full_name?: string | null; role?: UserRole; station_access?: string[]
          phone?: string | null; avatar_url?: string | null; is_active?: boolean
          last_login?: string | null; created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; full_name?: string | null; role?: UserRole; station_access?: string[]
          phone?: string | null; avatar_url?: string | null; is_active?: boolean
          last_login?: string | null; created_at?: string; updated_at?: string
        }
        Relationships: []
      }
      monthly_reports: {
        Row: {
          id: string; station_id: string | null; report_date: string
          total_energy_kwh: number | null; avg_power_kw: number | null; max_power_kw: number | null
          min_power_kw: number | null; operational_hours: number | null
          avg_water_level_m: number | null; max_water_level_m: number | null; min_water_level_m: number | null
          avg_flow_rate_m3s: number | null; max_flow_rate_m3s: number | null
          availability_percent: number | null; capacity_factor_percent: number | null
          total_alarms: number | null; critical_alarms: number | null; data_quality_percent: number | null
          notes: string | null; created_by: string | null; is_auto_generated: boolean; created_at: string
        }
        Insert: {
          id?: string; station_id?: string | null; report_date: string
          total_energy_kwh?: number | null; avg_power_kw?: number | null; max_power_kw?: number | null
          min_power_kw?: number | null; operational_hours?: number | null
          avg_water_level_m?: number | null; max_water_level_m?: number | null; min_water_level_m?: number | null
          avg_flow_rate_m3s?: number | null; max_flow_rate_m3s?: number | null
          availability_percent?: number | null; capacity_factor_percent?: number | null
          total_alarms?: number | null; critical_alarms?: number | null; data_quality_percent?: number | null
          notes?: string | null; created_by?: string | null; is_auto_generated?: boolean; created_at?: string
        }
        Update: {
          id?: string; station_id?: string | null; report_date?: string
          total_energy_kwh?: number | null; avg_power_kw?: number | null; max_power_kw?: number | null
          min_power_kw?: number | null; operational_hours?: number | null
          avg_water_level_m?: number | null; max_water_level_m?: number | null; min_water_level_m?: number | null
          avg_flow_rate_m3s?: number | null; max_flow_rate_m3s?: number | null
          availability_percent?: number | null; capacity_factor_percent?: number | null
          total_alarms?: number | null; critical_alarms?: number | null; data_quality_percent?: number | null
          notes?: string | null; created_by?: string | null; is_auto_generated?: boolean; created_at?: string
        }
        Relationships: []
      }
      breakdown_reports: {
        Row: {
          id: string; station_id: string | null; event_date: string
          outage_start: string | null; outage_end: string | null; duration_hours: number | null
          load_at_outage_kw: number | null; energy_not_served_kwh: number | null
          cause: string; cause_category: CauseCategory | null; affected_devices: string[] | null
          corrective_action: string | null; operator_name: string | null; technician_name: string | null
          status: BreakdownStatus; created_by: string | null; created_at: string
        }
        Insert: {
          id?: string; station_id?: string | null; event_date: string
          outage_start?: string | null; outage_end?: string | null; duration_hours?: number | null
          load_at_outage_kw?: number | null; energy_not_served_kwh?: number | null
          cause: string; cause_category?: CauseCategory | null; affected_devices?: string[] | null
          corrective_action?: string | null; operator_name?: string | null; technician_name?: string | null
          status?: BreakdownStatus; created_by?: string | null; created_at?: string
        }
        Update: {
          id?: string; station_id?: string | null; event_date?: string
          outage_start?: string | null; outage_end?: string | null; duration_hours?: number | null
          load_at_outage_kw?: number | null; energy_not_served_kwh?: number | null
          cause?: string; cause_category?: CauseCategory | null; affected_devices?: string[] | null
          corrective_action?: string | null; operator_name?: string | null; technician_name?: string | null
          status?: BreakdownStatus; created_by?: string | null; created_at?: string
        }
        Relationships: []
      }
      // Hanya dibaca dari web; penulisan lewat RPC apply_calibration.
      station_calibrations: {
        Row: {
          id: string; station_id: string; version: number; install_height_m: number; level_offset_m: number
          section_type: SectionType; bottom_width_m: number; side_slope: number; velocity_coefficient: number
          method: CalibrationMethod; notes: string | null; effective_from: string
          created_by: string | null; created_by_email: string | null; created_at: string
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: []
      }
      calibration_references: {
        Row: {
          id: string; calibration_id: string; station_id: string; measured_at: string
          ref_level_m: number | null; ref_velocity_ms: number | null; ref_flow_m3s: number | null
          radar_air_gap_m: number | null; radar_velocity_ms: number | null; notes: string | null; created_at: string
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: []
      }
    }
    Views: {
      latest_measurements: {
        Row: {
          tag_id: string; station_id: string | null; value: number | null; quality: Quality
          source_timestamp: string; received_timestamp: string; tag_name: string; unit: string | null
          display_precision: number; alarm_high: number | null; alarm_high_high: number | null
          alarm_low: number | null; alarm_low_low: number | null
        }
        Relationships: []
      }
      active_alarms_view: {
        Row: {
          id: string; station_id: string | null; station_name: string | null
          tag_id: string | null; tag_name: string | null; unit: string | null
          alarm_type: AlarmType; priority: AlarmPriority; message: string
          device_id: string | null
          value_at_alarm: number | null; threshold_value: number | null; status: AlarmStatus
          active_at: string; acknowledged_at: string | null; acknowledged_by: string | null
          ack_comment: string | null; duration_seconds_live: number
        }
        Relationships: []
      }
      device_health_view: {
        Row: {
          id: string; station_id: string | null; name: string; device_type: DeviceType; protocol: Protocol
          status: DeviceStatus; last_seen: string | null; enabled: boolean; scan_interval_sec: number
          firmware_version: string | null; minutes_since_last_seen: number | null; is_online: boolean
        }
        Relationships: []
      }
      station_overview: {
        Row: StationOverview
        Relationships: []
      }
      daily_energy_summary: {
        Row: {
          station_id: string | null; day: string; avg_power_kw: number | null
          max_power_kw: number | null; min_power_kw: number | null
          total_energy_kwh: number | null; sample_count: number
        }
        Relationships: []
      }
    }
    Functions: {
      get_station_kpi: {
        Args: { p_station_id: string; p_period_hours?: number }
        Returns: {
          water_level: number | null; velocity: number | null; flow_rate: number | null
          active_power: number | null; turbine_rpm: number | null; daily_energy: number
          active_alarms: Record<string, unknown>; device_status_summary: Record<string, unknown>
          period_hours: number; generated_at: string
        }
      }
      apply_calibration: {
        Args: { p_station_id: string; p_params: CalibrationParams; p_references?: CalibrationReferenceInput[]; p_notes?: string | null }
        Returns: StationCalibration
      }
      copy_station_config: {
        Args: { p_from: string; p_to: string }
        Returns: { devices: number; tags: number }
      }
      get_trend_data: {
        Args: { p_station_id: string; p_tag_id: string; p_from_ts: string; p_to_ts: string; p_interval_minutes?: number }
        Returns: {
          bucket: string; avg_value: number | null; min_value: number | null
          max_value: number | null; sample_count: number
        }[]
      }
      get_alarm_statistics: {
        Args: { p_station_id: string; p_days?: number }
        Returns: {
          by_priority: Record<string, number>; by_type: Record<string, number>
          by_day: Record<string, unknown>[]; avg_resolve_seconds_by_priority: Record<string, number>
          total_alarms: number
        }
      }
      run_alarm_engine: {
        Args: { p_station_id: string }
        Returns: Record<string, unknown>
      }
      acknowledge_alarm: {
        Args: { p_alarm_id: string; p_comment?: string | null }
        Returns: {
          id: string; station_id: string | null; tag_id: string | null; alarm_type: AlarmType
          priority: AlarmPriority; message: string; value_at_alarm: number | null; threshold_value: number | null
          status: AlarmStatus; active_at: string; acknowledged_at: string | null; acknowledged_by: string | null
          ack_comment: string | null; cleared_at: string | null; cleared_by: string | null
          duration_seconds: number | null; created_at: string
        }
      }
    }
  }
}

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const useMockDatabase = (import.meta.env.VITE_MOCK_DB ?? 'false') === 'true'

if (!useMockDatabase && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    'VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY wajib diisi di file .env. ' +
      'Lihat .env.example untuk referensi.',
  )
}

export const supabase: SupabaseClient<Database> = useMockDatabase
  ? createMockSupabase()
  : createClient<Database>(supabaseUrl ?? '', supabaseAnonKey ?? '', {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })

/**
 * Nama tabel/view/function konstanta agar tidak ada typo string literal
 * tersebar di codebase.
 */
export const DB_TABLES = {
  stations: 'stations',
  devices: 'devices',
  tags: 'tags',
  measurements: 'measurements',
  alarms: 'alarms',
  events: 'events',
  profiles: 'profiles',
  monthlyReports: 'monthly_reports',
  breakdownReports: 'breakdown_reports',
  latestMeasurements: 'latest_measurements',
  activeAlarmsView: 'active_alarms_view',
  deviceHealthView: 'device_health_view',
  dailyEnergySummary: 'daily_energy_summary',
} as const

