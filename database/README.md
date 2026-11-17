# Database Digihydrotek (Supabase / PostgreSQL)

Semua file dijalankan lewat **Supabase → SQL Editor**: buka file, salin seluruh
isinya, tempel, lalu **Run**. File bernomor dijalankan berurutan; semuanya
aman dijalankan ulang.

| File | Isi |
|---|---|
| `01-schema.sql` | Tabel, view, fungsi ingest, alarm, keamanan (RLS), jadwal pg_cron |
| `02-multistasiun-kalibrasi.sql` | Tag per stasiun, kalibrasi radar berversi |
| `03-ringkasan-stasiun.sql` | Halaman Ringkasan Stasiun, interval kalibrasi ulang |
| `04-interval-retensi.sql` | Interval 60 detik, ringkasan per jam, retensi data 3 bulan |
| `05-estimasi-daya.sql` | Daya dihitung dari debit (tag `HYDRO.POWER_EST`) |
| `06-manajemen-pengguna.sql` | Admin per stasiun, halaman Pengguna |
| `07-seed.sql` | Stasiun PLTMH Kincang, perangkat, dan tag |
| `08-merek-akun.sql` | Merek khusus per akun: kincang@admin.com melihat PT. Naluri Energi Utama (diatur dari SQL Editor) |
| `09-daya-tabel-pltmh.sql` | Rumus daya sesuai tabel produksi PLTMH: rated head per bulan, efisiensi turbin × generator, rencana produksi kWh |
| `10-stasiun-singgi.sql` | Stasiun PLTM Singgi (1 × 200 kW): radar, PC gateway, tag radar, tabel rencana produksi 2026. Koreksi K ada di radar, jadi jangan dikalibrasi lagi dari web |
| `11-prediksi-ai.sql` | Tabel `predictions` untuk hasil model AI (ditulis fungsi prediksi di 12, web hanya membaca) dan fungsi akurasi per langkah horizon |
| `12-prediksi-ai-cloud.sql` | Prediksi AI dijalankan di database: tabel `ai_models`, hitung LSTM, jadwal pg_cron tiap 5 menit (tanpa komputer PLTMH) |
| `13-model-lstm-kincang.sql` | Model LSTM Kincang dari AI Engineer (dibuat otomatis oleh `npm run model-sql`); mengecek hasil terhadap Colab sebelum dipasang |
| `demo-history.sql` | Opsional: riwayat dummy 3 hari untuk grafik |
| `demo-5-stasiun.sql` | Opsional: 4 stasiun [DEMO] tambahan; hapus sebelum dipakai operasional |

## Project Supabase baru

1. Jalankan `01` sampai `13` berurutan.
2. Deploy Edge Function `supabase/functions/admin-users` (Edge Functions →
   Deploy a new function → Via Editor → nama `admin-users`). Dipakai halaman
   **Pengguna** untuk membuat akun.
3. Matikan pendaftaran publik: Authentication → Sign In / Providers →
   nonaktifkan *Allow new users to sign up*.
4. Buat superadmin pertama di Authentication → Users → Add user (centang
   *Auto Confirm User*), lalu:

   ```sql
   update public.profiles
   set role = 'superadmin', full_name = 'Superadmin Digihydrotek'
   where id = (select id from auth.users where email = 'digihydrotek@superadmin.com');
   ```

   Akun lain dibuat dari halaman **Pengguna** di web.

## Database yang sudah berjalan

Jalankan hanya file bernomor yang belum pernah dijalankan. Untuk mengecek:

```sql
select 'tabel kalibrasi (02)' as cek, (to_regclass('public.station_calibrations') is not null)::text as sudah
union all select 'ringkasan stasiun (03)', (to_regclass('public.station_overview') is not null)::text
union all select 'retensi (04)', (to_regclass('public.measurements_hourly') is not null)::text
union all select 'estimasi daya (05)', (exists (select 1 from information_schema.columns where table_name = 'stations' and column_name = 'power_head_m'))::text
union all select 'manajemen pengguna (06)', (exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'email'))::text
union all select 'merek akun (08)', (exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'brand_name'))::text
union all select 'daya tabel PLTMH (09)', (to_regclass('public.station_power_monthly') is not null)::text
union all select 'stasiun Singgi (10)', (exists (select 1 from public.stations where id = '017b0c85-42ea-4283-ae91-e6343368b854'))::text
union all select 'prediksi AI (11)', (to_regclass('public.predictions') is not null)::text
union all select 'prediksi AI cloud (12)', (to_regclass('public.ai_models') is not null)::text
union all select 'model LSTM Kincang (13)', (exists (select 1 from public.ai_models where enabled))::text;
```

## Catatan

- File ini hanya berisi struktur dan aturan, tanpa password atau key, sehingga
  aman disimpan di GitHub.
- `09` menggantikan rumus daya di `05`. Bila `05` dijalankan ulang, jalankan
  `09` lagi sesudahnya.
- Ukuran data telemetri dapat dipantau dengan query di akhir
  `04-interval-retensi.sql`.
