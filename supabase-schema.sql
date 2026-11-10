-- ============================================================================
-- RIVER FLOW GUARDIAN - SISTEM MONITORING SUNGAI UNTUK PLTMH
-- Supabase PostgreSQL Schema
-- ============================================================================
-- Urutan setup pada project Supabase baru:
--   1. Jalankan file ini di SQL Editor (sekali jalan, dari atas ke bawah).
--   2. Jalankan supabase-migration-002-multistasiun-kalibrasi.sql, lalu
--      supabase-migration-003-ringkasan-stasiun.sql, lalu
--      supabase-migration-004-interval-retensi.sql.
--   3. Jalankan supabase-seed.sql (stasiun, perangkat, dan tag).
--   4. Opsional: supabase-demo-history.sql (riwayat dummy untuk grafik).
--   5. Buat user pertama di Authentication > Users, lalu jadikan superadmin
--      (lihat catatan di akhir file ini).
--
-- Sistem bersifat monitoring/pendukung keputusan: tidak ada perintah kontrol
-- yang dikirim ke PLC atau perangkat lapangan. Data masuk hanya melalui
-- fungsi ingest_telemetry() yang dipanggil service ingest dengan service_role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- 1. TABEL: stations
-- ----------------------------------------------------------------------------
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  latitude float8,
  longitude float8,
  description text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'maintenance')),
  river_name text,
  installation_date date,
  elevation_m float8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stations is 'Stasiun pemantauan sungai (SCADA site)';

-- ----------------------------------------------------------------------------
-- 2. TABEL: devices
-- ----------------------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete cascade,
  name text not null,
  device_type text not null
    check (device_type in ('radar_flowmeter', 'power_meter', 'plc', 'gateway', 'modem')),
  protocol text not null default 'modbus_rtu'
    check (protocol in ('modbus_rtu', 'modbus_tcp', 'mqtt', 'https', 'opc_ua')),
  modbus_address integer,
  ip_address text,
  port integer,
  firmware_version text,
  manufacturer text,
  model text,
  serial_number text,
  status text not null default 'online'
    check (status in ('online', 'offline', 'error', 'maintenance')),
  last_seen timestamptz,
  scan_interval_sec integer not null default 5,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.devices is 'Perangkat fisik SCADA (radar, power meter, PLC, gateway)';

-- ----------------------------------------------------------------------------
-- 3. TABEL: tags
-- ----------------------------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete set null,
  station_id uuid references public.stations(id) on delete cascade,
  tag_id text unique not null, -- contoh: 'HYDRO.WATER_LEVEL'
  name text not null,
  description text,
  value_type text not null default 'float'
    check (value_type in ('float', 'integer', 'boolean', 'string')),
  unit text,
  source_address text,
  alarm_high float8,
  alarm_high_high float8,
  alarm_low float8,
  alarm_low_low float8,
  deadband float8 not null default 0,
  enabled boolean not null default true,
  display_precision integer not null default 3,
  created_at timestamptz not null default now()
);

alter table public.tags add column if not exists deadband float8 not null default 0;
alter table public.tags add column if not exists enabled boolean not null default true;
alter table public.tags add column if not exists display_precision integer not null default 3;

do $$
begin
  alter table public.tags add constraint tags_deadband_nonnegative check (deadband >= 0);
exception when duplicate_object then
  null;
end $$;

comment on table public.tags is 'Definisi tag/point data sensor (point configuration)';

-- ----------------------------------------------------------------------------
-- 4. TABEL: measurements (time-series, partitioned by month)
-- ----------------------------------------------------------------------------
-- Parent table partitioned by range on source_timestamp.
create table if not exists public.measurements (
  id bigserial not null,
  tag_id text not null references public.tags(tag_id) on delete cascade,
  station_id uuid references public.stations(id) on delete cascade,
  value float8,
  quality text not null default 'good'
    check (quality in ('good', 'bad', 'uncertain', 'stale', 'comm_failure')),
  source_timestamp timestamptz not null,
  received_timestamp timestamptz not null default now(),
  sequence_id bigint,
  raw_value text,
  primary key (id, source_timestamp)
) partition by range (source_timestamp);

comment on table public.measurements is 'Data historis sensor time-series, dipartisi per bulan';

-- Helper function untuk membuat partisi bulan secara otomatis.
create or replace function public.create_measurements_partition(for_date date)
returns void
language plpgsql
as $$
declare
  part_start date := date_trunc('month', for_date)::date;
  part_end date := (date_trunc('month', for_date) + interval '1 month')::date;
  part_name text := 'measurements_' || to_char(part_start, 'YYYY_MM');
begin
  if not exists (
    select 1 from pg_class where relname = part_name
  ) then
    execute format(
      'create table public.%I partition of public.measurements for values from (%L) to (%L);',
      part_name, part_start, part_end
    );
    execute format(
      'create index %I on public.%I (tag_id, source_timestamp desc);',
      part_name || '_tag_ts_idx', part_name
    );
    execute format(
      'create index %I on public.%I (station_id, source_timestamp desc);',
      part_name || '_station_ts_idx', part_name
    );
  end if;
end;
$$;

-- Buat partisi untuk 2 bulan lalu, bulan ini, dan 3 bulan ke depan.
do $$
declare
  i integer;
begin
  for i in -2..3 loop
    perform public.create_measurements_partition((now() + (i || ' month')::interval)::date);
  end loop;
end $$;

-- Jaring pengaman: jika job pg_cron gagal membuat partisi bulan berikutnya,
-- data tetap tertampung di partisi default alih-alih INSERT ditolak.
create table if not exists public.measurements_default
  partition of public.measurements default;

-- Gateway mengirim ulang data dari buffer saat koneksi pulih; unique index ini
-- membuat pengiriman ulang idempoten (ON CONFLICT DO NOTHING di ingest).
create unique index if not exists uq_measurements_station_tag_ts
  on public.measurements (station_id, tag_id, source_timestamp);

-- ----------------------------------------------------------------------------
-- 5. TABEL: alarms
-- ----------------------------------------------------------------------------
create table if not exists public.alarms (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete cascade,
  tag_id text references public.tags(tag_id) on delete set null,
  alarm_type text not null
    check (alarm_type in ('high_high', 'high', 'low', 'low_low', 'comm_failure', 'data_stale', 'device_offline', 'system', 'manual')),
  priority text not null
    check (priority in ('critical', 'high', 'medium', 'low', 'info')),
  message text not null,
  device_id uuid references public.devices(id) on delete set null,
  value_at_alarm float8,
  threshold_value float8,
  status text not null default 'active'
    check (status in ('active', 'acknowledged', 'cleared', 'suppressed')),
  active_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  ack_comment text,
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id),
  duration_seconds integer,
  created_at timestamptz not null default now()
);

