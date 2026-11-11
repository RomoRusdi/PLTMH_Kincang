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
| `demo-history.sql` | Opsional: riwayat dummy 3 hari untuk grafik |
| `demo-5-stasiun.sql` | Opsional: 4 stasiun [DEMO] tambahan; hapus sebelum dipakai operasional |

## Project Supabase baru

1. Jalankan `01` sampai `07` berurutan.
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
union all select 'manajemen pengguna (06)', (exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'email'))::text;
```

## Catatan

- File ini hanya berisi struktur dan aturan, tanpa password atau key, sehingga
  aman disimpan di GitHub.
- Ukuran data telemetri dapat dipantau dengan query di akhir
  `04-interval-retensi.sql`.
