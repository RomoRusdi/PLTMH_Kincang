import { Activity, ArrowRightLeft, Compass, Droplets, Fan, PlugZap, Radio, Ruler, Signal, Thermometer, Zap } from 'lucide-react'
import { ProgressPill, RangeBar, StatCard } from '@/components/StatCard'

// ============================================================================
// Bagian bawah Dashboard: energy meter dan detail radar/panel. Kartu hanya
// muncul untuk tag yang memang dikirim stasiun ini, sehingga tidak ada deretan
// kartu kosong ("—"). Batas pita normal sama dengan ambang alarm di database.
// ============================================================================

type Measurement = { value: number | null; quality: string; timestamp: string }
type MeasMap = Record<string, Measurement>

const num = (value: number | null | undefined, digits: number) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

function SectionTitle({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-blue">{eyebrow}</p>
        <h2 className="mt-1 text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      {note && <span className="hidden text-[10px] text-text-secondary sm:block">{note}</span>}
    </div>
  )
}

export function EnergyMeterSection({ m }: { m: MeasMap }) {
  const voltage = m['POWER.VOLTAGE']
  const current = m['POWER.CURRENT']
  const frequency = m['POWER.FREQUENCY']
  const pf = m['POWER.POWER_FACTOR']
  const any = [voltage, current, frequency, pf].some(Boolean)
  const dim = (x: Measurement | undefined) => x?.quality !== 'good'

  return (
    <section aria-label="Energy meter">
      <SectionTitle eyebrow="Energy meter" title="Kelistrikan generator" note="Rata-rata tiga fasa" />
      {!any ? (
        <StatCard label="Energy meter" icon={PlugZap} tone="default" value={<span className="text-base font-medium text-text-secondary">Belum ada data</span>}
          caption="Energy meter stasiun ini belum mengirim data. Daya di dashboard dihitung dari debit." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Tegangan fasa" icon={Zap} tone="orange" valueTone="default" value={num(voltage?.value, 1)} unit="V" quality={voltage?.quality ?? null} dimmed={dim(voltage)}
            visual={<RangeBar value={voltage?.value} min={180} max={260} lo={198} hi={242} format={(v) => `${v}`} />} />
          <StatCard label="Arus" icon={Activity} tone="orange" valueTone="default" value={num(current?.value, 1)} unit="A" quality={current?.quality ?? null} dimmed={dim(current)}
            caption="Rata-rata fasa A, B, C" />
          <StatCard label="Frekuensi" icon={Activity} tone="purple" valueTone="default" value={num(frequency?.value, 2)} unit="Hz" quality={frequency?.quality ?? null} dimmed={dim(frequency)}
            visual={<RangeBar value={frequency?.value} min={48} max={52} lo={49.5} hi={50.5} format={(v) => num(v, 1)} />} />
          <StatCard label="Faktor daya" icon={Zap} tone="purple" valueTone="default" value={num(pf?.value, 2)} quality={pf?.quality ?? null} dimmed={dim(pf)}
            visual={<ProgressPill pct={pf?.value != null ? pf.value * 100 : null} text={`${num(pf?.value != null ? pf.value * 100 : null, 0)}%`} warn={pf?.value != null && pf.value < 0.8} />}
            caption="Batas bawah 0,80" />
        </div>
      )}
    </section>
  )
}

export function RadarPanelSection({ m }: { m: MeasMap }) {
  const dim = (x: Measurement | undefined) => x?.quality !== 'good'
  const cards = [
    m['HYDRO.VOLUME'] && (
      <StatCard key="volume" label="Volume kumulatif" icon={Droplets} tone="blue" valueTone="default" value={num(m['HYDRO.VOLUME'].value, 0)} unit="m³"
        quality={m['HYDRO.VOLUME'].quality} dimmed={dim(m['HYDRO.VOLUME'])} caption="Akumulasi debit dari radar" />
    ),
    m['HYDRO.AIR_GAP'] && (
      <StatCard key="gap" label="Jarak sensor ke air" icon={Ruler} tone="blue" valueTone="default" value={num(m['HYDRO.AIR_GAP'].value, 3)} unit="m"
        quality={m['HYDRO.AIR_GAP'].quality} dimmed={dim(m['HYDRO.AIR_GAP'])} caption="Dari radar ke permukaan air" />
    ),
    m['RADAR.ECHO_AMPLITUDE'] && (
      <StatCard key="signal" label="Sinyal radar" icon={Signal} tone="blue" valueTone="default" value={num(m['RADAR.ECHO_AMPLITUDE'].value, 0)} unit="dB"
        quality={m['RADAR.ECHO_AMPLITUDE'].quality} dimmed={dim(m['RADAR.ECHO_AMPLITUDE'])}
        visual={<RangeBar value={m['RADAR.ECHO_AMPLITUDE'].value} min={50} max={100} lo={75} hi={100} format={(v) => `${v}`} />} />
    ),
    m['RADAR.ANGLE'] && (
      <StatCard key="angle" label="Sudut radar" icon={Compass} tone="blue" valueTone="default" value={num(m['RADAR.ANGLE'].value, 2)} unit="°"
        quality={m['RADAR.ANGLE'].quality} dimmed={dim(m['RADAR.ANGLE'])}
        visual={<RangeBar value={m['RADAR.ANGLE'].value} min={52} max={56} lo={53.6} hi={54.6} format={(v) => num(v, 1)} />} />
    ),
    m['RADAR.TEMPERATURE'] && (
      <StatCard key="temp" label="Suhu radar" icon={Thermometer} tone="orange" valueTone="default" value={num(m['RADAR.TEMPERATURE'].value, 1)} unit="°C"
        quality={m['RADAR.TEMPERATURE'].quality} dimmed={dim(m['RADAR.TEMPERATURE'])} caption="Peringatan di atas 60 °C" />
    ),
    m['HYDRO.FLOW_DIRECTION'] && (
      <StatCard key="dir" label="Arah aliran" icon={ArrowRightLeft} tone="blue" valueTone="default" quality={m['HYDRO.FLOW_DIRECTION'].quality}
        value={<span className="text-xl">{m['HYDRO.FLOW_DIRECTION'].value === 1 ? 'Melawan arus' : 'Searah aliran'}</span>} />
    ),
    m['PANEL.FAN_STATUS'] && (
      <StatCard key="fan" label="Kipas panel" icon={Fan} tone="purple" valueTone="default" quality={m['PANEL.FAN_STATUS'].quality}
        value={<span className="text-xl">{m['PANEL.FAN_STATUS'].value === 1 ? 'Menyala' : 'Mati'}</span>} />
    ),
    m['SYS.RADAR_COMM'] && (
      <StatCard key="comm" label="Komunikasi radar" icon={Radio} tone={m['SYS.RADAR_COMM'].value === 0 ? 'green' : 'red'} quality={m['SYS.RADAR_COMM'].quality}
        value={<span className="text-xl">{m['SYS.RADAR_COMM'].value === 0 ? 'Normal' : 'Terputus'}</span>} />
    ),
  ].filter(Boolean)

  if (cards.length === 0) return null
  return (
    <section aria-label="Radar dan panel">
      <SectionTitle eyebrow="Radar & panel" title="Detail sensor" note="Hanya data yang dikirim stasiun ini" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards}</div>
    </section>
  )
}
