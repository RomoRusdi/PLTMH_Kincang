-- ============================================================================
-- 15 – KALIBRASI DI PERANGKAT (RADAR)
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 14-energy-meter-hmi-kincang.sql. Aman dijalankan ulang.
--
-- Sebagian stasiun dikalibrasi di dalam radar, bukan lewat menu Kalibrasi
-- Sensor. PLTM Singgi: koreksi K di register radar 0xC11E ditetapkan Hardware
-- Engineer dari perbandingan debit radar dengan daya generator
-- (debit turbin = kW ÷ 63,86). Radar lalu mengirim debit yang sudah terkoreksi.
--
-- File ini menambah catatan kalibrasi perangkat per stasiun, sehingga
-- Ringkasan Stasiun dan menu Kalibrasi menampilkan "Terkalibrasi · di radar".
-- Kalibrasi web (station_calibrations) tetap didahulukan bila lebih baru.
-- ============================================================================

alter table public.stations add column if not exists device_calibrated_at timestamptz;
alter table public.stations add column if not exists device_calibration_note text;

comment on column public.stations.device_calibrated_at is 'Waktu kalibrasi terakhir yang dilakukan di dalam perangkat (mis. koreksi K radar)';
comment on column public.stations.device_calibration_note is 'Keterangan kalibrasi di perangkat, mis. "K 2,50 di radar"';

-- View ringkasan: kalibrasi terbaru dari web atau dari perangkat.
-- Kolom baru (calibration_note) ditambahkan di akhir agar view lama tetap kompatibel.
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
  cal.method as calibration_method,
  cal.note as calibration_note
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
  select x.version, x.effective_from, x.method, x.note
  from (
    select c.version, c.effective_from, c.method, c.notes as note
    from public.station_calibrations c
    where c.station_id = s.id and c.effective_from <= now()
    union all
    select null::integer, s.device_calibrated_at, 'device', s.device_calibration_note
    where s.device_calibrated_at is not null and s.device_calibrated_at <= now()
  ) x
  order by x.effective_from desc, x.version desc nulls last
  limit 1
) cal on true;

comment on view public.station_overview is 'Kondisi terkini setiap stasiun untuk halaman Ringkasan Stasiun';

revoke all on public.station_overview from anon;
grant select on public.station_overview to authenticated;

-- ----------------------------------------------------------------------------
-- PLTM Singgi: K aktif diperkirakan dari data (radar menghitung
-- debit = 0,567 × K × kecepatan × 2,00 m × level; gateway mengirim kecepatan
-- sebenarnya = kecepatan radar ÷ K). Waktu kalibrasi = jam pertama K terbaca
-- 2,3–2,7. Bila Gibson mencatat waktu/nilai K yang pasti, isi v_at dan v_k.
-- ----------------------------------------------------------------------------
do $$
declare
  v_station uuid := '017b0c85-42ea-4283-ae91-e6343368b854';
  v_at timestamptz := null;   -- mis. '2026-11-17 10:00+07' bila diketahui pasti
  v_k numeric := null;        -- mis. 2.50 bila diketahui pasti
begin
  if v_at is null or v_k is null then
    with p as (
      select source_timestamp as ts,
             max(value) filter (where tag_id = 'HYDRO.FLOW_RATE') as q,
             max(value) filter (where tag_id = 'HYDRO.VELOCITY') as v,
             max(value) filter (where tag_id = 'HYDRO.WATER_LEVEL') as h
      from public.measurements
      where station_id = v_station and quality = 'good'
        and tag_id in ('HYDRO.FLOW_RATE', 'HYDRO.VELOCITY', 'HYDRO.WATER_LEVEL')
      group by 1
    ),
    per_jam as (
      select date_trunc('hour', ts) as jam, avg(q / (0.567 * 2 * v * h)) as k, count(*) as n
      from p
      where v > 0.05 and h > 0.1 and q > 0
      group by 1
      having count(*) >= 20
    )
    select coalesce(v_at, min(jam)),
           coalesce(v_k, round((select avg(k) from per_jam where k between 2.3 and 2.7)::numeric, 2))
      into v_at, v_k
    from per_jam
    where k between 2.3 and 2.7;
  end if;

  if v_at is null or v_k is null then
    raise notice 'Singgi: K sekitar 2,5 belum terlihat di data; kalibrasi perangkat tidak dicatat. Isi v_at dan v_k bila sudah pasti.';
    return;
  end if;

  update public.stations
  set device_calibrated_at = v_at,
      device_calibration_note = format('K %s di radar (acuan daya generator)', replace(v_k::text, '.', ','))
  where id = v_station;
  raise notice 'Singgi: kalibrasi di radar dicatat, K % sejak % WIB', v_k, to_char(v_at at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI');
end $$;

-- Cek:
--   select name, device_calibrated_at at time zone 'Asia/Jakarta' as wib, device_calibration_note
--   from public.stations where device_calibrated_at is not null;
