-- ============================================================================
-- MIGRASI 004 – INTERVAL 60 DETIK & RETENSI DATA 3 BULAN
-- ============================================================================
-- Jalankan di SQL Editor SETELAH migrasi 003. Aman dijalankan ulang.
--
-- Latar belakang: satu baris measurements ±300 byte (termasuk indeks).
-- Pada interval 5 detik × 15 tag, satu stasiun menghasilkan ±77 MB/hari.
-- Interval 60 detik menurunkannya menjadi ±6,4 MB/hari per stasiun.
--
-- Isi:
--   1. Interval pemindaian perangkat menjadi 60 detik (dipakai deteksi data
--      stale / perangkat offline: 3 × interval = 3 menit).
--   2. Tabel measurements_hourly: ringkasan rata-rata/min/maks per jam.
--   3. Fungsi retensi: data detail lebih tua dari 3 bulan diringkas ke
--      measurements_hourly lalu partisi bulanannya dihapus (pg_cron harian).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. INTERVAL PEMINDAIAN 60 DETIK
-- ----------------------------------------------------------------------------
alter table public.devices alter column scan_interval_sec set default 60;
update public.devices set scan_interval_sec = 60 where scan_interval_sec < 60;

-- ----------------------------------------------------------------------------
-- 2. RINGKASAN PER JAM (disimpan jangka panjang)
-- ----------------------------------------------------------------------------
create table if not exists public.measurements_hourly (
  station_id uuid not null references public.stations(id) on delete cascade,
  tag_id text not null,
  bucket timestamptz not null,
  avg_value float8,
  min_value float8,
  max_value float8,
  sample_count integer not null,
  primary key (station_id, tag_id, bucket)
);

comment on table public.measurements_hourly is
  'Ringkasan per jam (hanya data GOOD) dari measurements yang sudah melewati masa retensi';

alter table public.measurements_hourly enable row level security;

drop policy if exists measurements_hourly_select on public.measurements_hourly;
create policy measurements_hourly_select on public.measurements_hourly
  for select to authenticated using (public.current_user_can_access_station(station_id));

-- ----------------------------------------------------------------------------
-- 3. RETENSI
-- ----------------------------------------------------------------------------
-- Partisi bulanan yang seluruh isinya lebih tua dari batas retensi diringkas
-- per jam lalu dihapus. Menghapus partisi jauh lebih ringan daripada DELETE
-- jutaan baris. Partisi default dibersihkan dengan DELETE biasa.
create or replace function public.apply_measurement_retention(p_keep_months integer default 3)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := date_trunc('month', now() - make_interval(months => p_keep_months));
  v_part record;
  v_month date;
  v_rows bigint;
  v_dropped text[] := '{}';
  v_rolled bigint := 0;
begin
  if p_keep_months < 1 then
    raise exception 'Retensi minimal 1 bulan';
  end if;

  for v_part in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'public.measurements'::regclass
      and c.relname ~ '^measurements_\d{4}_\d{2}$'
  loop
    v_month := to_date(substring(v_part.relname from 14), 'YYYY_MM');
    -- Partisi berakhir pada awal bulan berikutnya; hapus bila sudah < batas.
    continue when (v_month + interval '1 month') > v_cutoff;

    execute format($q$
      insert into public.measurements_hourly (station_id, tag_id, bucket, avg_value, min_value, max_value, sample_count)
      select station_id, tag_id, date_trunc('hour', source_timestamp), avg(value), min(value), max(value), count(*)
      from public.%I
      where quality = 'good' and station_id is not null
      group by station_id, tag_id, date_trunc('hour', source_timestamp)
      on conflict (station_id, tag_id, bucket) do nothing
    $q$, v_part.relname);
    get diagnostics v_rows = row_count;
    v_rolled := v_rolled + v_rows;

    execute format('drop table public.%I', v_part.relname);
    v_dropped := v_dropped || v_part.relname;
  end loop;

  -- Data yang sempat jatuh ke partisi default.
  insert into public.measurements_hourly (station_id, tag_id, bucket, avg_value, min_value, max_value, sample_count)
  select station_id, tag_id, date_trunc('hour', source_timestamp), avg(value), min(value), max(value), count(*)
  from public.measurements_default
  where quality = 'good' and station_id is not null and source_timestamp < v_cutoff
  group by station_id, tag_id, date_trunc('hour', source_timestamp)
  on conflict (station_id, tag_id, bucket) do nothing;
  get diagnostics v_rows = row_count;
  v_rolled := v_rolled + v_rows;
  delete from public.measurements_default where source_timestamp < v_cutoff;

  return jsonb_build_object('cutoff', v_cutoff, 'dropped_partitions', v_dropped, 'hourly_rows', v_rolled);
end;
$$;

comment on function public.apply_measurement_retention is
  'Ringkas data detail lebih tua dari p_keep_months ke measurements_hourly lalu hapus partisinya';

revoke execute on function public.apply_measurement_retention(integer) from public, anon, authenticated;
grant execute on function public.apply_measurement_retention(integer) to service_role;

-- Jadwal harian (jika pg_cron aktif). Ubah angka 3 untuk retensi lain.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'rfg-measurement-retention',
      '30 2 * * *',
      $cron$select public.apply_measurement_retention(3)$cron$
    );
  else
    raise notice 'pg_cron belum aktif: jalankan apply_measurement_retention(3) secara manual.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Pemantauan ukuran (jalankan kapan saja di SQL Editor):
--
--   select pg_size_pretty(sum(pg_total_relation_size(c.oid))) as ukuran_measurements
--   from pg_inherits i join pg_class c on c.oid = i.inhrelid
--   where i.inhparent = 'public.measurements'::regclass;
-- ----------------------------------------------------------------------------