comment on table public.alarms is 'Alarm aktif dan riwayat alarm sistem';

-- Migration idempoten untuk database yang sudah dibuat dengan schema lama.
alter table public.alarms add column if not exists device_id uuid references public.devices(id) on delete set null;
do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.alarms'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%alarm_type%'
  limit 1;
  if v_constraint is not null then
    execute format('alter table public.alarms drop constraint %I', v_constraint);
  end if;
  alter table public.alarms add constraint alarms_alarm_type_check
    check (alarm_type in ('high_high', 'high', 'low', 'low_low', 'comm_failure', 'data_stale', 'device_offline', 'system', 'manual'));
exception when duplicate_object then
  null;
end $$;

-- ----------------------------------------------------------------------------
-- 6. TABEL: events (audit trail)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  event_type text not null
    check (event_type in ('login', 'logout', 'command', 'config_change', 'alarm_ack', 'alarm_clear', 'device_change', 'user_change', 'system', 'data_correction')),
  severity text not null default 'info'
    check (severity in ('critical', 'warning', 'info', 'debug')),
  message text not null,
  actor_id uuid references auth.users(id),
  actor_email text,
  actor_role text,
  device_id uuid references public.devices(id) on delete set null,
  tag_id text,
  old_value text,
  new_value text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.events is 'Audit trail seluruh aktivitas sistem dan operator';

