-- ============================================================================
-- MIGRASI 003 – RINGKASAN STASIUN
-- ============================================================================
-- Jalankan di SQL Editor SETELAH migrasi 002. Aman dijalankan ulang.
--
-- Isi:
--   1. Interval kalibrasi ulang per stasiun (default 90 hari).
--   2. View station_overview: kondisi terkini semua stasiun dalam satu query
--      (koneksi, level, kecepatan, debit, alarm aktif, kalibrasi aktif).
-- ============================================================================

alter table public.stations
  add column if not exists calibration_interval_days integer not null default 90;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stations_calibration_interval_check') then
    alter table public.stations
      add constraint stations_calibration_interval_check
      check (calibration_interval_days between 7 and 730);
  end if;
end $$;

comment on column public.stations.calibration_interval_days is
  'Batas umur kalibrasi (hari) sebelum stasiun ditandai perlu kalibrasi ulang';

-- security_invoker: RLS tabel dasar tetap berlaku, sehingga user hanya melihat
-- stasiun yang ada di station_access-nya.
-- Nilai terkini diambil per tag lewat indeks (station_id, tag_id,
-- source_timestamp) agar tetap cepat walau riwayat data bertambah panjang.
create or replace view public.station_overview with (security_invoker = true) as
select
  s.id,
  s.name,
  s.location,
  s.status,
  s.calibration_interval_days,
  last_data.last_data_at,
  lvl.value as level_m,
  lvl.quality as level_quality,
  vel.value as velocity_ms,
  vel.quality as velocity_quality,
  flw.value as flow_m3s,
  flw.quality as flow_quality,
  coalesce(al.active_count, 0)::integer as active_alarms,
  coalesce(al.critical_count, 0)::integer as critical_alarms,
  cal.version as calibration_version,
  cal.effective_from as calibration_at,
  cal.method as calibration_method
from public.stations s
left join lateral (
  select max(m.source_timestamp) as last_data_at
  from public.measurements m
  where m.station_id = s.id
) last_data on true
left join lateral (
  select m.value, m.quality from public.measurements m
  where m.station_id = s.id and m.tag_id = 'HYDRO.WATER_LEVEL'
  order by m.source_timestamp desc limit 1
) lvl on true
left join lateral (
  select m.value, m.quality from public.measurements m
  where m.station_id = s.id and m.tag_id = 'HYDRO.VELOCITY'
  order by m.source_timestamp desc limit 1
) vel on true
left join lateral (
  select m.value, m.quality from public.measurements m
  where m.station_id = s.id and m.tag_id = 'HYDRO.FLOW_RATE'
  order by m.source_timestamp desc limit 1
) flw on true
left join lateral (
  select
    count(*) as active_count,
    count(*) filter (where a.priority = 'critical') as critical_count
  from public.alarms a
  where a.station_id = s.id and a.status in ('active', 'acknowledged')
) al on true
left join lateral (
  select c.version, c.effective_from, c.method
  from public.station_calibrations c
  where c.station_id = s.id and c.effective_from <= now()
  order by c.effective_from desc, c.version desc
  limit 1
) cal on true;

comment on view public.station_overview is 'Kondisi terkini setiap stasiun untuk halaman Ringkasan Stasiun';

revoke all on public.station_overview from anon;
grant select on public.station_overview to authenticated;
