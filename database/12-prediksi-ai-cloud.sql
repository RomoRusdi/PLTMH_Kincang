-- ============================================================================
-- 12 – PREDIKSI AI DI CLOUD (LSTM DIJALANKAN DI DALAM DATABASE)
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 11-prediksi-ai.sql. Aman dijalankan ulang.
-- Model dari AI Engineer dimasukkan dengan file 13-model-*.sql (dibuat dari
-- file ONNX oleh `npm run model-sql` di folder services).
--
-- Tidak butuh komputer PLTMH: pg_cron menjalankan run_ai_predictions() tiap
-- 5 menit. Fungsi itu mengambil 60 data per menit terakhir, menghitung LSTM
-- (bobot dari file ONNX, urutan gerbang ONNX i-o-f-c), lalu menyimpan 5
-- langkah prediksi ke tabel predictions. Aturannya sama dengan saat latih:
--   - data dikelompokkan per interval model (rata-rata bila lebih dari satu),
--   - urutan berhenti di jeda lebih dari max_gap_s,
--   - data terakhir lebih tua dari max_data_age_s tidak diprediksi,
--   - normalisasi MinMax dari data latih; masukan di luar rentang ditandai,
--   - hasil dibatasi 0 sampai kapasitas stasiun.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABEL MODEL
-- ----------------------------------------------------------------------------
create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  model text not null,
  version text not null,
  target_tag text not null default 'HYDRO.POWER_EST',
  -- [{"name": "level_m", "tag": "HYDRO.WATER_LEVEL", "source": "raw_value"}, ...]
  -- urut sama dengan kolom masukan saat latih. source 'raw_value' = nilai asli
  -- radar sebelum kalibrasi web.
  features jsonb not null,
  lookback integer not null check (lookback between 1 and 1440),
  horizon integer not null check (horizon between 1 and 120),
  interval_s integer not null check (interval_s between 1 and 3600),
  x_min float8[] not null,
  x_max float8[] not null,
  y_min float8 not null,
  y_max float8 not null,
  -- {"type": "lstm", "hidden": 32, "gate_order": "iofc", "W": [...], "R": [...], "B": [...],
  --  "dense": [{"in": 32, "out": 32, "W": [...], "B": [...], "activation": "relu"}, ...]}
  weights jsonb not null,
  max_gap_s integer not null default 120,
  max_data_age_s integer not null default 300,
  enabled boolean not null default true,
  training_range jsonb,
  metrics jsonb,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now(),
  constraint uq_ai_models_version unique (station_id, model, version),
  constraint ai_models_scaler_check check (
    cardinality(x_min) = jsonb_array_length(features) and cardinality(x_max) = jsonb_array_length(features) and y_max <> y_min
  )
);

comment on table public.ai_models is 'Model AI per stasiun (bobot dari ONNX AI Engineer); dijalankan pg_cron lewat run_ai_predictions()';
comment on column public.ai_models.last_status is 'Hasil eksekusi terakhir: ok, dilewati (alasan), atau error';

alter table public.ai_models enable row level security;
-- Tanpa policy: hanya postgres/service role (SQL Editor, pg_cron) yang bisa membaca dan mengubah.
revoke all on public.ai_models from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. HITUNG MODEL (LSTM + DENSE)
-- ----------------------------------------------------------------------------
create or replace function public.ai_jsonb_floats(p jsonb)
returns float8[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(e.v::float8 order by e.ord), '{}')
  from jsonb_array_elements_text(p) with ordinality as e(v, ord)
$$;

