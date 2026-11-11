-- ============================================================================
-- MIGRASI 002 – MULTI-STASIUN & KALIBRASI RADAR DI SISTEM
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 01-schema.sql. Aman dijalankan ulang.
--   • Database yang sudah berisi data: cukup jalankan file ini.
--   • Instalasi baru: ikuti urutan nomor file (lihat database/README.md).
--
-- Isi:
--   1. Tag unik per stasiun (stasiun + tag), sehingga setiap stasiun punya
--      HYDRO.WATER_LEVEL dan threshold sendiri.
--   2. Tabel kalibrasi per stasiun beserta riwayat dan data pengukuran acuan.
--   3. ingest_telemetry menghitung level dan debit dari data mentah radar
--      memakai kalibrasi yang berlaku pada waktu pengukuran.
--   4. RPC apply_calibration (wizard) dan copy_station_config (stasiun baru).
--
-- Kalibrasi hanya mengubah cara sistem menghitung nilai; tidak ada parameter
-- yang ditulis ke radar atau PLC (sesuai lingkup monitoring).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TAG UNIK PER STASIUN
-- ----------------------------------------------------------------------------
do $$
declare
  c record;
begin
  -- Lepas foreign key lama yang merujuk tags(tag_id) saja.
  for c in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.tags'::regclass
      and conrelid in ('public.measurements'::regclass, 'public.alarms'::regclass)
      and array_length(conkey, 1) = 1
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;

  -- Lepas unique tunggal pada tags.tag_id.
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.tags'::regclass
      and contype = 'u'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.tags'::regclass and attname = 'tag_id')]
  loop
    execute format('alter table public.tags drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.tags alter column station_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tags_station_tag_key') then
    alter table public.tags add constraint tags_station_tag_key unique (station_id, tag_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'measurements_station_tag_fkey') then
    alter table public.measurements
      add constraint measurements_station_tag_fkey
      foreign key (station_id, tag_id) references public.tags (station_id, tag_id) on delete cascade;
  end if;

  -- Alarm historis tetap ada walau tag dihapus; hanya kolom tag_id yang dikosongkan.
  if not exists (select 1 from pg_constraint where conname = 'alarms_station_tag_fkey') then
    alter table public.alarms
      add constraint alarms_station_tag_fkey
      foreign key (station_id, tag_id) references public.tags (station_id, tag_id) on delete set null (tag_id);
  end if;
end $$;

create index if not exists idx_alarms_station_tag on public.alarms (station_id, tag_id);

-- View yang sebelumnya menggabungkan tag hanya lewat tag_id.
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
join public.tags t on t.station_id = m.station_id and t.tag_id = m.tag_id
order by m.station_id, m.tag_id, m.source_timestamp desc, m.received_timestamp desc;

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
left join public.tags t on t.station_id = a.station_id and t.tag_id = a.tag_id
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

-- get_trend_data kini wajib menyebut stasiun, karena tag_id tidak lagi unik.
drop function if exists public.get_trend_data(text, timestamptz, timestamptz, integer);

