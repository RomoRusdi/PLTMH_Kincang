-- ============================================================================
-- DATA DEMO – 5 STASIUN (HANYA UNTUK DEMO / PENGEMBANGAN)
-- ============================================================================
-- Jalankan SETELAH 01 sampai 07 (lihat database/README.md).
-- Aman dijalankan ulang (data demo lama dihapus lalu dibuat ulang).
--
-- Menambahkan 4 stasiun [DEMO] di samping "PLTMH Kincang", lengkap
-- dengan perangkat, tag (threshold disalin dari PLTMH Kincang), riwayat
-- 3 hari, dan kalibrasi dengan umur berbeda-beda:
--
--   [DEMO] Saluran Serayu      kalibrasi 20 hari lalu  → Terkalibrasi
--   [DEMO] Saluran Merawu      kalibrasi v2 76 hari    → Segera kalibrasi
--   [DEMO] Saluran Tulis       kalibrasi 140 hari lalu → Perlu kalibrasi ulang
--   [DEMO] Saluran Pekacangan  belum dikalibrasi, data berhenti 3 jam lalu
--
-- Data live tiga stasiun pertama dikirim oleh `npm run demo` di folder
-- services (Merawu naik ke level alarm, Tulis mensimulasikan radar putus).
-- Pekacangan sengaja tidak dikirim agar tampil sebagai "Data terhenti".
--
-- Menghapus semua data demo: lihat bagian paling bawah file ini.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Bersihkan data demo sebelumnya (cascade ke perangkat, tag, data, alarm,
--    dan kalibrasi milik stasiun demo).
-- ----------------------------------------------------------------------------
delete from public.stations where id in (
  'de000000-0000-4000-8000-000000000002',
  'de000000-0000-4000-8000-000000000003',
  'de000000-0000-4000-8000-000000000004',
  'de000000-0000-4000-8000-000000000005'
);

-- ----------------------------------------------------------------------------
-- 1. Stasiun
-- ----------------------------------------------------------------------------
insert into public.stations (id, name, location, latitude, longitude, description, status, river_name, calibration_interval_days)
values
  ('de000000-0000-4000-8000-000000000002', '[DEMO] Saluran Serayu', 'Contoh lokasi 2 – Banjarnegara', -7.3940, 109.6660, 'Stasiun contoh untuk demo multi-stasiun', 'active', 'Serayu (contoh)', 90),
  ('de000000-0000-4000-8000-000000000003', '[DEMO] Saluran Merawu', 'Contoh lokasi 3 – Banjarnegara', -7.3300, 109.7300, 'Stasiun contoh untuk demo multi-stasiun', 'active', 'Merawu (contoh)', 90),
  ('de000000-0000-4000-8000-000000000004', '[DEMO] Saluran Tulis', 'Contoh lokasi 4 – Banjarnegara', -7.3620, 109.6200, 'Stasiun contoh untuk demo multi-stasiun', 'active', 'Tulis (contoh)', 90),
  ('de000000-0000-4000-8000-000000000005', '[DEMO] Saluran Pekacangan', 'Contoh lokasi 5 – Banjarnegara', -7.4180, 109.6400, 'Stasiun contoh untuk demo multi-stasiun', 'active', 'Pekacangan (contoh)', 90);

-- ----------------------------------------------------------------------------
-- 2. Perangkat (ID tetap agar program demo bisa merujuk gateway_id)
--    Pola: de000000-000S-4000-8000-00000000000D  (S = stasiun, D = perangkat)
-- ----------------------------------------------------------------------------
insert into public.devices (id, station_id, name, device_type, protocol, modbus_address, status, last_seen, scan_interval_sec, enabled, manufacturer, model, config)
select
  format('de000000-000%s-4000-8000-00000000000%s', s.n, d.n)::uuid,
  format('de000000-0000-4000-8000-00000000000%s', s.n)::uuid,
  t.name, t.device_type, t.protocol, t.modbus_address,
  case when s.n = 5 then 'offline' else 'online' end,
  case when s.n = 5 then now() - interval '3 hours' else now() end,
  t.scan_interval_sec, t.enabled, t.manufacturer, t.model, t.config
from (values (2), (3), (4), (5)) as s(n)
cross join (values (1, 'Radar Flow-meter'), (2, 'PLC Panel'), (3, 'Energy Meter'), (4, 'PC Gateway')) as d(n, name)
join public.devices t
  on t.station_id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10' and t.name = d.name;

