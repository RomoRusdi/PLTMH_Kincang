-- ============================================================================
-- MIGRASI 006 – MANAJEMEN PENGGUNA & ADMIN PER STASIUN
-- ============================================================================
-- Jalankan di SQL Editor SETELAH migrasi 005. Aman dijalankan ulang.
--
-- Isi:
--   1. Email disimpan di profiles agar daftar pengguna bisa ditampilkan.
--   2. Admin hanya melihat pengguna yang berbagi stasiun dengannya;
--      superadmin melihat semua.
--   3. Hanya superadmin yang boleh membuat stasiun baru.
--   4. Pengaman: superadmin aktif terakhir tidak bisa diturunkan/dinonaktifkan,
--      dan email di profiles tidak bisa diubah sendiri oleh pengguna.
--
-- Pembuatan akun dilakukan Edge Function `admin-users` (folder
-- supabase/functions/admin-users) karena butuh service role key.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EMAIL DI PROFILES
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, nullif(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. ADMIN HANYA MELIHAT PENGGUNA DI STASIUNNYA
-- ----------------------------------------------------------------------------
-- Fungsi security definer agar policy profiles tidak membaca profiles
-- secara rekursif.
create or replace function public.current_user_station_ids()
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.station_access from public.profiles p where p.id = auth.uid() and p.is_active),
    '{}'::uuid[]
  );
$$;

revoke execute on function public.current_user_station_ids() from public, anon;
grant execute on function public.current_user_station_ids() to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.has_min_role('superadmin')
    or (public.has_min_role('admin') and station_access && public.current_user_station_ids())
  );

-- ----------------------------------------------------------------------------
-- 3. STASIUN BARU HANYA OLEH SUPERADMIN
-- ----------------------------------------------------------------------------
drop policy if exists stations_insert on public.stations;
create policy stations_insert on public.stations
  for insert to authenticated with check (public.has_min_role('superadmin'));

-- ----------------------------------------------------------------------------
-- 4. PENGAMAN PERUBAHAN PROFIL
-- ----------------------------------------------------------------------------
create or replace function public.trg_protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Jangan sampai sistem kehilangan superadmin aktif terakhir (berlaku juga
  -- untuk SQL Editor dan Edge Function).
  if old.role = 'superadmin' and old.is_active
     and (new.role is distinct from 'superadmin' or not new.is_active)
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.role = 'superadmin' and p.is_active
     ) then
    raise exception 'Tidak bisa menurunkan atau menonaktifkan superadmin aktif terakhir';
  end if;

  -- SQL Editor / service_role tidak membawa JWT user: dianggap administrasi.
  if auth.uid() is null then
    return new;
  end if;

  if (new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.station_access is distinct from old.station_access
      or new.is_active is distinct from old.is_active
      or new.email is distinct from old.email)
     and not public.has_min_role('superadmin') then
    raise exception 'Hanya superadmin yang dapat mengubah role, akses stasiun, status, atau email akun';
  end if;

  -- Superadmin pun tidak boleh mengubah peran atau menonaktifkan akunnya sendiri
  -- dari web, agar tidak terkunci tanpa sengaja.
  if new.id = auth.uid() and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'Peran dan status akun sendiri tidak dapat diubah';
  end if;

  return new;
end;
$$;

-- Audit: sertakan email akun yang diubah agar mudah dibaca di Audit Events.
create or replace function public.trg_audit_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text;
begin
  if old.role is distinct from new.role
     or old.is_active is distinct from new.is_active
     or old.station_access is distinct from new.station_access then
    select email into v_actor_email from auth.users where id = auth.uid();

    insert into public.events (
      event_type, severity, message, actor_id, actor_email, old_value, new_value, metadata
    ) values (
      'user_change', 'warning',
      format('Akun %s diubah', coalesce(new.email, new.id::text)),
      auth.uid(), v_actor_email,
      format('role=%s,active=%s,stasiun=%s', old.role, old.is_active, cardinality(old.station_access)),
      format('role=%s,active=%s,stasiun=%s', new.role, new.is_active, cardinality(new.station_access)),
      jsonb_build_object('profile_id', new.id)
    );
  end if;

  return new;
end;
$$;
