-- ============================================================================
-- 09 – ESTIMASI DAYA SESUAI TABEL PRODUKSI PLTMH
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 08-merek-akun.sql. Aman dijalankan ulang.
-- Menggantikan rumus di 05-estimasi-daya.sql (bila 05 dijalankan ulang,
-- jalankan file ini lagi sesudahnya).
--
-- Rumus mengikuti tabel rencana produksi PLTMH Kincang:
--
--   daya mampu (kW)   j = 9,8 × f × g × h × i
--     f = debit terpakai (m³/s)  → debit terukur radar, dibatasi debit desain
--     g = rated head bulan itu (m)
--     h = efisiensi turbin, i = efisiensi generator
--   produksi (kWh)    n = j × (hari − hari pengeringan − hari pemeliharaan) × 24
--
-- Daya tetap dibatasi kapasitas terpasang (320 kW). Pada tabel, f diisi
-- debit rencana PSDA; di sistem, f diisi debit yang benar-benar terukur.
-- Debit PSDA tetap disimpan untuk tabel rencana produksi di menu Pengaturan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EFISIENSI TURBIN DAN GENERATOR
-- ----------------------------------------------------------------------------
alter table public.stations add column if not exists power_turbine_efficiency float8;
alter table public.stations add column if not exists power_generator_efficiency float8;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stations_power_efficiency_split_check') then
    alter table public.stations add constraint stations_power_efficiency_split_check check (
      (power_turbine_efficiency is null or (power_turbine_efficiency > 0 and power_turbine_efficiency <= 1))
      and (power_generator_efficiency is null or (power_generator_efficiency > 0 and power_generator_efficiency <= 1))
    );
  end if;
end $$;

comment on column public.stations.power_turbine_efficiency is 'Efisiensi turbin (0–1); bila turbin dan generator diisi, menggantikan power_efficiency';
comment on column public.stations.power_generator_efficiency is 'Efisiensi generator (0–1)';