-- ----------------------------------------------------------------------------
-- 3. Tag dan threshold disalin dari PLTMH Kincang
-- ----------------------------------------------------------------------------
insert into public.tags (station_id, device_id, tag_id, name, description, value_type, unit, source_address,
                         alarm_high, alarm_high_high, alarm_low, alarm_low_low, deadband, enabled, display_precision)
select
  nd.station_id, nd.id, t.tag_id, t.name, t.description, t.value_type, t.unit, t.source_address,
  t.alarm_high, t.alarm_high_high, t.alarm_low, t.alarm_low_low, t.deadband, t.enabled, t.display_precision
from public.tags t
join public.devices od on od.id = t.device_id
join public.devices nd on nd.name = od.name
  and nd.station_id in (
    'de000000-0000-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000003',
    'de000000-0000-4000-8000-000000000004', 'de000000-0000-4000-8000-000000000005')
where t.station_id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10';

-- ----------------------------------------------------------------------------
-- 4. Kalibrasi dengan umur berbeda (langsung sebagai pemilik DB, tanpa RPC)
-- ----------------------------------------------------------------------------
with inserted as (
  insert into public.station_calibrations (
    station_id, version, install_height_m, level_offset_m, section_type, bottom_width_m, side_slope,
    velocity_coefficient, method, notes, effective_from, created_by_email, created_at
  ) values
    ('de000000-0000-4000-8000-000000000002', 1, 3.20, 0.015, 'rectangle', 2.50, 0, 0.86, 'field_reference', 'Data demo: papan duga + current meter',
     now() - interval '20 days', 'demo@digihydrotek', now() - interval '20 days'),
    ('de000000-0000-4000-8000-000000000003', 1, 3.00, 0.000, 'rectangle', 3.00, 0, 0.85, 'manual', 'Data demo: parameter awal pemasangan',
     now() - interval '150 days', 'demo@digihydrotek', now() - interval '150 days'),
    ('de000000-0000-4000-8000-000000000003', 2, 3.00, 0.025, 'rectangle', 3.00, 0, 0.83, 'field_reference', 'Data demo: kalibrasi ulang setelah musim hujan',
     now() - interval '76 days', 'demo@digihydrotek', now() - interval '76 days'),
    ('de000000-0000-4000-8000-000000000004', 1, 2.80, -0.010, 'trapezoid', 1.80, 1.0, 0.84, 'field_reference', 'Data demo: saluran trapesium',
     now() - interval '140 days', 'demo@digihydrotek', now() - interval '140 days')
  returning id, station_id, version, effective_from
)
insert into public.calibration_references (calibration_id, station_id, measured_at, ref_level_m, ref_velocity_ms, ref_flow_m3s, radar_air_gap_m, radar_velocity_ms, notes)
select i.id, i.station_id, i.effective_from - (r.minutes || ' minutes')::interval, r.ref_level, r.ref_vel, null, r.gap, r.radar_vel, 'Data demo'
from inserted i
join (values
  ('de000000-0000-4000-8000-000000000002'::uuid, 1, 30, 1.062, 1.08, 2.153, 1.26),
  ('de000000-0000-4000-8000-000000000002'::uuid, 1, 10, 1.071, 1.10, 2.144, 1.28),
  ('de000000-0000-4000-8000-000000000003'::uuid, 2, 25, 1.120, 0.98, 1.905, 1.18),
  ('de000000-0000-4000-8000-000000000004'::uuid, 1, 15, 0.705, 0.79, 2.085, 0.94)
) as r(station_id, version, minutes, ref_level, ref_vel, gap, radar_vel)
  on r.station_id = i.station_id and r.version = i.version;

