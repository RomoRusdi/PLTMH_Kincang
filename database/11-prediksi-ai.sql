-- ============================================================================
-- 11 – PREDIKSI AI (LSTM)
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 10-stasiun-singgi.sql. Aman dijalankan ulang.
--
-- Hasil prediksi modul AI (AI Engineer) disimpan di tabel predictions oleh
-- worker prediksi (services/src/predict.ts) yang memakai service role key di
-- komputer PLTMH. Browser hanya bisa membaca; tidak ada yang bisa menulis
-- prediksi dari web.
--
-- Satu kali inferensi = satu baris per langkah horizon (model saat ini: 5
-- langkah × 1 menit dari 60 data per menit terakhir).
-- ============================================================================

create table if not exists public.predictions (
  id bigserial primary key,
  station_id uuid not null references public.stations(id) on delete cascade,
  tag_id text not null default 'HYDRO.POWER_EST',
  model text not null,
  model_version text not null,
  base_timestamp timestamptz not null,
  target_timestamp timestamptz not null,
  horizon_step smallint not null check (horizon_step between 1 and 120),
  value float8 not null check (value >= 0),
  unit text not null default 'kW',
  out_of_range boolean not null default false,
  created_at timestamptz not null default now(),
  constraint predictions_target_after_base check (target_timestamp > base_timestamp),
  constraint uq_predictions_run unique (station_id, tag_id, model, model_version, base_timestamp, horizon_step)
);

comment on table public.predictions is 'Hasil prediksi modul AI; ditulis worker prediksi (service role), dibaca dashboard';
comment on column public.predictions.model is 'Nama model, mis. LSTM';
comment on column public.predictions.model_version is 'Versi model dari file metadata AI Engineer';
comment on column public.predictions.base_timestamp is 'Waktu data terakhir yang menjadi masukan model';
comment on column public.predictions.target_timestamp is 'Waktu yang diprediksi (base + langkah × interval)';
comment on column public.predictions.horizon_step is 'Langkah ke-n dari prediksi (1 = langkah pertama)';
comment on column public.predictions.out_of_range is 'Ada masukan di luar rentang data latih model (hasil kurang dapat dipercaya)';

create index if not exists idx_predictions_station_target
  on public.predictions (station_id, tag_id, target_timestamp desc);
create index if not exists idx_predictions_station_base
  on public.predictions (station_id, base_timestamp desc);

alter table public.predictions enable row level security;

drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions
  for select to authenticated using (public.current_user_can_access_station(station_id));

-- Tidak ada policy insert/update/delete: hanya service role (worker) yang menulis.
revoke insert, update, delete, truncate on public.predictions from anon, authenticated;
revoke all on public.predictions from anon;

-- ----------------------------------------------------------------------------
-- Akurasi per langkah horizon: prediksi dibandingkan dengan nilai aktual tag
-- yang sama pada waktu target (data GOOD terdekat dalam ±30 detik).
-- MAPE hanya dari data aktual > 1 kW agar tidak meledak saat turbin berhenti.
-- ----------------------------------------------------------------------------
create or replace function public.get_prediction_accuracy(
  p_station_id uuid,
  p_hours integer default 24,
  p_tag_id text default 'HYDRO.POWER_EST'
)
returns table (
  model text,
  model_version text,
  horizon_step smallint,
  sample_count bigint,
  mae float8,
  rmse float8,
  mape float8
)
language sql
stable
security invoker
set search_path = public
as $$
  with paired as (
    select p.model, p.model_version, p.horizon_step, p.value as predicted, actual.value as actual
    from public.predictions p
    join lateral (
      select m.value
      from public.measurements m
      where m.station_id = p.station_id
        and m.tag_id = p.tag_id
        and m.quality = 'good'
        and m.value is not null
        and m.source_timestamp between p.target_timestamp - interval '30 seconds'
                                   and p.target_timestamp + interval '30 seconds'
      order by abs(extract(epoch from (m.source_timestamp - p.target_timestamp)))
      limit 1
    ) actual on true
    where p.station_id = p_station_id
      and p.tag_id = p_tag_id
      and p.target_timestamp >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 31)))
      and p.target_timestamp <= now()
  )
  select model, model_version, horizon_step,
         count(*) as sample_count,
         avg(abs(predicted - actual)) as mae,
         sqrt(avg((predicted - actual) ^ 2)) as rmse,
         avg(abs(predicted - actual) / actual) filter (where actual > 1) * 100 as mape
  from paired
  group by model, model_version, horizon_step
  order by model, model_version, horizon_step;
$$;

comment on function public.get_prediction_accuracy is
  'MAE, RMSE (satuan tag) dan MAPE (%) prediksi AI per langkah horizon dalam p_hours jam terakhir';

revoke execute on function public.get_prediction_accuracy(uuid, integer, text) from public, anon;
grant execute on function public.get_prediction_accuracy(uuid, integer, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Retensi: prediksi lebih tua dari 90 hari dihapus tiap hari (bila pg_cron aktif).
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'rfg-prediction-retention',
      '45 2 * * *',
      $cron$delete from public.predictions where target_timestamp < now() - interval '90 days'$cron$
    );
  else
    raise notice 'pg_cron belum aktif: hapus prediksi lama secara manual bila perlu.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Cek setelah worker berjalan:
--
--   select model, model_version, base_timestamp at time zone 'Asia/Jakarta' as data_terakhir_wib,
--          horizon_step, target_timestamp at time zone 'Asia/Jakarta' as target_wib,
--          round(value::numeric, 1) as kw, out_of_range
--   from public.predictions
--   where station_id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10'
--   order by base_timestamp desc, horizon_step
--   limit 10;
--
--   select * from public.get_prediction_accuracy('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', 24);
-- ============================================================================
