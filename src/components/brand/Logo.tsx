import { cn } from '@/lib/utils'

// ============================================================================
// Logo resmi Digihydrotek (berkas dari tim, latar sudah dibuat transparan).
// - digihydrotek-logo.png       tulisan biru, untuk latar terang
// - digihydrotek-logo-dark.png  tulisan putih, untuk latar gelap
// - digihydrotek-mark.png       ikon tetes air saja
// ============================================================================

const LOGO_LIGHT = '/images/brand/digihydrotek-logo.png'
const LOGO_DARK = '/images/brand/digihydrotek-logo-dark.png'
const MARK = '/images/brand/digihydrotek-mark.png'

/** Ikon tetes air Digihydrotek (dekoratif; beri label pada elemen pembungkus). */
export function BrandMark({ className }: { className?: string }) {
  return <img src={MARK} alt="" aria-hidden="true" width={160} height={160} className={cn('object-contain', className)} />
}

/**
 * Logo lengkap. Varian gelap dipilih otomatis mengikuti tema (class `dark`),
 * atau dipaksa lewat `tone` bila logo diletakkan di atas latar tetap.
 */
export function Logo({ className, tone = 'auto' }: { className?: string; tone?: 'auto' | 'light' | 'dark' }) {
  const size = { width: 720, height: 176 }
  if (tone !== 'auto') {
    return <img src={tone === 'dark' ? LOGO_DARK : LOGO_LIGHT} alt="Digihydrotek" {...size} className={cn('h-8 w-auto', className)} />
  }
  return (
    <span className={cn('inline-flex h-8', className)}>
      <img src={LOGO_LIGHT} alt="Digihydrotek" {...size} className="h-full w-auto dark:hidden" />
      <img src={LOGO_DARK} alt="Digihydrotek" {...size} className="hidden h-full w-auto dark:block" />
    </span>
  )
}