-- ----------------------------------------------------------------------------
-- 5. Riwayat 3 hari (interval 5 menit), konsisten dengan kalibrasi tiap stasiun.
--    Nilai tetap di dalam batas threshold agar tidak memicu alarm historis;
--    alarm muncul dari data live program demo.
-- ----------------------------------------------------------------------------
with params(station_id, base_level, base_vel, install_h, offset_m, bottom_w, slope, k, phase, end_at) as (
  values
    ('de000000-0000-4000-8000-000000000002'::uuid, 1.05, 1.25, 3.20,  0.015, 2.50, 0.0, 0.86, 0.0, now()),
    ('de000000-0000-4000-8000-000000000003'::uuid, 1.10, 1.15, 3.00,  0.025, 3.00, 0.0, 0.83, 1.3, now()),
    ('de000000-0000-4000-8000-000000000004'::uuid, 0.72, 0.95, 2.80, -0.010, 1.80, 1.0, 0.84, 2.1, now()),
    ('de000000-0000-4000-8000-000000000005'::uuid, 0.85, 1.05, 3.00,  0.000, 2.00, 0.0, 0.85, 3.4, now() - interval '3 hours')
),
points as (
  select
    p.*,
    ts,
    extract(epoch from ts) / 3600.0 as h,
    row_number() over (partition by p.station_id order by ts) as n
  from params p
  cross join lateral generate_series(
    date_trunc('minute', now()) - interval '3 days',
    p.end_at,
    interval '5 minutes'
  ) as ts
),
hydro as (
  select
    *,
    base_level + 0.12 * sin(2 * pi() * h / 24 + phase) + 0.03 * sin(2 * pi() * h / 3.7 + phase) as level_m,
    base_vel + 0.12 * sin(2 * pi() * h / 24 + phase + 0.6) + 0.04 * sin(2 * pi() * h / 2.3) as vel_ms
  from points
),
derived as (
  select
    *,
    install_h + offset_m - level_m as air_gap_m,
    k * vel_ms * (bottom_w + slope * level_m) * level_m as flow_m3s
  from hydro
),
values_long as (
  select station_id, ts, 'HYDRO.WATER_LEVEL' as tag_id, round(level_m::numeric, 3) as value from derived
  union all select station_id, ts, 'HYDRO.VELOCITY', round(vel_ms::numeric, 2) from derived
  union all select station_id, ts, 'HYDRO.FLOW_RATE', round(flow_m3s::numeric, 3) from derived
  union all select station_id, ts, 'HYDRO.VOLUME', round((90000 + n * 300 * flow_m3s)::numeric, 0) from derived
  union all select station_id, ts, 'HYDRO.AIR_GAP', round(air_gap_m::numeric, 3) from derived
  union all select station_id, ts, 'HYDRO.FLOW_DIRECTION', 0 from derived
  union all select station_id, ts, 'POWER.ACTIVE_POWER', round((18 + flow_m3s * 11)::numeric, 2) from derived
  union all select station_id, ts, 'POWER.ENERGY_KWH', round((30000 + n * (18 + flow_m3s * 11) / 12.0)::numeric, 1) from derived
  union all select station_id, ts, 'POWER.VOLTAGE', round((220 + 3 * sin(2 * pi() * h / 5.1 + phase))::numeric, 1) from derived
  union all select station_id, ts, 'POWER.CURRENT', round(((18 + flow_m3s * 11) * 1000 / (3 * 220 * 0.9))::numeric, 2) from derived
  union all select station_id, ts, 'POWER.POWER_FACTOR', round((0.90 + 0.02 * sin(2 * pi() * h / 7.3))::numeric, 2) from derived
  union all select station_id, ts, 'POWER.FREQUENCY', round((50 + 0.08 * sin(2 * pi() * h / 1.7 + phase))::numeric, 2) from derived
  union all select station_id, ts, 'PANEL.TEMPERATURE', round((33 + 5 * sin(2 * pi() * (h - 8) / 24 + phase / 4))::numeric, 1) from derived
  union all select station_id, ts, 'PANEL.FAN_STATUS', case when 33 + 5 * sin(2 * pi() * (h - 8) / 24 + phase / 4) > 37 then 1 else 0 end from derived
  union all select station_id, ts, 'SYS.RADAR_COMM', 0 from derived
)
insert into public.measurements (tag_id, station_id, value, quality, source_timestamp, received_timestamp, raw_value)
select tag_id, station_id, value, 'good', ts, ts, 'demo'
from values_long
on conflict (station_id, tag_id, source_timestamp) do nothing;

-- Ringkasan hasil
select s.name, count(m.*) as jumlah_data, max(m.source_timestamp) as data_terakhir
from public.stations s
left join public.measurements m on m.station_id = s.id
where s.name like '[DEMO]%'
group by s.name
order by s.name;

-- ============================================================================
-- CATATAN AKSES
-- Superadmin otomatis melihat semua stasiun. Untuk user lain, tambahkan
-- stasiun demo ke station_access-nya, misalnya:
--
--   update public.profiles
--   set station_access = station_access || array[
--     'de000000-0000-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000003',
--     'de000000-0000-4000-8000-000000000004', 'de000000-0000-4000-8000-000000000005']::uuid[]
--   where id = (select id from auth.users where email = 'operator@contoh.com');
--
-- MENGHAPUS SEMUA DATA DEMO (jalankan bila sudah tidak dipakai):
--
--   delete from public.stations where id in (
--     'de000000-0000-4000-8000-000000000002', 'de000000-0000-4000-8000-000000000003',
--     'de000000-0000-4000-8000-000000000004', 'de000000-0000-4000-8000-000000000005');
-- ============================================================================