create or replace function public.get_trend_data(
  p_station_id uuid,
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
  where m.station_id = p_station_id
    and m.tag_id = p_tag_id
    and m.source_timestamp >= p_from_ts
    and m.source_timestamp <= p_to_ts
    and m.quality = 'good'
  group by bucket
  order by bucket asc;
$$;

comment on function public.get_trend_data(uuid, text, timestamptz, timestamptz, integer)
  is 'Agregasi time-bucket nilai sensor satu stasiun untuk grafik trend';

-- ----------------------------------------------------------------------------
-- 2. KALIBRASI PER STASIUN
-- ----------------------------------------------------------------------------
-- Setiap perubahan kalibrasi adalah baris baru (versi), sehingga riwayat
-- lengkap dan data lama tetap dapat ditelusuri ke kalibrasi yang berlaku.
create table if not exists public.station_calibrations (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  version integer not null,
  -- Jarak vertikal dari radar ke dasar saluran (setara register range 41059).
  install_height_m float8 not null check (install_height_m > 0 and install_height_m <= 65),
  -- Koreksi level terhadap papan duga: level = tinggi pasang − jarak air + offset.
  level_offset_m float8 not null default 0 check (abs(level_offset_m) <= 5),
  section_type text not null check (section_type in ('rectangle', 'trapezoid')),
  bottom_width_m float8 not null check (bottom_width_m > 0 and bottom_width_m <= 200),
  -- Kemiringan talud horizontal : vertikal (0 untuk penampang persegi).
  side_slope float8 not null default 0 check (side_slope >= 0 and side_slope <= 10),
  -- Kecepatan rata-rata penampang = koefisien × kecepatan permukaan radar.
  velocity_coefficient float8 not null default 0.85 check (velocity_coefficient > 0 and velocity_coefficient <= 1.5),
  method text not null default 'manual' check (method in ('manual', 'field_reference')),
  notes text,
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_by_email text,
  created_at timestamptz not null default now(),
  unique (station_id, version),
  check (section_type = 'trapezoid' or side_slope = 0)
);

comment on table public.station_calibrations is 'Parameter kalibrasi radar per stasiun (berversi)';

create index if not exists idx_station_calibrations_effective
  on public.station_calibrations (station_id, effective_from desc);

-- Pengukuran acuan lapangan (papan duga, current meter) yang menjadi dasar
-- kalibrasi metode field_reference.
create table if not exists public.calibration_references (
  id uuid primary key default gen_random_uuid(),
  calibration_id uuid not null references public.station_calibrations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  measured_at timestamptz not null,
  ref_level_m float8,
  ref_velocity_ms float8,
  ref_flow_m3s float8,
  radar_air_gap_m float8,
  radar_velocity_ms float8,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.calibration_references is 'Data pengukuran manual acuan untuk setiap kalibrasi';

alter table public.station_calibrations enable row level security;
alter table public.calibration_references enable row level security;

drop policy if exists station_calibrations_select on public.station_calibrations;
create policy station_calibrations_select on public.station_calibrations
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists calibration_references_select on public.calibration_references;
create policy calibration_references_select on public.calibration_references
  for select to authenticated using (public.current_user_can_access_station(station_id));
-- Tidak ada policy insert/update/delete: kalibrasi hanya lewat apply_calibration
-- sehingga setiap perubahan tervalidasi dan tercatat di audit trail.

-- Kalibrasi yang berlaku pada waktu tertentu.
create or replace function public.active_calibration(p_station_id uuid, p_at timestamptz default now())
returns public.station_calibrations
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.station_calibrations
  where station_id = p_station_id and effective_from <= p_at
  order by effective_from desc, version desc
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 3. INGEST DENGAN KALIBRASI
-- ----------------------------------------------------------------------------
-- Bila stasiun punya kalibrasi, HYDRO.WATER_LEVEL dan HYDRO.FLOW_RATE dihitung
-- ulang dari data mentah radar (HYDRO.AIR_GAP dan HYDRO.VELOCITY):
--   level = tinggi_pasang − jarak_ke_air + offset
--   luas  = (lebar_dasar + kemiringan × level) × level
--   debit = koefisien_kecepatan × kecepatan_permukaan × luas
-- Nilai hitungan internal radar disimpan di raw_value untuk penelusuran.
-- Tanpa kalibrasi, nilai radar disimpan apa adanya (perilaku sebelumnya).
create or replace function public.apply_station_calibration(
  p_station_id uuid,
  p_ts timestamptz,
  p_values jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cal public.station_calibrations;
  v_gap jsonb;
  v_vel jsonb;
  v_level_item jsonb;
  v_flow_item jsonb;
  v_gap_ok boolean;
  v_vel_ok boolean;
  v_level float8;
  v_area float8;
  v_out jsonb;
begin
  v_cal := public.active_calibration(p_station_id, p_ts);
  if v_cal.id is null then
    return p_values;
  end if;

  select item into v_gap from jsonb_array_elements(p_values) item where item->>'tag' = 'HYDRO.AIR_GAP' limit 1;
  select item into v_vel from jsonb_array_elements(p_values) item where item->>'tag' = 'HYDRO.VELOCITY' limit 1;
  -- Payload tanpa jarak ke air tidak bisa dikalibrasi: biarkan nilai radar.
  if v_gap is null then
    return p_values;
  end if;

  v_gap_ok := coalesce(v_gap->>'quality', 'good') = 'good' and jsonb_typeof(v_gap->'value') = 'number';
  v_vel_ok := v_vel is not null and coalesce(v_vel->>'quality', 'good') = 'good' and jsonb_typeof(v_vel->'value') = 'number';

  select item into v_level_item from jsonb_array_elements(p_values) item where item->>'tag' = 'HYDRO.WATER_LEVEL' limit 1;
  select item into v_flow_item from jsonb_array_elements(p_values) item where item->>'tag' = 'HYDRO.FLOW_RATE' limit 1;

  if v_gap_ok then
    v_level := greatest(v_cal.install_height_m - (v_gap->>'value')::float8 + v_cal.level_offset_m, 0);
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_out
  from jsonb_array_elements(p_values) item
  where item->>'tag' not in ('HYDRO.WATER_LEVEL', 'HYDRO.FLOW_RATE');

  v_out := v_out || jsonb_build_array(jsonb_build_object(
    'tag', 'HYDRO.WATER_LEVEL',
    'value', case when v_gap_ok then round(v_level::numeric, 4) end,
    'quality', case when v_gap_ok then 'good' else coalesce(v_gap->>'quality', 'bad') end,
    'raw', format('radar=%s;kal=v%s', coalesce(v_level_item->>'value', 'null'), v_cal.version)
  ));

  if v_vel is not null then
    if v_gap_ok and v_vel_ok then
      v_area := (v_cal.bottom_width_m + v_cal.side_slope * v_level) * v_level;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'tag', 'HYDRO.FLOW_RATE',
      'value', case when v_gap_ok and v_vel_ok
        then round((v_cal.velocity_coefficient * (v_vel->>'value')::float8 * v_area)::numeric, 4) end,
      'quality', case
        when v_gap_ok and v_vel_ok then 'good'
        when not v_gap_ok then coalesce(v_gap->>'quality', 'bad')
        else coalesce(v_vel->>'quality', 'bad') end,
      'raw', format('radar=%s;kal=v%s', coalesce(v_flow_item->>'value', 'null'), v_cal.version)
    ));
  elsif v_flow_item is not null then
    v_out := v_out || jsonb_build_array(v_flow_item);
  end if;

  return v_out;
end;
$$;

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
  v_values jsonb;
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

  v_values := public.apply_station_calibration(v_station_id, v_ts, p_payload->'values');

  for v_item in select * from jsonb_array_elements(v_values) loop
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

-- ----------------------------------------------------------------------------
-- 4. RPC UNTUK APLIKASI WEB
-- ----------------------------------------------------------------------------
-- Menyimpan kalibrasi baru (versi berikutnya) beserta pengukuran acuannya.
-- p_params: {install_height_m, level_offset_m, section_type, bottom_width_m,
--            side_slope, velocity_coefficient}
-- p_references: [{measured_at, ref_level_m, ref_velocity_ms, ref_flow_m3s,
--                 radar_air_gap_m, radar_velocity_ms, notes}]
create or replace function public.apply_calibration(
  p_station_id uuid,
  p_params jsonb,
  p_references jsonb default '[]'::jsonb,
  p_notes text default null
)
returns public.station_calibrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_role text;
  v_prev public.station_calibrations;
  v_cal public.station_calibrations;
  v_ref jsonb;
  v_section text;
begin
  if v_actor is null then raise exception 'Autentikasi diperlukan'; end if;
  if not public.has_min_role('admin') then raise exception 'Hanya admin yang dapat mengubah kalibrasi'; end if;
  if not public.current_user_can_access_station(p_station_id) then raise exception 'Stasiun tidak dapat diakses'; end if;
  if jsonb_typeof(coalesce(p_references, '[]'::jsonb)) <> 'array' then raise exception 'p_references harus berupa array'; end if;

  select email into v_email from auth.users where id = v_actor;
  select role into v_role from public.profiles where id = v_actor;
  v_prev := public.active_calibration(p_station_id, now());
  v_section := coalesce(p_params->>'section_type', 'rectangle');

  -- Kunci per stasiun agar dua admin yang menyimpan bersamaan tidak
  -- menghasilkan nomor versi yang sama.
  perform pg_advisory_xact_lock(hashtext('calibration:' || p_station_id::text));

  insert into public.station_calibrations (
    station_id, version, install_height_m, level_offset_m, section_type, bottom_width_m,
    side_slope, velocity_coefficient, method, notes, created_by, created_by_email
  ) values (
    p_station_id,
    coalesce((select max(version) from public.station_calibrations where station_id = p_station_id), 0) + 1,
    (p_params->>'install_height_m')::float8,
    coalesce((p_params->>'level_offset_m')::float8, 0),
    v_section,
    (p_params->>'bottom_width_m')::float8,
    case when v_section = 'trapezoid' then coalesce((p_params->>'side_slope')::float8, 0) else 0 end,
    coalesce((p_params->>'velocity_coefficient')::float8, 0.85),
    case when jsonb_array_length(coalesce(p_references, '[]'::jsonb)) > 0 then 'field_reference' else 'manual' end,
    nullif(trim(p_notes), ''),
    v_actor,
    v_email
  )
  returning * into v_cal;

  for v_ref in select * from jsonb_array_elements(coalesce(p_references, '[]'::jsonb)) loop
    insert into public.calibration_references (
      calibration_id, station_id, measured_at, ref_level_m, ref_velocity_ms, ref_flow_m3s,
      radar_air_gap_m, radar_velocity_ms, notes
    ) values (
      v_cal.id, p_station_id,
      coalesce((v_ref->>'measured_at')::timestamptz, now()),
      (v_ref->>'ref_level_m')::float8,
      (v_ref->>'ref_velocity_ms')::float8,
      (v_ref->>'ref_flow_m3s')::float8,
      (v_ref->>'radar_air_gap_m')::float8,
      (v_ref->>'radar_velocity_ms')::float8,
      nullif(trim(v_ref->>'notes'), '')
    );
  end loop;

  insert into public.events (
    station_id, event_type, severity, message, actor_id, actor_email, actor_role, old_value, new_value, metadata
  ) values (
    p_station_id, 'config_change', 'warning',
    format('Kalibrasi radar diperbarui ke versi %s', v_cal.version),
    v_actor, v_email, v_role,
    case when v_prev.id is null then null else format(
      'v%s: tinggi=%s offset=%s lebar=%s talud=%s k=%s',
      v_prev.version, v_prev.install_height_m, v_prev.level_offset_m,
      v_prev.bottom_width_m, v_prev.side_slope, v_prev.velocity_coefficient) end,
    format('v%s: tinggi=%s offset=%s lebar=%s talud=%s k=%s',
      v_cal.version, v_cal.install_height_m, v_cal.level_offset_m,
      v_cal.bottom_width_m, v_cal.side_slope, v_cal.velocity_coefficient),
    jsonb_build_object('calibration_id', v_cal.id, 'method', v_cal.method,
      'references', jsonb_array_length(coalesce(p_references, '[]'::jsonb)))
  );

  return v_cal;
end;
$$;

comment on function public.apply_calibration is 'Simpan kalibrasi radar versi baru beserta pengukuran acuan; admin';

-- Menyalin perangkat dan tag (termasuk threshold) dari stasiun yang sudah ada
-- ke stasiun baru, agar lokasi pemasangan baru langsung siap menerima data.
create or replace function public.copy_station_config(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devices integer;
  v_tags integer;
begin
  if auth.uid() is null then raise exception 'Autentikasi diperlukan'; end if;
  if not public.has_min_role('admin') then raise exception 'Hanya admin yang dapat menyalin konfigurasi'; end if;
  if not (public.current_user_can_access_station(p_from) and public.current_user_can_access_station(p_to)) then
    raise exception 'Stasiun tidak dapat diakses';
  end if;
  if p_from = p_to then raise exception 'Stasiun asal dan tujuan sama'; end if;
  if exists (select 1 from public.tags where station_id = p_to) then
    raise exception 'Stasiun tujuan sudah memiliki tag';
  end if;

  with copied as (
    insert into public.devices (station_id, name, device_type, protocol, modbus_address, status,
                                scan_interval_sec, enabled, manufacturer, model, config)
    select p_to, name, device_type, protocol, modbus_address, 'offline',
           scan_interval_sec, enabled, manufacturer, model, config
    from public.devices where station_id = p_from
    returning id
  )
  select count(*) into v_devices from copied;

  with copied as (
    insert into public.tags (station_id, device_id, tag_id, name, description, value_type, unit, source_address,
                             alarm_high, alarm_high_high, alarm_low, alarm_low_low, deadband, enabled, display_precision)
    select p_to,
           (select nd.id from public.devices od join public.devices nd
              on nd.station_id = p_to and nd.name = od.name
            where od.id = t.device_id limit 1),
           t.tag_id, t.name, t.description, t.value_type, t.unit, t.source_address,
           t.alarm_high, t.alarm_high_high, t.alarm_low, t.alarm_low_low, t.deadband, t.enabled, t.display_precision
    from public.tags t where t.station_id = p_from
    returning id
  )
  select count(*) into v_tags from copied;

  return jsonb_build_object('devices', v_devices, 'tags', v_tags);
end;
$$;

comment on function public.copy_station_config is 'Salin perangkat dan tag (threshold) ke stasiun baru; admin';

-- ----------------------------------------------------------------------------
-- 5. HAK EKSEKUSI
-- ----------------------------------------------------------------------------
revoke execute on function public.get_trend_data(uuid, text, timestamptz, timestamptz, integer) from public, anon;
revoke execute on function public.active_calibration(uuid, timestamptz) from public, anon;
revoke execute on function public.apply_station_calibration(uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_calibration(uuid, jsonb, jsonb, text) from public, anon;
revoke execute on function public.copy_station_config(uuid, uuid) from public, anon;
revoke execute on function public.ingest_telemetry(jsonb) from public, anon, authenticated;

grant execute on function public.get_trend_data(uuid, text, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.active_calibration(uuid, timestamptz) to authenticated;
grant execute on function public.apply_calibration(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.copy_station_config(uuid, uuid) to authenticated;
grant execute on function public.ingest_telemetry(jsonb) to service_role;