-- ----------------------------------------------------------------------------
-- 8. TABEL: profiles (extend auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer'
    check (role in ('superadmin', 'admin', 'operator', 'technician', 'viewer')),
  station_access uuid[] not null default '{}',
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Profil pengguna, extend auth.users Supabase';

-- ----------------------------------------------------------------------------
-- 9. TABEL: monthly_reports
-- ----------------------------------------------------------------------------
create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete cascade,
  report_date date not null,
  total_energy_kwh float8,
  avg_power_kw float8,
  max_power_kw float8,
  min_power_kw float8,
  operational_hours float8,
  avg_water_level_m float8,
  max_water_level_m float8,
  min_water_level_m float8,
  avg_flow_rate_m3s float8,
  max_flow_rate_m3s float8,
  availability_percent float8,
  capacity_factor_percent float8,
  total_alarms integer,
  critical_alarms integer,
  data_quality_percent float8,
  notes text,
  created_by uuid references auth.users(id),
  is_auto_generated boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.monthly_reports is 'Laporan bulanan produksi dan performa stasiun';

-- ----------------------------------------------------------------------------
-- 10. TABEL: breakdown_reports
-- ----------------------------------------------------------------------------
create table if not exists public.breakdown_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete cascade,
  event_date date not null,
  outage_start timestamptz,
  outage_end timestamptz,
  duration_hours float8,
  load_at_outage_kw float8,
  energy_not_served_kwh float8,
  cause text not null,
  cause_category text
    check (cause_category in ('lightning', 'mechanical', 'electrical', 'communication', 'flood', 'maintenance', 'other')),
  affected_devices text[],
  corrective_action text,
  operator_name text,
  technician_name text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.breakdown_reports is 'Laporan gangguan/kerusakan (breakdown) stasiun';

-- ----------------------------------------------------------------------------
-- 11. INDEXES
-- ----------------------------------------------------------------------------
-- Index pada parent measurements akan diturunkan ke setiap partisi secara otomatis
-- (PostgreSQL 11+ mendukung index pada partitioned table).
create index if not exists idx_measurements_tag_ts on public.measurements (tag_id, source_timestamp desc);
create index if not exists idx_measurements_station_ts on public.measurements (station_id, source_timestamp desc);
create index if not exists idx_alarms_station_status_active on public.alarms (station_id, status, active_at desc);
create index if not exists idx_events_station_created on public.events (station_id, created_at desc);
create index if not exists idx_devices_station_status on public.devices (station_id, status);
create index if not exists idx_tags_station on public.tags (station_id);
create index if not exists idx_tags_device on public.tags (device_id);
create index if not exists idx_alarms_tag on public.alarms (tag_id);
create index if not exists idx_events_actor on public.events (actor_id);

-- ----------------------------------------------------------------------------
-- 12. VIEWS
-- ----------------------------------------------------------------------------
-- security_invoker = true: view dievaluasi dengan hak user pemanggil sehingga
-- RLS tabel dasar tetap berlaku. Tanpa opsi ini view berjalan sebagai owner
-- (postgres) dan dapat dibaca siapa pun yang memegang anon key.

-- latest_measurements: nilai terbaru setiap tag
create or replace view public.latest_measurements with (security_invoker = true) as
select distinct on (m.station_id, m.tag_id)
  m.tag_id,
  m.station_id,
  m.value,
  m.quality,
  m.source_timestamp,
  m.received_timestamp,
  t.name as tag_name,
  t.unit,
  t.display_precision,
  t.alarm_high,
  t.alarm_high_high,
  t.alarm_low,
  t.alarm_low_low
from public.measurements m
join public.tags t on t.tag_id = m.tag_id
order by m.station_id, m.tag_id, m.source_timestamp desc, m.received_timestamp desc;

comment on view public.latest_measurements is 'Nilai terbaru untuk setiap tag';

-- active_alarms_view: alarm aktif/acknowledged + info stasiun & tag
-- Drop diperlukan karena device_id ditambahkan ke projection view; PostgreSQL
-- tidak mengizinkan CREATE OR REPLACE mengubah urutan/kolom view.
drop view if exists public.active_alarms_view;
create or replace view public.active_alarms_view with (security_invoker = true) as
select
  a.id,
  a.station_id,
  s.name as station_name,
  a.tag_id,
  a.device_id,
  t.name as tag_name,
  t.unit,
  a.alarm_type,
  a.priority,
  a.message,
  a.value_at_alarm,
  a.threshold_value,
  a.status,
  a.active_at,
  a.acknowledged_at,
  a.acknowledged_by,
  a.ack_comment,
  extract(epoch from (now() - a.active_at))::integer as duration_seconds_live
from public.alarms a
left join public.stations s on s.id = a.station_id
left join public.tags t on t.tag_id = a.tag_id
where a.status in ('active', 'acknowledged')
order by
  case a.priority
    when 'critical' then 1
    when 'high' then 2
    when 'medium' then 3
    when 'low' then 4
    else 5
  end,
  a.active_at desc;

comment on view public.active_alarms_view is 'Alarm aktif dan acknowledged beserta info stasiun & tag';

-- device_health_view: status device + menit sejak last_seen + is_online
create or replace view public.device_health_view with (security_invoker = true) as
select
  d.id,
  d.station_id,
  d.name,
  d.device_type,
  d.protocol,
  d.status,
  d.last_seen,
  d.enabled,
  d.scan_interval_sec,
  d.firmware_version,
  case
    when d.last_seen is null then null
    else round(extract(epoch from (now() - d.last_seen)) / 60.0, 1)
  end as minutes_since_last_seen,
  case
    when d.last_seen is null then false
    when d.enabled and d.status = 'online'
      and extract(epoch from (now() - d.last_seen)) <= greatest(d.scan_interval_sec * 3, 30) then true
    else false
  end as is_online
from public.devices d;

comment on view public.device_health_view is 'Status kesehatan semua device dengan indikator online/offline';

-- daily_energy_summary: agregat harian untuk tag daya (POWER.ACTIVE_POWER / ENERGY_KWH)
create or replace view public.daily_energy_summary with (security_invoker = true) as
select
  m.station_id,
  date_trunc('day', m.source_timestamp)::date as day,
  avg(m.value) filter (where m.tag_id = 'POWER.ACTIVE_POWER') as avg_power_kw,
  max(m.value) filter (where m.tag_id = 'POWER.ACTIVE_POWER') as max_power_kw,
  min(m.value) filter (where m.tag_id = 'POWER.ACTIVE_POWER') as min_power_kw,
  max(m.value) filter (where m.tag_id = 'POWER.ENERGY_KWH') - min(m.value) filter (where m.tag_id = 'POWER.ENERGY_KWH') as total_energy_kwh,
  count(*) filter (where m.tag_id = 'POWER.ACTIVE_POWER') as sample_count
from public.measurements m
where m.tag_id in ('POWER.ACTIVE_POWER', 'POWER.ENERGY_KWH')
group by m.station_id, date_trunc('day', m.source_timestamp)::date
order by day desc;

comment on view public.daily_energy_summary is 'Agregat harian data daya listrik per stasiun';

-- ----------------------------------------------------------------------------
-- 13. FUNCTIONS
-- ----------------------------------------------------------------------------

-- get_station_kpi: ringkasan KPI terkini satu stasiun dalam JSON
create or replace function public.get_station_kpi(p_station_id uuid, p_period_hours integer default 24)
returns json
language plpgsql
stable
as $$
declare
  result json;
begin
  select json_build_object(
    'water_level', (select value from public.latest_measurements where station_id = p_station_id and tag_id = 'HYDRO.WATER_LEVEL'),
    'velocity', (select value from public.latest_measurements where station_id = p_station_id and tag_id = 'HYDRO.VELOCITY'),
    'flow_rate', (select value from public.latest_measurements where station_id = p_station_id and tag_id = 'HYDRO.FLOW_RATE'),
    'active_power', (select value from public.latest_measurements where station_id = p_station_id and tag_id = 'POWER.ACTIVE_POWER'),
    'turbine_rpm', (select value from public.latest_measurements where station_id = p_station_id and tag_id = 'TURBINE.RPM'),
    'daily_energy', (
      select coalesce(max(value) - min(value), 0)
      from public.measurements
      where station_id = p_station_id
        and tag_id = 'POWER.ENERGY_KWH'
        and source_timestamp >= date_trunc('day', now())
    ),
    'active_alarms', (
      select json_build_object(
        'total', count(*),
        'critical', count(*) filter (where priority = 'critical'),
        'high', count(*) filter (where priority = 'high'),
        'medium', count(*) filter (where priority = 'medium'),
        'low', count(*) filter (where priority = 'low')
      )
      from public.alarms
      where station_id = p_station_id and status in ('active', 'acknowledged')
    ),
    'device_status_summary', (
      select json_build_object(
        'total', count(*),
        'online', count(*) filter (where is_online),
        'offline', count(*) filter (where not is_online)
      )
      from public.device_health_view
      where station_id = p_station_id
    ),
    'period_hours', p_period_hours,
    'generated_at', now()
  ) into result;

  return result;
end;
$$;

comment on function public.get_station_kpi is 'Mengembalikan ringkasan KPI terkini satu stasiun dalam JSON';

-- get_trend_data: time-bucket agregasi nilai sensor
create or replace function public.get_trend_data(
  p_tag_id text,
  p_from_ts timestamptz,
  p_to_ts timestamptz,
  p_interval_minutes integer default 5
)
returns table (
  bucket timestamptz,
  avg_value float8,
  min_value float8,
  max_value float8,
  sample_count bigint
)
language sql
stable
as $$
  select
    to_timestamp(floor(extract(epoch from m.source_timestamp) / (p_interval_minutes * 60)) * (p_interval_minutes * 60)) as bucket,
    avg(m.value) as avg_value,
    min(m.value) as min_value,
    max(m.value) as max_value,
    count(*) as sample_count
  from public.measurements m
  where m.tag_id = p_tag_id
    and m.source_timestamp >= p_from_ts
    and m.source_timestamp <= p_to_ts
    and m.quality = 'good'
  group by bucket
  order by bucket asc;
$$;

comment on function public.get_trend_data is 'Agregasi time-bucket nilai sensor untuk grafik trend';

-- get_alarm_statistics: jumlah alarm per prioritas, tipe, dan hari
create or replace function public.get_alarm_statistics(p_station_id uuid, p_days integer default 30)
returns json
language plpgsql
stable
as $$
declare
  result json;
begin
  select json_build_object(
    'by_priority', (
      select json_object_agg(priority, cnt) from (
        select priority, count(*) as cnt
        from public.alarms
        where station_id = p_station_id
          and active_at >= now() - (p_days || ' days')::interval
        group by priority
      ) s
    ),
    'by_type', (
      select json_object_agg(alarm_type, cnt) from (
        select alarm_type, count(*) as cnt
        from public.alarms
        where station_id = p_station_id
          and active_at >= now() - (p_days || ' days')::interval
        group by alarm_type
      ) s
    ),
    'by_day', (
      select json_agg(row_to_json(s)) from (
        select date_trunc('day', active_at)::date as day, count(*) as cnt
        from public.alarms
        where station_id = p_station_id
          and active_at >= now() - (p_days || ' days')::interval
        group by date_trunc('day', active_at)::date
        order by day asc
      ) s
    ),
    'avg_resolve_seconds_by_priority', (
      select json_object_agg(priority, avg_sec) from (
        select priority, round(avg(extract(epoch from (cleared_at - active_at)))) as avg_sec
        from public.alarms
        where station_id = p_station_id
          and active_at >= now() - (p_days || ' days')::interval
          and cleared_at is not null
        group by priority
      ) s
    ),
    'total_alarms', (
      select count(*) from public.alarms
      where station_id = p_station_id
        and active_at >= now() - (p_days || ' days')::interval
    )
  ) into result;

  return result;
end;
$$;

comment on function public.get_alarm_statistics is 'Statistik alarm per prioritas, tipe, dan hari';

-- acknowledge_alarm: update status alarm + catat event
create or replace function public.acknowledge_alarm(p_alarm_id uuid, p_comment text default null)
returns public.alarms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alarm public.alarms;
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception 'Autentikasi diperlukan';
  end if;
  if not public.has_min_role('technician') then
    raise exception 'Role tidak memiliki izin acknowledge alarm';
  end if;

  select email into v_actor_email from auth.users where id = v_actor_id;
  select role into v_actor_role from public.profiles where id = v_actor_id;

  if not exists (
    select 1 from public.alarms a
    where a.id = p_alarm_id and public.current_user_can_access_station(a.station_id)
  ) then
    raise exception 'Alarm tidak ditemukan atau stasiun tidak dapat diakses';
  end if;

  update public.alarms
  set status = 'acknowledged',
      acknowledged_at = now(),
      acknowledged_by = v_actor_id,
      ack_comment = p_comment
  where id = p_alarm_id and status = 'active'
  returning * into v_alarm;

  if v_alarm.id is null then
    raise exception 'Alarm tidak ditemukan atau sudah tidak aktif';
  end if;

  insert into public.events (
    station_id, event_type, severity, message, actor_id, actor_email, actor_role, tag_id, metadata
  ) values (
    v_alarm.station_id, 'alarm_ack', 'info',
    format('Alarm diakui: %s', v_alarm.message),
    v_actor_id, v_actor_email, v_actor_role, v_alarm.tag_id,
    jsonb_build_object('alarm_id', v_alarm.id, 'comment', p_comment)
  );

  return v_alarm;
end;
$$;

comment on function public.acknowledge_alarm is 'Mengakui (acknowledge) alarm aktif dan mencatat event terkait';

-- ingest_telemetry: satu-satunya jalur masuk data lapangan ke database.
-- Dipanggil oleh service ingest (subscriber MQTT) dengan service_role key.
-- Payload dibuat gateway PC dari hasil pembacaan register PLC:
-- {
--   "station_id": "uuid",
--   "gateway_id": "uuid",              -- device gateway pengirim (opsional)
--   "ts": "2026-11-05T10:00:00Z",       -- waktu baca PLC menurut jam gateway (NTP)
--   "seq": 123,                         -- nomor urut pesan (opsional)
--   "values": [
--     {"tag": "HYDRO.WATER_LEVEL", "value": 1.234, "quality": "good", "raw": "1234"}
--   ]
-- }
-- Nilai per tag divalidasi satu per satu; tag yang gagal validasi ditolak
-- tanpa membatalkan tag lain dalam payload yang sama.
create or replace function public.ingest_telemetry(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station_id uuid;
  v_gateway_id uuid;
  v_ts timestamptz;
  v_seq bigint;
  v_item jsonb;
  v_tag record;
  v_quality text;
  v_value float8;
  v_rows integer;
  v_accepted integer := 0;
  v_duplicate integer := 0;
  v_rejected jsonb := '[]'::jsonb;
begin
  begin
    v_station_id := (p_payload->>'station_id')::uuid;
    v_gateway_id := nullif(p_payload->>'gateway_id', '')::uuid;
    v_ts := (p_payload->>'ts')::timestamptz;
    v_seq := nullif(p_payload->>'seq', '')::bigint;
  exception when others then
    raise exception 'Payload tidak valid: %', sqlerrm;
  end;

  if v_station_id is null or v_ts is null then
    raise exception 'station_id dan ts wajib diisi';
  end if;
  if not exists (select 1 from public.stations where id = v_station_id) then
    raise exception 'Stasiun % tidak dikenal', v_station_id;
  end if;
  if v_ts > now() + interval '5 minutes' then
    raise exception 'Timestamp % berada di masa depan, periksa sinkronisasi NTP gateway', v_ts;
  end if;
  if jsonb_typeof(p_payload->'values') is distinct from 'array' then
    raise exception 'Field values harus berupa array';
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'values') loop
    select t.tag_id, t.device_id, t.enabled into v_tag
    from public.tags t
    where t.tag_id = v_item->>'tag' and t.station_id = v_station_id;

    if not found then
      v_rejected := v_rejected || jsonb_build_object('tag', v_item->>'tag', 'reason', 'tag tidak terdaftar pada stasiun');
      continue;
    end if;
    if not v_tag.enabled then
      v_rejected := v_rejected || jsonb_build_object('tag', v_item->>'tag', 'reason', 'tag nonaktif');
      continue;
    end if;

    v_quality := coalesce(v_item->>'quality', 'good');
    if v_quality not in ('good', 'bad', 'uncertain', 'stale', 'comm_failure') then
      v_rejected := v_rejected || jsonb_build_object('tag', v_item->>'tag', 'reason', 'quality tidak valid');
      continue;
    end if;

    case jsonb_typeof(v_item->'value')
      when 'number' then
        v_value := (v_item->>'value')::float8;
      when 'boolean' then
        v_value := case when (v_item->>'value')::boolean then 1 else 0 end;
      when 'null' then
        -- Sensor tidak terbaca: simpan sebagai kualitas buruk agar celah data terlihat.
        v_value := null;
        if v_quality = 'good' then v_quality := 'bad'; end if;
      else
        if v_item ? 'value' then
          v_rejected := v_rejected || jsonb_build_object('tag', v_item->>'tag', 'reason', 'value harus berupa angka');
          continue;
        end if;
        v_value := null;
        if v_quality = 'good' then v_quality := 'bad'; end if;
    end case;

    insert into public.measurements (tag_id, station_id, value, quality, source_timestamp, sequence_id, raw_value)
    values (v_tag.tag_id, v_station_id, v_value, v_quality, v_ts, v_seq, v_item->>'raw')
    on conflict (station_id, tag_id, source_timestamp) do nothing;
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      v_duplicate := v_duplicate + 1;
      continue;
    end if;
    v_accepted := v_accepted + 1;

    -- Perangkat pemilik tag dianggap hidup selama masih mengirim nilai GOOD.
    if v_quality = 'good' and v_tag.device_id is not null then
      update public.devices
      set last_seen = greatest(coalesce(last_seen, v_ts), v_ts),
          status = case when status in ('offline', 'error') then 'online' else status end
      where id = v_tag.device_id;
    end if;
  end loop;

  if v_gateway_id is not null then
    update public.devices
    set last_seen = now(),
        status = case when status in ('offline', 'error') then 'online' else status end
    where id = v_gateway_id and station_id = v_station_id;
  end if;

  return jsonb_build_object(
    'accepted', v_accepted,
    'duplicate', v_duplicate,
    'rejected', v_rejected
  );
end;
$$;

comment on function public.ingest_telemetry is 'Validasi dan simpan telemetry dari gateway; hanya untuk service_role';

-- ----------------------------------------------------------------------------
-- 14. TRIGGER FUNCTIONS
-- ----------------------------------------------------------------------------

-- 14.1 Auto-update updated_at
create or replace function public.trg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_stations on public.stations;
create trigger set_updated_at_stations
  before update on public.stations
  for each row execute function public.trg_set_updated_at();

drop trigger if exists set_updated_at_devices on public.devices;
create trigger set_updated_at_devices
  before update on public.devices
  for each row execute function public.trg_set_updated_at();

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute function public.trg_set_updated_at();

-- 14.2 Threshold check pada INSERT measurements -> buat alarm otomatis.
-- Deadband dipakai saat CLEAR, bukan saat ACTIVATE: alarm high baru aktif pada
-- threshold asli, tetapi baru clear setelah nilai turun threshold - deadband.
create or replace function public.trg_check_measurement_threshold()
returns trigger
language plpgsql
as $$
declare
  v_tag public.tags;
  v_alarm record;
  v_priority text;
  v_type text;
  v_threshold float8;
  v_hold boolean := false;
  v_existing boolean := false;
  v_recovered boolean;
  v_rank integer;
  v_existing_rank integer;
begin
  select * into v_tag
  from public.tags
  where tag_id = new.tag_id and station_id = new.station_id;

  if v_tag.id is null or new.value is null then
    return new;
  end if;

  -- Quality buruk/stale tidak boleh mengubah state threshold. Alarm stale
  -- dibuat oleh run_alarm_engine karena freshness hanya diketahui terhadap now().
  if new.quality <> 'good' then
    return new;
  end if;

  -- Tentukan pelanggaran dengan prioritas tertinggi (aktivasi tanpa deadband).
  if v_tag.alarm_high_high is not null and new.value >= v_tag.alarm_high_high then
    v_type := 'high_high'; v_priority := 'critical'; v_threshold := v_tag.alarm_high_high; v_rank := 2;
  elsif v_tag.alarm_low_low is not null and new.value <= v_tag.alarm_low_low then
    v_type := 'low_low'; v_priority := 'critical'; v_threshold := v_tag.alarm_low_low; v_rank := 2;
  elsif v_tag.alarm_high is not null and new.value >= v_tag.alarm_high then
    v_type := 'high'; v_priority := 'high'; v_threshold := v_tag.alarm_high; v_rank := 1;
  elsif v_tag.alarm_low is not null and new.value <= v_tag.alarm_low then
    v_type := 'low'; v_priority := 'high'; v_threshold := v_tag.alarm_low; v_rank := 1;
  end if;

  -- Pertahankan alarm sampai recovery threshold (hysteresis). Alarm level
  -- lebih tinggi yang belum pulih menahan alarm level yang lebih rendah.
  for v_alarm in
    select id, alarm_type from public.alarms
    where station_id = new.station_id and tag_id = new.tag_id
      and alarm_type in ('high_high', 'high', 'low', 'low_low')
      and status in ('active', 'acknowledged')
  loop
    v_recovered := case v_alarm.alarm_type
      when 'high_high' then v_tag.alarm_high_high is null or new.value < v_tag.alarm_high_high - coalesce(v_tag.deadband, 0)
      when 'high' then v_tag.alarm_high is null or new.value < v_tag.alarm_high - coalesce(v_tag.deadband, 0)
      when 'low_low' then v_tag.alarm_low_low is null or new.value > v_tag.alarm_low_low + coalesce(v_tag.deadband, 0)
      when 'low' then v_tag.alarm_low is null or new.value > v_tag.alarm_low + coalesce(v_tag.deadband, 0)
      else true
    end;
    v_existing_rank := case when v_alarm.alarm_type in ('high_high', 'low_low') then 2 else 1 end;

    if v_alarm.alarm_type = v_type then
      if v_recovered then
        update public.alarms
        set status = 'cleared', cleared_at = now(),
            duration_seconds = extract(epoch from (now() - active_at))::integer
        where id = v_alarm.id;
      else
        v_existing := true;
        v_hold := true;
      end if;
    elsif not v_recovered and (v_type is null or v_existing_rank > v_rank) then
      v_hold := true;
    elsif v_recovered or (v_type is not null and v_rank > v_existing_rank) then
      update public.alarms
      set status = 'cleared', cleared_at = now(),
          duration_seconds = extract(epoch from (now() - active_at))::integer
      where id = v_alarm.id;
    end if;
  end loop;

  if v_hold or v_existing or v_type is null then
    return new;
  end if;

  insert into public.alarms (
    station_id, tag_id, alarm_type, priority, message, value_at_alarm, threshold_value
  ) values (
    new.station_id, new.tag_id, v_type, v_priority,
    format('%s %s: nilai %s melewati batas %s (%s)', v_tag.name, v_type, new.value, v_threshold, v_tag.unit),
    new.value, v_threshold
  );

  return new;
end;
$$;

drop trigger if exists check_measurement_threshold on public.measurements;
create trigger check_measurement_threshold
  after insert on public.measurements
  for each row execute function public.trg_check_measurement_threshold();

-- 14.3 Evaluator terjadwal untuk kondisi yang tidak bisa dideteksi hanya dari
-- INSERT measurement: data stale dan device offline. Frontend/cron memanggil
-- fungsi ini berkala; advisory lock membuat dua evaluator tidak menggandakan alarm.
create or replace function public.run_alarm_engine(p_station_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag record;
  v_device record;
  v_latest record;
  v_existing_id uuid;
  v_scan_seconds integer;
  v_stale_after integer;
  v_is_stale boolean;
  v_has_latest boolean;
  v_is_offline boolean;
  v_created integer := 0;
  v_cleared integer := 0;
begin
  -- auth.role() membaca claim JWT (PostgREST) maupun setting yang diisi
  -- run_alarm_engine_all_stations saat dipanggil pg_cron.
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Autentikasi diperlukan';
  end if;
  if auth.uid() is not null and not public.current_user_can_access_station(p_station_id) then
    raise exception 'Stasiun tidak dapat diakses';
  end if;

  perform pg_advisory_xact_lock(hashtext('river-flow-alarm-engine:' || p_station_id::text));

  -- Satu data-stale alarm per tag. Device maintenance/nonaktif tidak dipaksa
  -- menghasilkan alarm telemetry karena memang sengaja tidak dipolling.
  for v_tag in
    select t.tag_id, t.name, t.unit, t.device_id
    from public.tags t
    left join public.devices d on d.id = t.device_id
    where t.station_id = p_station_id and t.enabled
      and (d.id is null or d.enabled)
  loop
    select m.quality, m.source_timestamp
      into v_latest
    from public.measurements m
    where m.station_id = p_station_id and m.tag_id = v_tag.tag_id
    order by m.source_timestamp desc, m.received_timestamp desc
    limit 1;

    v_has_latest := found;

    select greatest(coalesce(d.scan_interval_sec, 10) * 3, 30)
      into v_stale_after
    from public.devices d
    where d.id = v_tag.device_id;
    v_stale_after := coalesce(v_stale_after, 60);

    v_is_stale := not v_has_latest
      or v_latest.source_timestamp is null
      or v_latest.quality <> 'good'
      or extract(epoch from (now() - v_latest.source_timestamp)) > v_stale_after;

    select id into v_existing_id
    from public.alarms
    where station_id = p_station_id and tag_id = v_tag.tag_id
      and alarm_type = 'data_stale' and status in ('active', 'acknowledged')
    limit 1;

    if v_is_stale and v_existing_id is null then
      insert into public.alarms (
        station_id, tag_id, alarm_type, priority, message, threshold_value
      ) values (
        p_station_id, v_tag.tag_id, 'data_stale', 'high',
        format('%s stale: tidak ada telemetry GOOD dalam %s detik terakhir', v_tag.name, v_stale_after),
        v_stale_after
      );
      v_created := v_created + 1;
    elsif not v_is_stale and v_existing_id is not null then
      update public.alarms
      set status = 'cleared', cleared_at = now(),
          duration_seconds = extract(epoch from (now() - active_at))::integer
      where id = v_existing_id;
      v_cleared := v_cleared + 1;
    end if;
  end loop;

  -- Device offline ditentukan dari status dan last_seen, bukan dari koneksi
  -- browser. Maintenance/nonaktif dikecualikan agar tidak menimbulkan noise.
  for v_device in
    select d.id, d.name, d.status, d.last_seen, d.scan_interval_sec
    from public.devices d
    where d.station_id = p_station_id and d.enabled and d.status <> 'maintenance'
  loop
    v_is_offline := v_device.status in ('offline', 'error')
      or v_device.last_seen is null
      or extract(epoch from (now() - v_device.last_seen)) > greatest(v_device.scan_interval_sec * 3, 30);

    select id into v_existing_id
    from public.alarms
    where station_id = p_station_id and device_id = v_device.id
      and alarm_type = 'device_offline' and status in ('active', 'acknowledged')
    limit 1;

    if v_is_offline and v_existing_id is null then
      insert into public.alarms (
        station_id, device_id, alarm_type, priority, message
      ) values (
        p_station_id, v_device.id, 'device_offline', 'high',
        format('Device %s offline (%s)', v_device.name, v_device.status)
      );
      v_created := v_created + 1;
    elsif not v_is_offline and v_existing_id is not null then
      update public.alarms
      set status = 'cleared', cleared_at = now(),
          duration_seconds = extract(epoch from (now() - active_at))::integer
      where id = v_existing_id;
      v_cleared := v_cleared + 1;
    end if;
  end loop;

  return jsonb_build_object('station_id', p_station_id, 'created', v_created, 'cleared', v_cleared, 'evaluated_at', now());
end;
$$;

comment on function public.run_alarm_engine is 'Evaluasi hysteresis-independent untuk data stale dan device offline';
grant execute on function public.run_alarm_engine(uuid) to authenticated;

-- Dipakai oleh scheduler (pg_cron/worker service_role) agar offline detection
-- tetap berjalan walaupun tidak ada dashboard yang sedang terbuka.
create or replace function public.run_alarm_engine_all_stations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station record;
  v_count integer := 0;
begin
  -- pg_cron/worker memanggil fungsi ini tanpa JWT user; tandai konteks
  -- internal sebelum memanggil evaluator yang juga dapat dipanggil frontend.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  for v_station in select id from public.stations where status <> 'inactive' loop
    perform public.run_alarm_engine(v_station.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.run_alarm_engine_all_stations is 'Jalankan alarm engine untuk semua stasiun aktif; panggil tiap 15 detik dari scheduler tepercaya';
revoke all on function public.run_alarm_engine_all_stations() from public;
grant execute on function public.run_alarm_engine_all_stations() to service_role;

-- Contoh jadwal (aktifkan hanya jika pg_cron tersedia di project):
-- select cron.schedule('river-flow-alarm-engine', '*/1 * * * *',
--   $$select public.run_alarm_engine_all_stations()$$);

-- 14.4 Audit UPDATE profiles -> catat di events
-- security definer: role authenticated tidak punya akses baca ke auth.users,
-- sehingga tanpa ini setiap UPDATE profiles (termasuk last_login) gagal.
create or replace function public.trg_audit_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
begin
  if old.role is distinct from new.role
     or old.is_active is distinct from new.is_active
     or old.station_access is distinct from new.station_access then
    select email into v_actor_email from auth.users where id = auth.uid();

    insert into public.events (
      event_type, severity, message, actor_id, actor_email, old_value, new_value, metadata
    ) values (
      'user_change', 'warning',
      format('Profil %s diubah', new.id),
      auth.uid(), v_actor_email,
      format('role=%s,active=%s', old.role, old.is_active),
      format('role=%s,active=%s', new.role, new.is_active),
      jsonb_build_object('profile_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_profile_update on public.profiles;
create trigger audit_profile_update
  after update on public.profiles
  for each row execute function public.trg_audit_profile_update();

-- 14.4b Lindungi kolom hak akses. Policy profiles_update mengizinkan user
-- mengubah barisnya sendiri (nama, telepon, last_login); tanpa trigger ini
-- user juga bisa menaikkan role-nya sendiri menjadi superadmin.
create or replace function public.trg_protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service_role tidak membawa JWT user: dianggap administrasi.
  if auth.uid() is null then
    return new;
  end if;

  if (new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.station_access is distinct from old.station_access
      or new.is_active is distinct from old.is_active)
     and not public.has_min_role('superadmin') then
    raise exception 'Hanya superadmin yang dapat mengubah role, akses stasiun, atau status akun';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.trg_protect_profile_privileges();

-- 14.4c Setiap user Auth baru otomatis mendapat profile 'viewer' tanpa akses
-- stasiun. Superadmin yang memberi role dan station_access setelahnya.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 14.5 Audit UPDATE device status -> catat di events
create or replace function public.trg_audit_device_status()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    insert into public.events (
      station_id, event_type, severity, message, device_id, old_value, new_value, metadata
    ) values (
      new.station_id, 'device_change',
      case when new.status in ('offline', 'error') then 'critical' else 'info' end,
      format('Status device %s berubah dari %s ke %s', new.name, old.status, new.status),
      new.id, old.status, new.status,
      jsonb_build_object('device_id', new.id)
    );

    -- Buat satu alarm device_offline per device. Evaluasi last_seen dilakukan
    -- oleh run_alarm_engine; trigger ini hanya mempercepat transisi eksplisit.
    if new.status in ('offline', 'error') then
      if not exists (
        select 1 from public.alarms
        where station_id = new.station_id and device_id = new.id
          and alarm_type = 'device_offline' and status in ('active', 'acknowledged')
      ) then
        insert into public.alarms (
          station_id, device_id, alarm_type, priority, message
        ) values (
          new.station_id, new.id, 'device_offline', 'high',
          format('Device %s menjadi %s', new.name, new.status)
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_device_status on public.devices;
create trigger audit_device_status
  after update on public.devices
  for each row execute function public.trg_audit_device_status();

-- ----------------------------------------------------------------------------
-- 15. RLS HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
-- security definer agar tidak terjadi recursive RLS saat membaca profiles sendiri.

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  -- Akun nonaktif diperlakukan seperti tidak punya role sama sekali.
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.has_min_role(p_min_role text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.current_user_role() is null then false
    else (
      array_position(
        array['viewer', 'technician', 'operator', 'admin', 'superadmin'],
        public.current_user_role()
      ) >= array_position(
        array['viewer', 'technician', 'operator', 'admin', 'superadmin'],
        p_min_role
      )
    )
  end;
$$;

create or replace function public.current_user_can_access_station(p_station_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_station_id is not null and auth.uid() is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
      and (p.role = 'superadmin' or p_station_id = any(p.station_access))
  );
$$;

comment on function public.has_min_role is 'Cek apakah role user saat ini >= role minimum (hierarchy: viewer<technician<operator<admin<superadmin)';

-- ----------------------------------------------------------------------------
-- 16. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.stations enable row level security;
alter table public.devices enable row level security;
alter table public.tags enable row level security;
alter table public.measurements enable row level security;
alter table public.alarms enable row level security;
alter table public.events enable row level security;
alter table public.profiles enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.breakdown_reports enable row level security;

-- ---- stations ----
drop policy if exists stations_select on public.stations;
create policy stations_select on public.stations
  for select to authenticated using (public.current_user_can_access_station(id));

drop policy if exists stations_insert on public.stations;
create policy stations_insert on public.stations
  for insert to authenticated with check (public.has_min_role('admin'));

drop policy if exists stations_update on public.stations;
create policy stations_update on public.stations
  for update to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(id));

drop policy if exists stations_delete on public.stations;
create policy stations_delete on public.stations
  for delete to authenticated using (public.has_min_role('superadmin') and public.current_user_can_access_station(id));

-- ---- devices ----
drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists devices_cud on public.devices;
drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices
  for insert to authenticated with check (public.has_min_role('admin') and public.current_user_can_access_station(station_id));
drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices
  for update to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(station_id));
drop policy if exists devices_delete on public.devices;
create policy devices_delete on public.devices
  for delete to authenticated using (public.has_min_role('superadmin') and public.current_user_can_access_station(station_id));

-- ---- tags ----
drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists tags_insert on public.tags;
create policy tags_insert on public.tags
  for insert to authenticated with check (public.has_min_role('admin') and public.current_user_can_access_station(station_id));
drop policy if exists tags_update on public.tags;
create policy tags_update on public.tags
  for update to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(station_id));
drop policy if exists tags_delete on public.tags;
create policy tags_delete on public.tags
  for delete to authenticated using (public.has_min_role('superadmin'));

-- ---- measurements ----
drop policy if exists measurements_select on public.measurements;
create policy measurements_select on public.measurements
  for select to authenticated using (public.current_user_can_access_station(station_id));

-- Data lapangan masuk lewat ingest_telemetry (service_role). Insert dari
-- browser hanya untuk koreksi data manual oleh admin.
drop policy if exists measurements_insert on public.measurements;
create policy measurements_insert on public.measurements
  for insert to authenticated with check (public.has_min_role('admin') and public.current_user_can_access_station(station_id));

drop policy if exists measurements_update on public.measurements;
create policy measurements_update on public.measurements
  for update to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(station_id));

drop policy if exists measurements_delete on public.measurements;
create policy measurements_delete on public.measurements
  for delete to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(station_id));

-- ---- alarms ----
drop policy if exists alarms_select on public.alarms;
create policy alarms_select on public.alarms
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists alarms_insert on public.alarms;
create policy alarms_insert on public.alarms
  for insert to authenticated with check (public.has_min_role('operator') and public.current_user_can_access_station(station_id));

drop policy if exists alarms_update on public.alarms;
create policy alarms_update on public.alarms
  for update to authenticated using (public.has_min_role('technician') and public.current_user_can_access_station(station_id));

drop policy if exists alarms_delete on public.alarms;
create policy alarms_delete on public.alarms
  for delete to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(station_id));

-- ---- events ----
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated with check (
    (station_id is null and actor_id = auth.uid())
    or (public.has_min_role('operator') and public.current_user_can_access_station(station_id))
  );

-- Events bersifat immutable: tidak ada policy update/delete untuk authenticated
-- (hanya service_role via bypass RLS yang dapat melakukannya jika benar-benar perlu).

-- ---- profiles ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.has_min_role('admin'));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_min_role('superadmin'));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.has_min_role('superadmin'));
-- Profile user biasa dibuat otomatis oleh trigger on_auth_user_created.

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated using (public.has_min_role('superadmin'));

