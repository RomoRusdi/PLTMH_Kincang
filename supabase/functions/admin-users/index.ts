// ============================================================================
// Edge Function: admin-users
// Membuat akun dan mengganti password pengguna. Butuh service role key, jadi
// tidak bisa dilakukan langsung dari browser. Hanya superadmin aktif yang
// boleh memanggil fungsi ini.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function →
// Via Editor → nama "admin-users" → tempel isi file ini → Deploy.
// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY sudah tersedia otomatis.
//
// Body (JSON):
//   { "action": "create", "email", "password", "full_name", "role", "station_access": [uuid] }
//   { "action": "set_password", "user_id", "password" }
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ROLES = ['superadmin', 'admin', 'operator', 'technician', 'viewer'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Gunakan metode POST' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Pastikan pemanggil adalah superadmin aktif.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: { user: caller }, error: authError } = await admin.auth.getUser(token)
  if (authError || !caller) return json({ error: 'Sesi tidak valid. Silakan masuk ulang.' }, 401)
  const { data: callerProfile } = await admin.from('profiles').select('role, is_active').eq('id', caller.id).single()
  if (!callerProfile?.is_active || callerProfile.role !== 'superadmin') {
    return json({ error: 'Hanya superadmin yang dapat mengelola akun.' }, 403)
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const action = body?.action

  async function audit(message: string, metadata: Record<string, unknown>) {
    await admin.from('events').insert({
      event_type: 'user_change', severity: 'warning', message,
      actor_id: caller!.id, actor_email: caller!.email, actor_role: 'superadmin', metadata,
    })
  }

  if (action === 'create') {
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const fullName = String(body?.full_name ?? '').trim() || null
    const role = String(body?.role ?? '')
    const stations = Array.isArray(body?.station_access) ? body!.station_access as unknown[] : []

    if (!EMAIL.test(email)) return json({ error: 'Format email tidak valid.' }, 400)
    if (password.length < 8) return json({ error: 'Password minimal 8 karakter.' }, 400)
    if (!ROLES.includes(role as typeof ROLES[number])) return json({ error: 'Peran tidak dikenal.' }, 400)
    if (!stations.every((id) => typeof id === 'string' && UUID.test(id))) return json({ error: 'Daftar stasiun tidak valid.' }, 400)
    if (role !== 'superadmin' && stations.length === 0) return json({ error: 'Pilih minimal satu stasiun untuk akun ini.' }, 400)

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    })
    if (createError || !created.user) {
      const exists = /already|registered|exists/i.test(createError?.message ?? '')
      return json({ error: exists ? 'Email ini sudah terdaftar.' : `Gagal membuat akun: ${createError?.message}` }, 400)
    }

    // Profil dibuat trigger handle_new_user sebagai viewer; atur peran dan akses.
    const { error: profileError } = await admin.from('profiles')
      .update({ role, station_access: stations, full_name: fullName, email })
      .eq('id', created.user.id)
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: `Gagal mengatur profil: ${profileError.message}` }, 500)
    }

    await audit(`Akun ${email} dibuat sebagai ${role}`, { profile_id: created.user.id, role, station_access: stations })
    return json({ id: created.user.id })
  }

  if (action === 'set_password') {
    const userId = String(body?.user_id ?? '')
    const password = String(body?.password ?? '')
    if (!UUID.test(userId)) return json({ error: 'Akun tidak valid.' }, 400)
    if (password.length < 8) return json({ error: 'Password minimal 8 karakter.' }, 400)

    const { data: updated, error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return json({ error: `Gagal mengganti password: ${error.message}` }, 400)
    await audit(`Password akun ${updated.user?.email ?? userId} diganti`, { profile_id: userId })
    return json({ ok: true })
  }

  return json({ error: 'Aksi tidak dikenal.' }, 400)
})