-- p_x = masukan ternormalisasi, rata [langkah waktu × fitur].
-- Keluaran = nilai target ternormalisasi untuk setiap langkah horizon.
create or replace function public.ai_model_forward(p_weights jsonb, p_x float8[], p_n_in integer)
returns float8[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_hidden integer := (p_weights->>'hidden')::integer;
  v_w float8[] := public.ai_jsonb_floats(p_weights->'W');
  v_r float8[] := public.ai_jsonb_floats(p_weights->'R');
  v_b float8[] := public.ai_jsonb_floats(p_weights->'B');
  v_steps integer := cardinality(p_x) / p_n_in;
  v_h float8[];
  v_c float8[];
  v_h_new float8[];
  v_z float8[];
  v_vec float8[];
  v_out float8[];
  v_layer jsonb;
  v_lw float8[];
  v_lb float8[];
  v_in integer;
  v_outn integer;
  v_s float8;
  v_i float8;
  v_o float8;
  v_f float8;
  v_g float8;
  t integer;
  g integer;
  j integer;
  k integer;
  u integer;
  xo integer;
begin
  if coalesce(p_weights->>'type', 'lstm') <> 'lstm' or coalesce(p_weights->>'gate_order', 'iofc') <> 'iofc' then
    raise exception 'Jenis model belum didukung: % (gerbang %)', p_weights->>'type', p_weights->>'gate_order';
  end if;
  if cardinality(v_w) <> 4 * v_hidden * p_n_in or cardinality(v_r) <> 4 * v_hidden * v_hidden or cardinality(v_b) <> 4 * v_hidden then
    raise exception 'Ukuran bobot LSTM tidak cocok dengan hidden % dan % fitur', v_hidden, p_n_in;
  end if;
  if v_steps * p_n_in <> cardinality(p_x) then
    raise exception 'Panjang masukan % bukan kelipatan % fitur', cardinality(p_x), p_n_in;
  end if;

  v_h := array_fill(0::float8, array[v_hidden]);
  v_c := array_fill(0::float8, array[v_hidden]);
  v_h_new := array_fill(0::float8, array[v_hidden]);
  v_z := array_fill(0::float8, array[4 * v_hidden]);

  for t in 0 .. v_steps - 1 loop
    xo := t * p_n_in;
    for g in 0 .. 4 * v_hidden - 1 loop
      v_s := v_b[g + 1];
      for j in 0 .. p_n_in - 1 loop
        v_s := v_s + v_w[g * p_n_in + j + 1] * p_x[xo + j + 1];
      end loop;
      for k in 0 .. v_hidden - 1 loop
        v_s := v_s + v_r[g * v_hidden + k + 1] * v_h[k + 1];
      end loop;
      v_z[g + 1] := greatest(least(v_s, 50), -50);
    end loop;
    -- Urutan gerbang ONNX: input, output, forget, cell.
    for u in 1 .. v_hidden loop
      v_i := 1 / (1 + exp(-v_z[u]));
      v_o := 1 / (1 + exp(-v_z[v_hidden + u]));
      v_f := 1 / (1 + exp(-v_z[2 * v_hidden + u]));
      v_g := tanh(v_z[3 * v_hidden + u]);
      v_c[u] := v_f * v_c[u] + v_i * v_g;
      v_h_new[u] := v_o * tanh(v_c[u]);
    end loop;
    v_h := v_h_new;
  end loop;

  v_vec := v_h;
  for v_layer in select value from jsonb_array_elements(coalesce(p_weights->'dense', '[]')) loop
    v_in := (v_layer->>'in')::integer;
    v_outn := (v_layer->>'out')::integer;
    v_lw := public.ai_jsonb_floats(v_layer->'W');
    v_lb := public.ai_jsonb_floats(v_layer->'B');
    if v_in <> cardinality(v_vec) or cardinality(v_lw) <> v_in * v_outn or cardinality(v_lb) <> v_outn then
      raise exception 'Ukuran lapisan dense tidak cocok (% masukan, % keluaran)', v_in, v_outn;
    end if;
    v_out := array_fill(0::float8, array[v_outn]);
    for k in 1 .. v_outn loop
      v_s := v_lb[k];
      for j in 1 .. v_in loop
        v_s := v_s + v_vec[j] * v_lw[(j - 1) * v_outn + k];
      end loop;
      if v_layer->>'activation' = 'relu' then
        v_s := greatest(v_s, 0);
      end if;
      v_out[k] := v_s;
    end loop;
    v_vec := v_out;
  end loop;

  return v_vec;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. SATU KALI PREDIKSI UNTUK SATU MODEL
-- ----------------------------------------------------------------------------
create or replace function public.run_ai_model(p_model_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_m public.ai_models;
  v_n integer;
  v_max_step integer;
  v_now timestamptz := now();
  v_bucket record;
  v_prev bigint;
  v_count integer := 0;
  v_base timestamptz;
  v_x float8[] := '{}';
  v_scaled float8;
  v_out_of_range text[] := '{}';
  v_y float8[];
  v_value float8;
  v_values float8[] := '{}';
  v_max_kw float8;
  v_status text;
  v_names text[];
  v_bucket_rows jsonb[] := '{}';
  i integer;
  j integer;
begin
  select * into v_m from public.ai_models where id = p_model_id;
  if not found then
    raise exception 'Model % tidak ditemukan', p_model_id;
  end if;

  v_n := jsonb_array_length(v_m.features);
  v_max_step := greatest(1, v_m.max_gap_s / v_m.interval_s);
  select array_agg(e->>'name' order by ord) into v_names
  from jsonb_array_elements(v_m.features) with ordinality as f(e, ord);

  -- Interval yang keempat fiturnya lengkap, terbaru dulu.
  for v_bucket in
    with feat as (
      select ord::integer as ord, e->>'tag' as tag, coalesce(e->>'source', 'value') as source
      from jsonb_array_elements(v_m.features) with ordinality as f(e, ord)
    ),
    raw as (
      select floor(extract(epoch from m.source_timestamp) / v_m.interval_s)::bigint as b,
             feat.ord,
             case
               when feat.source = 'raw_value' and m.raw_value ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$'
                 then m.raw_value::float8
               else m.value
             end as v,
             m.source_timestamp as ts
      from public.measurements m
      join feat on feat.tag = m.tag_id
      where m.station_id = v_m.station_id
        and m.quality = 'good'
        and m.source_timestamp >= v_now - make_interval(secs => (v_m.lookback + 15) * v_m.interval_s)
        and m.source_timestamp <= v_now + interval '5 minutes'
    ),
    per_feature as (
      select b, ord, avg(v) as v, max(ts) as ts from raw where v is not null group by b, ord
    )
    select b, array_agg(v order by ord) as vals, max(ts) as last_ts
    from per_feature
    group by b
    having count(*) = v_n
    order by b desc
  loop
    if v_prev is null then
      v_base := v_bucket.last_ts;
      if extract(epoch from (v_now - v_base)) > v_m.max_data_age_s then
        v_status := format('dilewati: data terakhir %s detik lalu (batas %s detik)', round(extract(epoch from (v_now - v_base))), v_m.max_data_age_s);
        exit;
      end if;
    elsif v_prev - v_bucket.b > v_max_step then
      exit;
    end if;
    v_bucket_rows := array_prepend(to_jsonb(v_bucket.vals), v_bucket_rows);
    v_count := v_count + 1;
    v_prev := v_bucket.b;
    exit when v_count >= v_m.lookback;
  end loop;

  if v_status is null and v_base is null then
    v_status := 'dilewati: belum ada data lengkap untuk semua fitur';
  elsif v_status is null and v_count < v_m.lookback then
    v_status := format('dilewati: baru %s dari %s data berurutan tanpa jeda > %s detik', v_count, v_m.lookback, v_m.max_gap_s);
  end if;
  if v_status is not null then
    update public.ai_models set last_run_at = v_now, last_status = v_status where id = v_m.id;
    return jsonb_build_object('model', v_m.model, 'version', v_m.version, 'status', v_status);
  end if;

  -- Normalisasi MinMax (urut lama → baru).
  for i in 1 .. v_count loop
    for j in 1 .. v_n loop
      v_scaled := ((v_bucket_rows[i]->>(j - 1))::float8 - v_m.x_min[j]) / (v_m.x_max[j] - v_m.x_min[j]);
      if (v_scaled < -0.05 or v_scaled > 1.05) and not (v_names[j] = any (v_out_of_range)) then
        v_out_of_range := v_out_of_range || v_names[j];
      end if;
      v_x := v_x || v_scaled;
    end loop;
  end loop;

  v_y := public.ai_model_forward(v_m.weights, v_x, v_n);
  if cardinality(v_y) < v_m.horizon then
    raise exception 'Keluaran model % angka, horizon %', cardinality(v_y), v_m.horizon;
  end if;

  select power_max_kw into v_max_kw from public.stations where id = v_m.station_id;
  for i in 1 .. v_m.horizon loop
    v_value := v_y[i] * (v_m.y_max - v_m.y_min) + v_m.y_min;
    v_value := greatest(0, case when v_max_kw > 0 then least(v_value, v_max_kw) else v_value end);
    v_values := v_values || round(v_value::numeric, 3)::float8;
    insert into public.predictions (station_id, tag_id, model, model_version, base_timestamp, target_timestamp, horizon_step, value, out_of_range)
    values (v_m.station_id, v_m.target_tag, v_m.model, v_m.version, v_base,
            v_base + make_interval(secs => i * v_m.interval_s), i, round(v_value::numeric, 3)::float8, cardinality(v_out_of_range) > 0)
    on conflict on constraint uq_predictions_run do nothing;
  end loop;

  v_status := format('ok: data terakhir %s WIB → %s kW%s',
    to_char(v_base at time zone 'Asia/Jakarta', 'HH24:MI:SS'),
    array_to_string(v_values, ', '),
    case when cardinality(v_out_of_range) > 0 then ' (di luar rentang latih: ' || array_to_string(v_out_of_range, ', ') || ')' else '' end);
  update public.ai_models set last_run_at = v_now, last_status = v_status where id = v_m.id;
  return jsonb_build_object('model', v_m.model, 'version', v_m.version, 'status', v_status);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. SEMUA MODEL AKTIF (dipanggil pg_cron)
-- ----------------------------------------------------------------------------
create or replace function public.run_ai_predictions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_result jsonb;
  v_all jsonb := '[]';
begin
  for v_id in select id from public.ai_models where enabled order by station_id, model loop
    begin
      v_result := public.run_ai_model(v_id);
    exception when others then
      v_result := jsonb_build_object('model_id', v_id, 'status', 'error: ' || sqlerrm);
      update public.ai_models set last_run_at = now(), last_status = 'error: ' || sqlerrm where id = v_id;
    end;
    v_all := v_all || v_result;
  end loop;
  return v_all;
end;
$$;

comment on function public.run_ai_predictions is 'Jalankan semua model AI aktif sekali; dijadwalkan pg_cron tiap 5 menit';

revoke execute on function public.ai_model_forward(jsonb, float8[], integer) from public, anon, authenticated;
revoke execute on function public.run_ai_model(uuid) from public, anon, authenticated;
revoke execute on function public.run_ai_predictions() from public, anon, authenticated;
grant execute on function public.run_ai_predictions() to service_role;

-- ----------------------------------------------------------------------------
-- 5. JADWAL
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rfg-ai-predictions', '*/5 * * * *', $cron$select public.run_ai_predictions()$cron$);
  else
    raise notice 'pg_cron belum aktif: jalankan select public.run_ai_predictions() secara manual.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Cek (jalankan kapan saja):
--
--   select model, version, enabled, last_run_at at time zone 'Asia/Jakarta' as terakhir_wib, last_status
--   from public.ai_models order by station_id, model, version;
--
--   select public.run_ai_predictions();   -- jalankan sekarang tanpa menunggu jadwal
-- ============================================================================
