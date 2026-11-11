import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useBrand } from '@/lib/brand'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaInstallPrompt() {
  const brand = useBrand()
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem('rfg-install-dismissed') === 'true')
    } catch { /* storage optional */ }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  // Nama & ikon aplikasi terpasang (manifest) tetap Digihydrotek, jadi ajakan
  // pasang tidak ditampilkan kepada pengguna dengan merek perusahaan lain.
  if (!installEvent || dismissed || !brand.isDefault) return null

  async function install() {
    await installEvent?.prompt()
    const choice = await installEvent?.userChoice
    if (choice?.outcome === 'accepted') setInstallEvent(null)
  }

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem('rfg-install-dismissed', 'true') } catch { /* storage optional */ }
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-card border border-accent-blue/30 bg-surface p-3 shadow-xl sm:bottom-4 sm:left-auto sm:max-w-sm">
      <span className="rounded-input bg-accent-blue/15 p-2 text-accent-blue"><Download className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-text-primary">Pasang {brand.name} di perangkat</p>
        <p className="mt-0.5 text-[10px] text-text-secondary">Buka dashboard monitoring langsung dari layar utama.</p>
      </div>
      <button type="button" onClick={() => void install()} className="scada-button-secondary px-2.5 py-1 text-[10px] text-accent-blue">Pasang</button>
      <button type="button" onClick={dismiss} aria-label="Tutup ajakan instalasi" className="rounded-input p-1 text-text-secondary hover:bg-surface-2"><X className="h-4 w-4" /></button>
    </div>
  )
}