-- ---- monthly_reports ----
drop policy if exists monthly_reports_select on public.monthly_reports;
create policy monthly_reports_select on public.monthly_reports
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists monthly_reports_insert on public.monthly_reports;
create policy monthly_reports_insert on public.monthly_reports
  for insert to authenticated with check (public.has_min_role('operator') and public.current_user_can_access_station(station_id));
drop policy if exists monthly_reports_update on public.monthly_reports;
create policy monthly_reports_update on public.monthly_reports
  for update to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(station_id));
drop policy if exists monthly_reports_delete on public.monthly_reports;
create policy monthly_reports_delete on public.monthly_reports
  for delete to authenticated using (public.has_min_role('superadmin') and public.current_user_can_access_station(station_id));

-- ---- breakdown_reports ----
drop policy if exists breakdown_reports_select on public.breakdown_reports;
create policy breakdown_reports_select on public.breakdown_reports
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists breakdown_reports_insert on public.breakdown_reports;
create policy breakdown_reports_insert on public.breakdown_reports
  for insert to authenticated with check (public.has_min_role('operator') and public.current_user_can_access_station(station_id));
drop policy if exists breakdown_reports_update on public.breakdown_reports;
create policy breakdown_reports_update on public.breakdown_reports
  for update to authenticated using (public.has_min_role('admin') and public.current_user_can_access_station(station_id));
