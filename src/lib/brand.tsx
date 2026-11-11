import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { BrandMark } from '@/components/brand/Logo'
import { cn } from '@/lib/utils'

// ============================================================================
// Merek dashboard (08-merek-akun.sql).
// - Akun dengan brand_name di profil (mis. kincang@admin.com → PT. Naluri
//   Energi Utama) melihat nama/logo itu di dashboard, tanpa menyebut Digihydrotek.
// - Akun lain melihat Digihydrotek. Peran dan hak akses tidak berubah.
// - Merek diatur dari SQL Editor (08-merek-akun.sql), bukan dari web.
// Halaman publik (landing, login) tetap Digihydrotek.
// ============================================================================

export interface Brand {
  name: string
  logoUrl: string | null
  /** true = merek bawaan Digihydrotek */
  isDefault: boolean
}

export const DEFAULT_BRAND: Brand = {
  name: import.meta.env.VITE_APP_NAME ?? 'Digihydrotek',
  logoUrl: null,
  isDefault: true,
}

export function useBrand(): Brand {
  const { profile } = useAuth()
  if (!profile?.brand_name) return DEFAULT_BRAND
  return { name: profile.brand_name, logoUrl: profile.brand_logo_url ?? null, isDefault: false }
}

/** Inisial dua huruf dari nama perusahaan, tanpa awalan badan usaha (PT, CV). */
export function brandInitials(name: string): string {
  const words = name.replace(/\b(PT|CV|Tbk|Persero)\b\.?/gi, '').split(/[\s.]+/).filter(Boolean)
  return (words.slice(0, 2).map((word) => word[0]).join('') || name.slice(0, 2)).toUpperCase()
}

/** Ikon merek: logo Digihydrotek, logo perusahaan, atau inisial bila logo belum ada. */
export function BrandIcon({ brand, className }: { brand: Brand; className?: string }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [brand.logoUrl])
  if (brand.isDefault) return <BrandMark className={className} />
  if (brand.logoUrl && !broken) {
    return <img src={brand.logoUrl} alt="" aria-hidden="true" onError={() => setBroken(true)} className={cn('rounded-input object-contain', className)} />
  }
  return (
    <span aria-hidden="true" className={cn('flex items-center justify-center rounded-input bg-accent-blue/15 text-[11px] font-bold text-accent-blue', className)}>
      {brandInitials(brand.name)}
    </span>
  )
}

/** Ikon tab berisi inisial (SVG) untuk merek yang belum punya logo. */
function initialsFavicon(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><text x="32" y="42" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#fff">${brandInitials(name)}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Judul dan ikon tab browser mengikuti merek selama halaman dashboard terbuka. */
export function useBrandDocumentTitle(brand: Brand) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${brand.name} — Monitoring PLTMH`
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const previousIcon = icon?.href
    if (icon && !brand.isDefault) icon.href = brand.logoUrl ?? initialsFavicon(brand.name)
    return () => {
      document.title = previousTitle
      if (icon && previousIcon) icon.href = previousIcon
    }
  }, [brand.name, brand.logoUrl, brand.isDefault])
}
