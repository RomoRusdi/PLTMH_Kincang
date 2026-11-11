import { useEffect, useState } from 'react'
import { Check, RotateCcw, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { Section, Toggle } from './atoms'

const STORAGE_KEY = 'notif_prefs'

type Prefs = {
  alarm_critical: boolean
  alarm_high: boolean
  alarm_medium: boolean
  alarm_low: boolean
  device_offline: boolean
  system_events: boolean
  sound_enabled: boolean
}

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Prefs>
    return {
      alarm_critical: raw.alarm_critical ?? true,
      alarm_high:     raw.alarm_high     ?? true,
      alarm_medium:   raw.alarm_medium   ?? false,
      alarm_low:      raw.alarm_low      ?? false,
      device_offline: raw.device_offline ?? true,
      system_events:  raw.system_events  ?? false,
      sound_enabled:  raw.sound_enabled  ?? false,
    }
  } catch { return { alarm_critical:true, alarm_high:true, alarm_medium:false, alarm_low:false, device_offline:true, system_events:false, sound_enabled:false } }
}

const ROWS: { key: keyof Prefs; label: string; desc: string }[] = [
  { key:'alarm_critical', label:'Alarm Critical',    desc:'Toast permanen + suara untuk alarm critical' },
  { key:'alarm_high',     label:'Alarm High',        desc:'Toast 10 detik untuk alarm high' },
  { key:'alarm_medium',   label:'Alarm Medium',      desc:'Toast singkat untuk alarm medium' },
  { key:'alarm_low',      label:'Alarm Low',         desc:'Notifikasi diam untuk alarm prioritas rendah' },
  { key:'device_offline', label:'Perangkat Offline', desc:'Notifikasi ketika perangkat kehilangan koneksi' },
  { key:'system_events',  label:'Event Sistem',      desc:'Login, logout, perubahan konfigurasi' },
  { key:'sound_enabled',  label:'Suara Alarm',       desc:'Aktifkan bunyi untuk alarm critical' },
]

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPermission(Notification.permission)
  }, [])

  function toggle(k: keyof Prefs) {
    const updated = { ...prefs, [k]: !prefs[k] }
    setPrefs(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    toast.success('Preferensi notifikasi disimpan')
  }

  async function requestPermission() {
    if (typeof Notification === 'undefined') { toast.error('Browser ini tidak mendukung notifikasi desktop'); return }
    const result = await Notification.requestPermission()
    setPermission(result)
    result === 'granted' ? toast.success('Izin notifikasi diaktifkan') : toast.error('Izin notifikasi belum diberikan')
  }

  function reset() {
    const initial: Prefs = { alarm_critical: true, alarm_high: true, alarm_medium: false, alarm_low: false, device_offline: true, system_events: false, sound_enabled: false }
    setPrefs(initial); localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
    toast.success('Preferensi dikembalikan ke default')
  }

  return (
    <div className="max-w-lg">
      <p className="text-xs text-text-secondary mb-3">Preferensi ini berlaku untuk notifikasi di browser dan disimpan lokal pada perangkat ini.</p>
      <Section title="Preferensi Notifikasi">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-input border border-border bg-surface-2 p-3">
          <div><p className="text-sm text-text-primary">Notifikasi browser</p><p className="text-[10px] text-text-secondary">{permission === 'granted' ? 'Izin aktif pada browser ini' : permission === 'denied' ? 'Izin diblokir oleh browser' : permission === 'unsupported' ? 'Tidak didukung browser' : 'Izin belum diberikan'}</p></div>
          {permission === 'default' && <button type="button" onClick={() => { void requestPermission() }} className="scada-button-secondary"><Check className="w-3 h-3" /> Aktifkan</button>}
          {permission === 'denied' && <span className="text-[10px] text-status-bad">Ubah izin dari pengaturan browser</span>}
        </div>
        <div className="space-y-0">
          {ROWS.map(({ key, label, desc }) => (
            <div key={key}
              className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <p className="text-sm text-text-primary">{label}</p>
                <p className="text-[10px] text-text-secondary mt-0.5">{desc}</p>
              </div>
              <Toggle value={prefs[key]} onToggle={() => toggle(key)} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <button type="button" onClick={() => { if (permission === 'granted') new Notification('Digihydrotek', { body: 'Notifikasi uji berhasil.' }); else toast.info('Aktifkan izin browser terlebih dahulu') }} className="scada-button-secondary"><Volume2 className="w-3 h-3" /> Uji notifikasi</button>
          <button type="button" onClick={reset} className="scada-button-secondary"><RotateCcw className="w-3 h-3" /> Reset default</button>
        </div>
      </Section>
    </div>
  )
}
