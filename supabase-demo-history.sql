-- ============================================================================
-- RIVER FLOW GUARDIAN - RIWAYAT DUMMY (OPSIONAL, HANYA UNTUK DEMO/PENGEMBANGAN)
-- ============================================================================
-- Mengisi 3 hari terakhir (interval 5 menit) agar grafik trend langsung
-- terisi sebelum data lapangan tersedia. Semua baris ditandai raw_value = 'demo'.
--
-- PENTING: hapus data ini sebelum dipakai operasional atau dipakai melatih
-- model AI, karena nilainya sintetis:
--
--   delete from public.measurements where raw_value = 'demo';
-- ============================================================================

with points as (
  select
    ts,
    extract(epoch from ts) / 3600.0 as h      -- jam sejak epoch, untuk pola harian
  from generate_series(
    date_trunc('minute', now()) - interval '3 days',
    date_trunc('minute', now()) - interval '5 minutes',
    interval '5 minutes'
  ) as ts
),
hydro as (
  select
    ts,
    h,
    0.80 + 0.12 * sin(2 * pi() * h / 24) + 0.03 * sin(2 * pi() * h / 3.7) as level_m,
    1.20 + 0.15 * sin(2 * pi() * h / 24 + 0.6) + 0.04 * sin(2 * pi() * h / 2.3) as velocity_ms
  from points
),
derived as (
  select
    ts,
    h,
    level_m,
    velocity_ms,
    -- saluran persegi lebar 2 m, koefisien koreksi 0.85 (ilustrasi)
    level_m * 2.0 * velocity_ms * 0.85 as flow_m3s,
    row_number() over (order by ts) as n
  from hydro
),
values_long as (
  select ts, 'HYDRO.WATER_LEVEL' as tag_id, round(level_m::numeric, 3) as value from derived
  union all select ts, 'HYDRO.VELOCITY', round(velocity_ms::numeric, 2) from derived
  union all select ts, 'HYDRO.FLOW_RATE', round(flow_m3s::numeric, 3) from derived
  union all select ts, 'HYDRO.VOLUME', round((150000 + n * 300 * 1.6)::numeric, 0) from derived
  union all select ts, 'HYDRO.AIR_GAP', round((3.0 - level_m)::numeric, 3) from derived
  union all select ts, 'HYDRO.FLOW_DIRECTION', 0 from derived
  union all select ts, 'POWER.ACTIVE_POWER', round((25 + flow_m3s * 12)::numeric, 2) from derived
  union all select ts, 'POWER.ENERGY_KWH', round((48000 + n * (25 + 1.6 * 12) / 12.0)::numeric, 1) from derived
  union all select ts, 'POWER.VOLTAGE', round((220 + 3 * sin(2 * pi() * h / 5.1))::numeric, 1) from derived
  union all select ts, 'POWER.CURRENT', round(((25 + flow_m3s * 12) * 1000 / (3 * 220 * 0.9))::numeric, 2) from derived
  union all select ts, 'POWER.POWER_FACTOR', round((0.90 + 0.02 * sin(2 * pi() * h / 7.3))::numeric, 2) from derived
  union all select ts, 'POWER.FREQUENCY', round((50 + 0.08 * sin(2 * pi() * h / 1.7))::numeric, 2) from derived
  union all select ts, 'PANEL.TEMPERATURE', round((34 + 5 * sin(2 * pi() * (h - 8) / 24))::numeric, 1) from derived
  union all select ts, 'PANEL.FAN_STATUS', case when 34 + 5 * sin(2 * pi() * (h - 8) / 24) > 37 then 1 else 0 end from derived
  union all select ts, 'SYS.RADAR_COMM', 0 from derived
)
insert into public.measurements (tag_id, station_id, value, quality, source_timestamp, received_timestamp, raw_value)
select v.tag_id, '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', v.value, 'good', v.ts, v.ts, 'demo'
from values_long v
join public.tags t on t.tag_id = v.tag_id
on conflict (station_id, tag_id, source_timestamp) do nothing;
