import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Profile, type UserRole } from './supabase'

// ============================================================================
// ROLE HIERARCHY
// ============================================================================

/** Urutan hierarki role dari terendah ke tertinggi. */
const ROLE_ORDER: UserRole[] = ['viewer', 'technician', 'operator', 'admin', 'superadmin']

/** Cek apakah role saat ini memenuhi minimal role yang diminta. */
export function roleSatisfies(current: UserRole | null | undefined, minRole: UserRole): boolean {
  if (!current) return false
  return ROLE_ORDER.indexOf(current) >= ROLE_ORDER.indexOf(minRole)
}

/** Permission matrix fitur -> role minimal (Bagian 8 instruksi). */
export const FEATURE_PERMISSIONS = {
  viewDashboard: 'viewer',
  viewHistory: 'viewer',
  viewAlerts: 'viewer',
  acknowledgeAlarm: 'technician',
  editDevice: 'technician',
  editTagThreshold: 'admin',
  userManagement: 'superadmin',
  createStation: 'superadmin',
  systemSettings: 'admin',
  deleteData: 'superadmin',
} as const satisfies Record<string, UserRole>

export type FeatureKey = keyof typeof FEATURE_PERMISSIONS

// ============================================================================
// AUTH CONTEXT
// ============================================================================

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Pick<Profile, 'full_name' | 'phone' | 'avatar_url'>>) => Promise<{
    error: string | null
  }>
  refreshProfile: () => Promise<void>
  hasRole: (minRole: UserRole) => boolean
  canAccess: (feature: FeatureKey) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** Ambil baris profile dari tabel profiles berdasarkan user id. */
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) {
    console.error('Gagal mengambil profile:', error.message)
    return null
  }
  return data as Profile
}

/** Catat event audit (login/logout) ke tabel events. */
async function logAuthEvent(params: {
  eventType: 'login' | 'logout'
  actorId: string | null
  actorEmail: string | null
  actorRole: string | null
}) {
  const { eventType, actorId, actorEmail, actorRole } = params
  const { error } = await supabase.from('events').insert({
    event_type: eventType,
    severity: 'info',
    message: eventType === 'login' ? `User ${actorEmail ?? 'unknown'} login` : `User ${actorEmail ?? 'unknown'} logout`,
    actor_id: actorId,
    actor_email: actorEmail,
    actor_role: actorRole,
    metadata: {},
  })
  if (error) {
    console.error(`Gagal mencatat event ${eventType}:`, error.message)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadProfileForSession = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setProfile(null)
      return
    }
    const p = await fetchProfile(nextSession.user.id)
    setProfile(p)
  }, [])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      await loadProfileForSession(data.session)
      setIsLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      await loadProfileForSession(nextSession)
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfileForSession])

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { error: error.message }
    }

    const p = await fetchProfile(data.user.id)
    setProfile(p)

    if (p && !p.is_active) {
      await supabase.auth.signOut()
      setProfile(null)
      return { error: 'Akun Anda tidak aktif. Hubungi administrator.' }
    }

    // Update last_login & catat event login
    await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', data.user.id)
    await logAuthEvent({
      eventType: 'login',
      actorId: data.user.id,
      actorEmail: data.user.email ?? null,
      actorRole: p?.role ?? null,
    })

    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    const currentUser = session?.user ?? null
    await logAuthEvent({
      eventType: 'logout',
      actorId: currentUser?.id ?? null,
      actorEmail: currentUser?.email ?? null,
      actorRole: profile?.role ?? null,
    })
    await supabase.auth.signOut()
    setProfile(null)
  }, [session, profile])

  const updateProfile = useCallback(
    async (updates: Partial<Pick<Profile, 'full_name' | 'phone' | 'avatar_url'>>) => {
      if (!session?.user) {
        return { error: 'Tidak ada sesi aktif' }
      }
      const { error } = await supabase.from('profiles').update(updates).eq('id', session.user.id)
      if (error) {
        return { error: error.message }
      }
      const p = await fetchProfile(session.user.id)
      setProfile(p)
      return { error: null }
    },
    [session],
  )

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    const p = await fetchProfile(session.user.id)
    setProfile(p)
  }, [session])

  const hasRole = useCallback((minRole: UserRole) => roleSatisfies(profile?.role, minRole), [profile])

  const canAccess = useCallback(
    (feature: FeatureKey) => roleSatisfies(profile?.role, FEATURE_PERMISSIONS[feature]),
    [profile],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      isAuthenticated: !!session?.user || !!profile,
      signIn,
      signOut,
      updateProfile,
      refreshProfile,
      hasRole,
      canAccess,
    }),
    [session, profile, isLoading, signIn, signOut, updateProfile, refreshProfile, hasRole, canAccess],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Hook akses AuthContext. Harus dipanggil di dalam <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth harus dipanggil di dalam <AuthProvider>')
  }
  return ctx
}
