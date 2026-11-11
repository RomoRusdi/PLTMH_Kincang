import { cn } from '@/lib/utils'

// ============================================================================
// Skema penampang PLTMH (tidak berskala): bendung → saluran pembawa → kolam
// penenang → pipa pesat → rumah pembangkit → saluran buang. Huruf A–D
// menandai bagian pembangkit yang ditangani tiap layanan (lihat content.ts).
// ============================================================================

type Marker = 'A' | 'B' | 'C' | 'D'

const MARKERS: Record<Marker, { x: number; y: number; label: string }> = {
  A: { x: 838, y: 338, label: 'A: governor dan hidrolik pada turbin' },
  B: { x: 838, y: 268, label: 'B: eksitasi pada generator' },
  C: { x: 914, y: 246, label: 'C: PLC/SCADA di ruang kontrol' },
  D: { x: 384, y: 56, label: 'D: radar monitoring aliran di saluran' },
}

export function PlantSchematic({ active, className }: { active: Marker | null; className?: string }) {
  return (
    <svg
      viewBox="0 0 1120 420"
      role="img"
      aria-label="Skema penampang pembangkit listrik tenaga mikrohidro dengan letak layanan Digihydrotek"
      className={cn('h-auto w-full text-[#0B1B2E] dark:text-[#CFDCEA]', className)}
    >
      {/* Kisi tipis seperti kertas gambar teknik */}
      <defs>
        <pattern id="plant-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeOpacity=".06" />
        </pattern>
      </defs>
      <rect width="1120" height="420" fill="url(#plant-grid)" />

      {/* Tanah */}
      <path d="M0 182H240L620 196L780 360L1120 386V420H0Z" fill="currentColor" fillOpacity=".05" />
      <path d="M0 182H240L620 196L780 360L1120 386" fill="none" stroke="currentColor" strokeOpacity=".35" strokeDasharray="2 5" />

      {/* Air: sungai hulu, saluran, kolam penenang, saluran buang */}
      <g fill="#109CD5" fillOpacity=".28">
        <rect x="0" y="142" width="196" height="40" />
        <rect x="214" y="148" width="386" height="22" />
        <rect x="600" y="148" width="50" height="48" />
        <rect x="790" y="360" width="330" height="24" />
      </g>
      <g fill="none" stroke="#109CD5" strokeWidth="2" strokeDasharray="10 14" className="motion-safe:animate-flow-dash">
        <path d="M0 160H196" />
        <path d="M214 159H648" />
        <path d="M800 372H1120" />
      </g>

      {/* Bendung, saluran, kolam penenang */}
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M196 128H214L224 184H188Z" fill="currentColor" fillOpacity=".08" />
        <path d="M214 136V170H600" />
        <path d="M600 136V196H650V136" />
      </g>

      {/* Pipa pesat */}
      <path d="M650 182L790 322" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeOpacity=".85" />
      <path d="M650 182L790 322" stroke="#109CD5" strokeWidth="5" strokeDasharray="8 10" className="motion-safe:animate-flow-dash" />

      {/* Rumah pembangkit */}
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M756 236H980V352H756Z" fill="currentColor" fillOpacity=".03" />
        <path d="M744 236L868 198L992 236" />
        {/* Generator di atas turbin, dihubungkan poros */}
        <rect x="780" y="254" width="40" height="34" rx="3" fill="currentColor" fillOpacity=".08" />
        <path d="M800 288V312" />
        {/* Turbin */}
        <circle cx="800" cy="330" r="17" fill="currentColor" fillOpacity=".08" />
        <path d="M800 330L812 318M800 330L788 342M800 330L812 342M800 330L788 318" strokeWidth="1.5" />
        <path d="M800 347V362" />
        {/* Panel kontrol */}
        <rect x="882" y="262" width="66" height="70" rx="3" fill="currentColor" fillOpacity=".06" />
        <rect x="892" y="272" width="30" height="18" rx="2" fill="#109CD5" fillOpacity=".35" />
        <path d="M892 302H938M892 312H930M892 322H936" strokeWidth="1.5" strokeOpacity=".6" />
      </g>

      {/* Tiang dan radar aliran */}
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M470 182V64M470 72H424" />
        <rect x="406" y="70" width="34" height="14" rx="3" fill="#109CD5" fillOpacity=".35" />
        <path d="M423 88V144" strokeWidth="1.5" strokeDasharray="3 4" />
      </g>

      {/* Nama bagian pembangkit */}
      <g className="fill-[#4A5D73] font-plex text-[13px] dark:fill-[#93A7BE]">
        <text x="98" y="128" textAnchor="middle">Sungai</text>
        <text x="206" y="212" textAnchor="middle">Bendung</text>
        <text x="330" y="212" textAnchor="middle">Saluran pembawa</text>
        <text x="592" y="122" textAnchor="middle">Kolam penenang</text>
        <text x="700" y="296" textAnchor="end">Pipa pesat</text>
        <text x="868" y="186" textAnchor="middle">Rumah pembangkit</text>
        <text x="1110" y="406" textAnchor="end">Saluran buang</text>
      </g>

      {/* Penanda layanan */}
      {(Object.keys(MARKERS) as Marker[]).map((key) => {
        const m = MARKERS[key]
        const on = active === key
        return (
          <g key={key} aria-label={m.label}>
            <circle
              cx={m.x}
              cy={m.y}
              r={on ? 19 : 15}
              className={cn('transition-all duration-200 motion-reduce:transition-none', on ? 'fill-[#109CD5]' : 'fill-[#01448A] dark:fill-[#1B6FC2]')}
            />
            {on && <circle cx={m.x} cy={m.y} r={26} fill="none" stroke="#109CD5" strokeWidth="2" strokeOpacity=".5" />}
            <text x={m.x} y={m.y + 5} textAnchor="middle" className="fill-white font-brand-display text-[15px] font-bold">{key}</text>
          </g>
        )
      })}

      {/* Blok judul ala gambar teknik */}
      <g className="max-sm:hidden">
        <rect x="24" y="356" width="232" height="44" fill="none" stroke="currentColor" strokeOpacity=".35" />
        <path d="M24 376H256" stroke="currentColor" strokeOpacity=".35" />
        <text x="34" y="371" className="fill-current font-plex text-[11px] tracking-wider" fillOpacity=".7">SKEMA PLTMH · TIDAK BERSKALA</text>
        <text x="34" y="392" className="fill-current font-plex text-[11px] tracking-wider" fillOpacity=".7">DIGIHYDROTEK</text>
      </g>
    </svg>
  )
}