-- ----------------------------------------------------------------------------
-- 2. PARAMETER BULANAN (rated head, debit PSDA, hari tidak produksi)
-- ----------------------------------------------------------------------------
create table if not exists public.station_power_monthly (
  station_id uuid not null references public.stations(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  head_m float8 check (head_m is null or (head_m > 0 and head_m <= 1000)),
  permit_flow_m3s float8 check (permit_flow_m3s is null or permit_flow_m3s >= 0),
  drying_days smallint not null default 0 check (drying_days between 0 and 31),
  maintenance_days smallint not null default 0 check (maintenance_days between 0 and 31),
  updated_at timestamptz not null default now(),
  primary key (station_id, month)
);

comment on table public.station_power_monthly is 'Parameter per bulan dari tabel rencana produksi: rated head, debit rencana PSDA, hari pengeringan dan pemeliharaan';
comment on column public.station_power_monthly.head_m is 'Rated head bulan ini (m); kosong = memakai stations.power_head_m';
comment on column public.station_power_monthly.permit_flow_m3s is 'Debit rencana PSDA (m³/s); dipakai untuk rencana produksi, bukan untuk membatasi estimasi';

alter table public.station_power_monthly enable row level security;

drop policy if exists station_power_monthly_select on public.station_power_monthly;
create policy station_power_monthly_select on public.station_power_monthly
  for select to authenticated using (public.current_user_can_access_station(station_id));

drop policy if exists station_power_monthly_write on public.station_power_monthly;
create policy station_power_monthly_write on public.station_power_monthly
  for all to authenticated
  using (public.has_min_role('admin') and public.current_user_can_access_station(station_id))
  with check (public.has_min_role('admin') and public.current_user_can_access_station(station_id));

-- ----------------------------------------------------------------------------
-- 3. RUMUS
-- ----------------------------------------------------------------------------
-- Bulan ditentukan dari waktu pengukuran dalam WIB.
create or replace function public.estimate_power_kw_at(p_station_id uuid, p_flow_m3s float8, p_at timestamptz)
returns float8
language sql
stable
set search_path = public
as $$
  select case
    when p_flow_m3s is null or coalesce(pm.head_m, s.power_head_m) is null then null
    else round(least(
      9.8
        * least(greatest(p_flow_m3s, 0), coalesce(s.power_design_flow_m3s, 'Infinity'::float8))
        * coalesce(pm.head_m, s.power_head_m)
        * coalesce(s.power_turbine_efficiency * s.power_generator_efficiency, s.power_efficiency),
      coalesce(s.power_max_kw, 'Infinity'::float8)
    )::numeric, 1)::float8
  end
  from public.stations s
  left join public.station_power_monthly pm
    on pm.station_id = s.id
   and pm.month = extract(month from p_at at time zone 'Asia/Jakarta')::smallint
  where s.id = p_station_id
$$;

comment on function public.estimate_power_kw_at is 'Daya (kW) = 9,8 × debit × rated head bulan itu × η turbin × η generator, dibatasi debit desain dan kapasitas';

-- Versi lama (tanpa waktu) tetap ada untuk pemanggil lama; memakai bulan sekarang.
create or replace function public.estimate_power_kw(p_station_id uuid, p_flow_m3s float8)
returns float8
language sql
stable
set search_path = public
as $$
  select public.estimate_power_kw_at(p_station_id, p_flow_m3s, now())
$$;

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

  v_power := public.estimate_power_kw_at(new.station_id, new.value, new.source_timestamp);
  -- Rated head belum diisi: estimasi nonaktif untuk stasiun ini.
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

update public.tags
set description = 'Dihitung dari debit: 9,8 × debit × rated head × η turbin × η generator, dibatasi kapasitas terpasang'
where tag_id = 'HYDRO.POWER_EST';

-- ----------------------------------------------------------------------------
-- 4. DATA PLTMH KINCANG (tabel rencana produksi dari operator)
-- ----------------------------------------------------------------------------
-- Daya terpasang 320 kW, debit sesuai FS kontrak 8,2 m³/s, efisiensi turbin
-- 0,91 dan generator 0,93. Baris bulanan tidak ditimpa bila sudah diubah.
update public.stations
set power_turbine_efficiency = 0.91,
    power_generator_efficiency = 0.93,
    power_efficiency = round((0.91 * 0.93)::numeric, 4)::float8,
    power_max_kw = coalesce(power_max_kw, 320),
    power_design_flow_m3s = coalesce(power_design_flow_m3s, 8.2),
    power_head_m = coalesce(power_head_m, 4.75)
where id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10'
  and power_turbine_efficiency is null;

insert into public.station_power_monthly (station_id, month, head_m, permit_flow_m3s, drying_days, maintenance_days)
select s.id, v.month, v.head_m, v.permit_flow, v.drying, v.maintenance
from public.stations s
cross join (values
  (1::smallint,  4.80::float8, 4.90::float8,  0::smallint, 2::smallint),
  (2,  4.80, 4.90,  0, 2),
  (3,  5.00, 4.90,  0, 2),
  (4,  5.00, 5.00,  0, 2),
  (5,  5.00, 5.00,  0, 2),
  (6,  5.00, 5.00,  0, 2),
  (7,  5.00, 5.00,  0, 2),
  (8,  4.75, 3.50, 14, 0),
  (9,  4.75, 3.50, 14, 0),
  (10, 4.75, 3.50, 14, 0),
  (11, 4.75, 5.00,  0, 2),
  (12, 4.75, 5.00,  0, 2)
) as v(month, head_m, permit_flow, drying, maintenance)
where s.id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10'
on conflict (station_id, month) do nothing;

-- ----------------------------------------------------------------------------
-- 5. HITUNG ULANG DAYA ESTIMASI 30 HARI TERAKHIR DENGAN RUMUS BARU
-- ----------------------------------------------------------------------------
update public.measurements p
set value = public.estimate_power_kw_at(f.station_id, f.value, f.source_timestamp)
from public.measurements f
where p.tag_id = 'HYDRO.POWER_EST'
  and f.tag_id = 'HYDRO.FLOW_RATE'
  and f.station_id = p.station_id
  and f.source_timestamp = p.source_timestamp
  and p.source_timestamp > now() - interval '30 days'
  and f.value is not null;

-- ----------------------------------------------------------------------------
-- Cek: hasil harus sama dengan kolom "Daya mampu" tabel PLTMH
-- (Januari 195, April 207, Agustus 138, November 197 kW).
--
--   select pm.month, pm.head_m, pm.permit_flow_m3s,
--          public.estimate_power_kw_at(pm.station_id, pm.permit_flow_m3s,
--            make_timestamptz(2026, pm.month, 15, 12, 0, 0, 'Asia/Jakarta')) as daya_kw
--   from public.station_power_monthly pm order by pm.month;
-- ----------------------------------------------------------------------------