drop policy if exists breakdown_reports_delete on public.breakdown_reports;
create policy breakdown_reports_delete on public.breakdown_reports
  for delete to authenticated using (public.has_min_role('superadmin') and public.current_user_can_access_station(station_id));

-- ----------------------------------------------------------------------------
-- 17. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
-- Aktifkan replication untuk tabel yang perlu dipantau real-time di frontend.
-- measurements dipartisi; tanpa publish_via_partition_root perubahan dikirim
-- atas nama partisi (measurements_2026_11) sehingga subscriber tabel
-- 'measurements' di frontend tidak pernah menerima event.
alter publication supabase_realtime set (publish_via_partition_root = true);

do $$
declare
  t text;
begin
  foreach t in array array['measurements', 'alarms', 'devices'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 18. HAK EKSEKUSI FUNCTION
-- ----------------------------------------------------------------------------
-- PostgreSQL memberi EXECUTE ke PUBLIC secara default, dan Supabase juga ke
-- anon. Cabut semuanya, lalu beri hak secara eksplisit per peran.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Dipakai policy RLS dan halaman web (user login).
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.has_min_role(text) to authenticated;
grant execute on function public.current_user_can_access_station(uuid) to authenticated;
grant execute on function public.get_station_kpi(uuid, integer) to authenticated;
grant execute on function public.get_trend_data(text, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.get_alarm_statistics(uuid, integer) to authenticated;
grant execute on function public.acknowledge_alarm(uuid, text) to authenticated;
grant execute on function public.run_alarm_engine(uuid) to authenticated;

-- Hanya service tepercaya (service ingest, scheduler).
revoke execute on function public.ingest_telemetry(jsonb) from authenticated;
revoke execute on function public.run_alarm_engine_all_stations() from authenticated;
grant execute on function public.ingest_telemetry(jsonb) to service_role;
grant execute on function public.run_alarm_engine_all_stations() to service_role;

-- ----------------------------------------------------------------------------
-- 19. JADWAL OTOMATIS (pg_cron)
-- ----------------------------------------------------------------------------
-- Alarm data stale / device offline harus tetap dievaluasi walaupun tidak ada
-- dashboard yang terbuka, dan partisi bulan depan harus sudah ada sebelum
-- data bulan depan masuk. Jika pg_cron tidak tersedia, aktifkan lewat
-- Dashboard > Integrations > Cron lalu jalankan ulang blok ini.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron tidak dapat diaktifkan otomatis: %', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'rfg-alarm-engine',
      '* * * * *',
      $cron$select public.run_alarm_engine_all_stations()$cron$
    );
    perform cron.schedule(
      'rfg-measurement-partitions',
      '0 1 * * *',
      $cron$
        select public.create_measurements_partition((date_trunc('month', now()) + interval '1 month')::date);
        select public.create_measurements_partition((date_trunc('month', now()) + interval '2 month')::date);
      $cron$
    );
  else
    raise notice 'pg_cron belum aktif: alarm engine hanya berjalan saat dashboard dibuka.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- SELESAI
-- ----------------------------------------------------------------------------
-- Catatan setelah menjalankan schema:
-- 1. Jalankan supabase-seed.sql untuk membuat stasiun, perangkat, dan tag.
-- 2. Matikan pendaftaran publik: Authentication > Sign In / Providers >
--    nonaktifkan "Allow new users to sign up". Akun dibuat oleh admin.
-- 3. Buat user pertama di Authentication > Users > Add user, lalu jadikan
--    superadmin dengan akses ke stasiun (jalankan di SQL Editor):
--
--      update public.profiles
--      set role = 'superadmin',
--          full_name = 'Nama Admin',
--          station_access = array['5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10'::uuid]
--      where id = (select id from auth.users where email = 'admin@contoh.com');
--
-- 4. Service ingest memanggil ingest_telemetry() memakai SERVICE ROLE key.
--    Key tersebut hanya boleh disimpan di .env service ingest, tidak boleh
--    masuk ke frontend, gateway lapangan, atau repository.
