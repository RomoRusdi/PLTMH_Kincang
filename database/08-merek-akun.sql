-- ============================================================================
-- 08 – MEREK KHUSUS PER AKUN (WHITE-LABEL)
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 07-seed.sql. Aman dijalankan ulang.
--
-- Akun tertentu (mis. kincang@admin.com) melihat dashboard dengan nama dan
-- logo perusahaan lain (PT. Naluri Energi Utama) tanpa menyebut Digihydrotek.
-- Akun lain, termasuk admin/operator lain di stasiun yang sama, tetap melihat
-- Digihydrotek. Peran dan hak akses akun tidak berubah.
--
-- Merek HANYA bisa diatur dari Supabase (SQL Editor). Perubahan dari web,
-- termasuk oleh superadmin, ditolak.
-- ============================================================================

-- Bersihkan versi awal (merek per stasiun) bila sempat dijalankan.
drop trigger if exists protect_station_brand on public.stations;
drop function if exists public.trg_protect_station_brand();
alter table public.stations drop column if exists brand_name;
alter table public.stations drop column if exists brand_logo_url;

alter table public.profiles add column if not exists brand_name text;
alter table public.profiles add column if not exists brand_logo_url text;

comment on column public.profiles.brand_name is 'Nama perusahaan yang tampil di dashboard akun ini; kosong = Digihydrotek. Diatur dari SQL Editor.';
comment on column public.profiles.brand_logo_url is 'Alamat logo, mis. /images/brands/naluri-energi.png; kosong = inisial nama';

create or replace function public.trg_protect_profile_brand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() terisi = perubahan datang dari web (pengguna login).
  if auth.uid() is not null
     and (new.brand_name is distinct from old.brand_name or new.brand_logo_url is distinct from old.brand_logo_url) then
    raise exception 'Merek akun hanya dapat diatur dari Supabase (SQL Editor)';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_brand on public.profiles;
create trigger protect_profile_brand
  before update on public.profiles
  for each row execute function public.trg_protect_profile_brand();

-- Akun admin PLTMH Kincang → PT. Naluri Energi Utama (juga memperbarui nama
-- lama "PT. Naluri Energi" bila versi sebelumnya sempat dijalankan).
update public.profiles
set brand_name = 'PT. Naluri Energi Utama',
    brand_logo_url = '/images/brands/naluri-energi.png'
where id = (select id from auth.users where email = 'kincang@admin.com')
  and (brand_name is null or brand_name = 'PT. Naluri Energi');

-- ----------------------------------------------------------------------------
-- Cara mengatur merek akun lain (jalankan di SQL Editor):
--
--   update public.profiles
--   set brand_name = 'Nama Perusahaan', brand_logo_url = '/images/brands/logo.png'
--   where id = (select id from auth.users where email = 'akun@contoh.com');
--
-- Kembali ke Digihydrotek: set brand_name = null, brand_logo_url = null.
-- Daftar akun bermerek khusus:
--   select email, role, brand_name, brand_logo_url from public.profiles where brand_name is not null;
-- ----------------------------------------------------------------------------
