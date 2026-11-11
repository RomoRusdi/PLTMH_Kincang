-- ============================================================================
-- MIGRASI 005 – ESTIMASI DAYA DARI DEBIT
-- ============================================================================
-- Jalankan di SQL Editor SETELAH migrasi 004. Aman dijalankan ulang.
--
-- Selama energy meter belum terpasang, daya pembangkit diperkirakan dari
-- debit yang diukur radar:
--
--   debit turbin = min(debit terukur, debit desain turbin)   (bila diisi)
--   daya (kW)    = 9,81 × debit turbin × tinggi jatuh × efisiensi
--   dibatasi     = kapasitas maksimal pembangkit                (bila diisi)
--
-- Hasilnya disimpan sebagai tag terpisah HYDRO.POWER_EST ("Daya Estimasi"),
-- tidak pernah ditulis ke POWER.ACTIVE_POWER milik energy meter, sehingga
-- nilai hitungan dan nilai terukur tidak tertukar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PARAMETER PER STASIUN
-- ----------------------------------------------------------------------------
alter table public.stations add column if not exists power_head_m float8;
alter table public.stations add column if not exists power_efficiency float8 not null default 0.8;
alter table public.stations add column if not exists power_max_kw float8;
alter table public.stations add column if not exists power_design_flow_m3s float8;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stations_power_params_check') then
    alter table public.stations add constraint stations_power_params_check check (
      (power_head_m is null or (power_head_m > 0 and power_head_m <= 1000))
      and power_efficiency > 0 and power_efficiency <= 1
      and (power_max_kw is null or power_max_kw > 0)
      and (power_design_flow_m3s is null or power_design_flow_m3s > 0)
    );
  end if;
end $$;

comment on column public.stations.power_head_m is 'Tinggi jatuh efektif (m) untuk estimasi daya; kosong = estimasi nonaktif';
comment on column public.stations.power_efficiency is 'Efisiensi total turbin × generator (0–1)';
comment on column public.stations.power_max_kw is 'Kapasitas maksimal pembangkit (kW); estimasi tidak melebihi angka ini';
comment on column public.stations.power_design_flow_m3s is 'Debit desain turbin (m³/s); kelebihan debit dianggap melimpas';

-- ----------------------------------------------------------------------------
-- 2. RUMUS
-- ----------------------------------------------------------------------------
create or replace function public.estimate_power_kw(p_station_id uuid, p_flow_m3s float8)
returns float8
language sql
stable
set search_path = public
as $$
  select case
    when s.power_head_m is null or p_flow_m3s is null then null
    else round(least(
      9.81
        * least(greatest(p_flow_m3s, 0), coalesce(s.power_design_flow_m3s, 'Infinity'::float8))
        * s.power_head_m * s.power_efficiency,
      coalesce(s.power_max_kw, 'Infinity'::float8)
    )::numeric, 1)::float8
  end
  from public.stations s
  where s.id = p_station_id
$$;

comment on function public.estimate_power_kw is 'Estimasi daya (kW) dari debit dan parameter stasiun; null bila tinggi jatuh belum diisi';

-- ----------------------------------------------------------------------------
-- 3. TAG "DAYA ESTIMASI" UNTUK SETIAP STASIUN YANG PUNYA TAG DEBIT
-- ----------------------------------------------------------------------------
insert into public.tags (station_id, device_id, tag_id, name, description, value_type, unit, source_address,
                         alarm_low_low, alarm_low, alarm_high, alarm_high_high, deadband, display_precision)
select f.station_id, f.device_id, 'HYDRO.POWER_EST', 'Daya Estimasi',
       'Dihitung dari debit: 9,81 × debit × tinggi jatuh × efisiensi, dibatasi kapasitas maksimal',
       'float', 'kW', 'hitungan dari HYDRO.FLOW_RATE', null, null, null, null, 0, 1
from public.tags f
where f.tag_id = 'HYDRO.FLOW_RATE'
on conflict (station_id, tag_id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. HITUNG OTOMATIS SETIAP DATA DEBIT MASUK
-- ----------------------------------------------------------------------------
-- Trigger pada measurements (bukan di ingest_telemetry) agar berlaku untuk
-- semua jalur penyimpanan. Data hitungan mewarisi waktu dan quality debit.
create or replace function public.trg_estimate_power()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_power float8;
begin
  if not exists (
    select 1 from public.tags t
    where t.station_id = new.station_id and t.tag_id = 'HYDRO.POWER_EST' and t.enabled
  ) then
    return new;
  end if;

  v_power := public.estimate_power_kw(new.station_id, new.value);
  -- Tinggi jatuh belum diisi: estimasi nonaktif untuk stasiun ini.
  if v_power is null and new.value is not null then
    return new;
  end if;

  insert into public.measurements (tag_id, station_id, value, quality, source_timestamp, sequence_id, raw_value)
  values ('HYDRO.POWER_EST', new.station_id, v_power, new.quality, new.source_timestamp, new.sequence_id,
          format('debit=%s', new.value))
  on conflict (station_id, tag_id, source_timestamp) do nothing;
  return new;
end;
$$;

revoke execute on function public.trg_estimate_power() from public, anon, authenticated;

drop trigger if exists estimate_power_from_flow on public.measurements;
create trigger estimate_power_from_flow
  after insert on public.measurements
  for each row
  when (new.tag_id = 'HYDRO.FLOW_RATE')
  execute function public.trg_estimate_power();

-- ----------------------------------------------------------------------------
-- 5. PARAMETER PLTMH KINCANG (data operator, November 2026)
-- ----------------------------------------------------------------------------
-- Tinggi jatuh 4,7 m, kapasitas maksimal 320 kW, rata-rata 180–200 kW.
-- Efisiensi 0,8 adalah perkiraan awal; koreksi setelah energy meter terpasang.
update public.stations
set power_head_m = 4.7, power_efficiency = 0.8, power_max_kw = 320
where id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10' and power_head_m is null;

-- ----------------------------------------------------------------------------
-- 6. ISI MUNDUR 7 HARI TERAKHIR (agar grafik langsung terisi)
-- ----------------------------------------------------------------------------
insert into public.measurements (tag_id, station_id, value, quality, source_timestamp, sequence_id, raw_value)
select 'HYDRO.POWER_EST', m.station_id, public.estimate_power_kw(m.station_id, m.value), m.quality,
       m.source_timestamp, m.sequence_id, format('debit=%s', m.value)
from public.measurements m
join public.tags t on t.station_id = m.station_id and t.tag_id = 'HYDRO.POWER_EST' and t.enabled
join public.stations s on s.id = m.station_id and s.power_head_m is not null
where m.tag_id = 'HYDRO.FLOW_RATE'
  and m.source_timestamp > now() - interval '7 days'
on conflict (station_id, tag_id, source_timestamp) do nothing;
