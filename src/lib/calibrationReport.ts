import { exportCsv } from './exportCsv'
import type { CalibrationEvaluation, ErrorSummary } from './calibrationMath'
import type { CalibrationParams, Station, StationCalibration } from './supabase'

// ============================================================================
// Laporan kalibrasi per versi: halaman cetak (simpan sebagai PDF lewat dialog
// cetak browser) dan CSV titik acuan. Laporan dibuat sebagai dokumen HTML
// mandiri agar tata letak cetak tidak bergantung pada layout dashboard.
// ============================================================================

export interface CalibrationReportInput {
  station: Pick<Station, 'name' | 'location'> | null
  calibration: StationCalibration
  previous: StationCalibration | null
  evaluation: CalibrationEvaluation | null
  /** Nama perusahaan yang tampil di kop laporan (merek pengguna). */
  brandName?: string
}

// Pedoman penilaian akurasi (bukan standar resmi): level dibandingkan dengan
// pembacaan papan duga (±1 cm wajar), debit dengan pengukuran current meter
// (ketidakpastian 5–10% umum pada pengukuran debit lapangan).
export function levelGrade(rmse: number | null): { label: string; tone: 'good' | 'fair' | 'poor' } | null {
  if (rmse == null) return null
  if (rmse <= 0.01) return { label: 'Baik (≤ 1 cm)', tone: 'good' }
  if (rmse <= 0.03) return { label: 'Cukup (≤ 3 cm)', tone: 'fair' }
  return { label: 'Perlu dicek (> 3 cm)', tone: 'poor' }
}

export function flowGrade(rmse: number | null): { label: string; tone: 'good' | 'fair' | 'poor' } | null {
  if (rmse == null) return null
  if (rmse <= 0.05) return { label: 'Baik (≤ 5%)', tone: 'good' }
  if (rmse <= 0.1) return { label: 'Cukup (≤ 10%)', tone: 'fair' }
  return { label: 'Perlu dicek (> 10%)', tone: 'poor' }
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

export function num(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return (Number(value.toFixed(digits)) || 0).toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function signedNum(value: number | null | undefined, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '—'
  // Bulatkan dulu: -0,00004 harus tampil "0,0", bukan "-0,0".
  const rounded = Number(value.toFixed(digits)) || 0
  return `${rounded > 0 ? '+' : ''}${num(rounded, digits)}`
}

/** Error level dalam cm. */
export function cm(value: number | null | undefined, signed = false): string {
  if (value == null) return '—'
  return `${signed ? signedNum(value * 100, 1) : num(value * 100, 1)} cm`
}

/** Error relatif dalam persen. */
export function pct(value: number | null | undefined, signed = false): string {
  if (value == null) return '—'
  return `${signed ? signedNum(value * 100, 1) : num(value * 100, 1)}%`
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function sectionText(p: Pick<CalibrationParams, 'section_type' | 'bottom_width_m' | 'side_slope'>): string {
  return p.section_type === 'trapezoid'
    ? `Trapesium, lebar dasar ${num(p.bottom_width_m, 2)} m, talud ${num(p.side_slope, 2)}`
    : `Persegi, lebar ${num(p.bottom_width_m, 2)} m`
}

export const PARAM_ROWS: { label: string; value: (p: CalibrationParams) => string }[] = [
  { label: 'Tinggi pasang radar', value: (p) => `${num(p.install_height_m, 3)} m` },
  { label: 'Offset level', value: (p) => `${signedNum(p.level_offset_m, 3)} m` },
  { label: 'Penampang saluran', value: (p) => sectionText(p) },
  { label: 'Koefisien kecepatan', value: (p) => num(p.velocity_coefficient, 3) },
]

const METHOD_LABEL = { manual: 'Parameter manual', field_reference: 'Pengukuran lapangan' } as const

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function exportCalibrationCsv({ station, calibration, evaluation }: CalibrationReportInput) {
  const base = {
    stasiun: station?.name ?? '',
    versi: calibration.version,
    berlaku_sejak: calibration.effective_from,
    tinggi_pasang_m: calibration.install_height_m,
    offset_level_m: calibration.level_offset_m,
    penampang: calibration.section_type,
    lebar_dasar_m: calibration.bottom_width_m,
    kemiringan_talud: calibration.side_slope,
    koefisien_kecepatan: calibration.velocity_coefficient,
  }
  const rows = evaluation?.points.length
    ? evaluation.points.map((p, i) => ({
      ...base,
      titik: i + 1,
      waktu_pengukuran: p.measuredAt,
      papan_duga_m: p.refLevel ?? '',
      radar_jarak_ke_air_m: p.radarAirGap ?? '',
      level_sebelum_m: round(p.levelBefore),
      level_sesudah_m: round(p.levelAfter),
      error_level_sebelum_m: round(p.levelErrorBefore),
      error_level_sesudah_m: round(p.levelErrorAfter),
      kecepatan_rata_acuan_ms: round(p.refMeanVelocity),
      radar_kecepatan_permukaan_ms: p.radarSurfaceVelocity ?? '',
      debit_acuan_m3s: round(p.refFlow),
      debit_sebelum_m3s: round(p.flowBefore),
      debit_sesudah_m3s: round(p.flowAfter),
      error_debit_sesudah_persen: p.flowErrorAfter == null ? '' : round(p.flowErrorAfter * 100),
    }))
    : [base]
  const slug = (station?.name ?? 'stasiun').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  exportCsv(rows, `kalibrasi-${slug}-v${calibration.version}.csv`)
}

function round(value: number | null, digits = 4) {
  return value == null ? '' : Number(value.toFixed(digits))
}

// ---------------------------------------------------------------------------
// Laporan cetak
// ---------------------------------------------------------------------------

/** Membuka laporan di jendela baru lalu menampilkan dialog cetak. Mengembalikan false bila pop-up diblokir. */
export function openCalibrationReport(input: CalibrationReportInput): boolean {
  const win = window.open('', '_blank')
  if (!win) return false
  win.document.open()
  win.document.write(buildCalibrationReportHtml(input))
  win.document.close()
  win.addEventListener('load', () => { win.focus(); win.print() })
  return true
}

export function buildCalibrationReportHtml({ station, calibration, previous, evaluation, brandName = 'Digihydrotek' }: CalibrationReportInput): string {
  const points = evaluation?.points ?? []
  const hasLevel = points.some((p) => p.refLevel != null)
  const hasFlow = points.some((p) => p.refFlow != null)
  const title = `Laporan Kalibrasi v${calibration.version} – ${station?.name ?? 'Stasiun'}`

  const paramRows = PARAM_ROWS.map((row) => `
    <tr><th>${esc(row.label)}</th><td>${previous ? esc(row.value(previous)) : '—'}</td><td><strong>${esc(row.value(calibration))}</strong></td></tr>`).join('')

  const pointRows = points.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(dateTime(p.measuredAt))}</td>
      <td class="num">${num(p.refLevel, 3)}</td>
      <td class="num">${num(p.radarAirGap, 3)}</td>
      <td class="num">${num(p.levelBefore, 3)}</td>
      <td class="num">${num(p.levelAfter, 3)}</td>
      <td class="num">${cm(p.levelErrorAfter, true)}</td>
      <td class="num">${num(p.refFlow, 3)}</td>
      <td class="num">${num(p.radarSurfaceVelocity, 2)}</td>
      <td class="num">${num(p.flowAfter, 3)}</td>
      <td class="num">${pct(p.flowErrorAfter, true)}</td>
    </tr>`).join('')

  const summaryRow = (label: string, before: ErrorSummary, after: ErrorSummary, fmt: (v: number | null, signed?: boolean) => string, grade: string) => `
    <tr><th>${label}</th><td class="num">${fmt(before.rmse)}</td><td class="num"><strong>${fmt(after.rmse)}</strong></td>
    <td class="num">${fmt(after.maxAbs)}</td><td class="num">${fmt(after.bias, true)}</td><td>${esc(grade)}</td></tr>`

  const accuracy = evaluation && (hasLevel || hasFlow) ? `
    <h2>4. Akurasi terhadap pengukuran acuan</h2>
    <table>
      <thead><tr><th></th><th>RMSE sebelum</th><th>RMSE sesudah</th><th>Error maks</th><th>Bias</th><th>Penilaian</th></tr></thead>
      <tbody>
        ${hasLevel ? summaryRow('Level air', evaluation.level.before, evaluation.level.after, cm, levelGrade(evaluation.level.after.rmse)?.label ?? '—') : ''}
        ${hasFlow ? summaryRow('Debit', evaluation.flow.before, evaluation.flow.after, pct, flowGrade(evaluation.flow.after.rmse)?.label ?? '—') : ''}
      </tbody>
    </table>
    <p class="note">"Sebelum" dihitung dengan parameter versi sebelumnya${previous ? ` (v${previous.version})` : ' (tidak ada, ini kalibrasi pertama)'}. Penilaian: level baik ≤ 1 cm, cukup ≤ 3 cm; debit baik ≤ 5%, cukup ≤ 10% (pedoman internal).</p>
    ${hasLevel ? `<div class="chart">${levelScatterSvg(evaluation)}</div>` : ''}` : `
    <h2>4. Akurasi terhadap pengukuran acuan</h2>
    <p class="note">Kalibrasi ini disimpan sebagai parameter manual tanpa titik acuan, sehingga akurasinya belum dapat dievaluasi.</p>`

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  /* Dokumen cetak selalu terang, tidak mengikuti mode gelap sistem. */
  html { color-scheme: light; background: #fff; }
  body { font-family: "Segoe UI", Arial, sans-serif; background: #fff; color: #111827; font-size: 11.5px; line-height: 1.45; margin: 0; padding: 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-weight: 700; font-size: 14px; }
  .brand span { color: #1d4ed8; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 12.5px; margin: 18px 0 6px; color: #1e3a8a; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; vertical-align: top; }
  thead th { background: #eff6ff; font-weight: 600; }
  tbody th { background: #f9fafb; font-weight: 600; width: 28%; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .meta td, .meta th { border: none; padding: 2px 8px 2px 0; }
  .meta th { background: none; width: 26%; color: #4b5563; font-weight: 500; }
  .note { color: #4b5563; font-size: 10.5px; margin: 6px 0 0; }
  .formula { background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px 10px; font-family: Consolas, monospace; font-size: 11px; }
  .chart { margin-top: 10px; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; }
  .sign { border-top: 1px solid #9ca3af; padding-top: 4px; margin-top: 56px; text-align: center; color: #374151; }
  footer { margin-top: 24px; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head>
<body>
  <p class="no-print note">Gunakan "Simpan sebagai PDF" pada dialog cetak untuk menyimpan laporan.</p>
  <header>
    <div>
      <div class="brand">${esc(brandName)}</div>
      <h1>Laporan Kalibrasi Radar Flow-meter</h1>
      <div class="note">Sistem Monitoring Sungai untuk PLTMH</div>
    </div>
    <div class="note" style="text-align:right">Versi kalibrasi <strong>v${calibration.version}</strong><br>Dicetak ${esc(dateTime(new Date().toISOString()))}</div>
  </header>

  <h2>1. Identitas</h2>
  <table class="meta"><tbody>
    <tr><th>Stasiun</th><td>${esc(station?.name ?? '—')}</td></tr>
    <tr><th>Lokasi</th><td>${esc(station?.location ?? '—')}</td></tr>
    <tr><th>Sensor</th><td>Radar flow-meter RS-RAD-N01-3 (Shandong Renke)</td></tr>
    <tr><th>Metode</th><td>${METHOD_LABEL[calibration.method]}${points.length ? ` – ${points.length} titik acuan (papan duga / current meter)` : ''}</td></tr>
    <tr><th>Berlaku sejak</th><td>${esc(dateTime(calibration.effective_from))}</td></tr>
    <tr><th>Disimpan oleh</th><td>${esc(calibration.created_by_email ?? '—')}</td></tr>
  </tbody></table>

  <h2>2. Parameter kalibrasi</h2>
  <table>
    <thead><tr><th>Parameter</th><th>${previous ? `Sebelumnya (v${previous.version})` : 'Sebelumnya'}</th><th>Versi ini (v${calibration.version})</th></tr></thead>
    <tbody>${paramRows}</tbody>
  </table>

  <h2>3. Rumus perhitungan</h2>
  <div class="formula">
    level = tinggi pasang − jarak sensor ke air + offset<br>
    luas penampang = (lebar dasar + kemiringan talud × level) × level<br>
    debit = koefisien kecepatan × kecepatan permukaan × luas penampang
  </div>
  <p class="note">Kalibrasi diterapkan di sistem untuk data yang masuk sejak tanggal berlaku. Parameter internal radar tidak diubah.</p>

  ${accuracy}

  ${points.length ? `
  <h2>5. Titik pengukuran acuan</h2>
  <table>
    <thead><tr>
      <th>#</th><th>Waktu</th><th>Papan duga (m)</th><th>Radar: jarak ke air (m)</th><th>Level sebelum (m)</th><th>Level sesudah (m)</th><th>Error level</th>
      <th>Debit acuan (m³/s)</th><th>Radar: kec. permukaan (m/s)</th><th>Debit sesudah (m³/s)</th><th>Error debit</th>
    </tr></thead>
    <tbody>${pointRows}</tbody>
  </table>` : ''}

  <h2>${points.length ? '6' : '5'}. Catatan</h2>
  <p>${esc(calibration.notes ?? '—')}</p>

  <div class="signs">
    <div><div class="sign">Petugas kalibrasi lapangan</div></div>
    <div><div class="sign">Diperiksa oleh (pengelola PLTMH)</div></div>
  </div>

  <footer>Dokumen ini dibuat otomatis oleh dashboard ${esc(brandName)} dari data kalibrasi tersimpan (ID ${esc(calibration.id)}).</footer>
</body></html>`
}

/** Grafik sebar level acuan vs hitungan untuk laporan cetak (SVG statis). */
function levelScatterSvg(evaluation: CalibrationEvaluation): string {
  const pts = evaluation.points.filter((p) => p.refLevel != null && (p.levelAfter != null || p.levelBefore != null))
  if (pts.length === 0) return ''
  const values = pts.flatMap((p) => [p.refLevel!, p.levelAfter, p.levelBefore].filter((v): v is number => v != null))
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.15, 0.05)
  const lo = Math.min(...values) - pad
  const hi = Math.max(...values) + pad
  const W = 360, H = 240, L = 46, B = 34, T = 12, R = 12
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R)
  const y = (v: number) => H - B - ((v - lo) / (hi - lo)) * (H - B - T)
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
  const grid = ticks.map((t) => `
    <line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e5e7eb"/>
    <text x="${L - 6}" y="${y(t) + 3}" font-size="9" text-anchor="end" fill="#6b7280">${num(t, 2)}</text>
    <text x="${x(t)}" y="${H - B + 14}" font-size="9" text-anchor="middle" fill="#6b7280">${num(t, 2)}</text>`).join('')
  const dots = pts.map((p) => `
    ${p.levelBefore != null ? `<circle cx="${x(p.refLevel!)}" cy="${y(p.levelBefore)}" r="4.5" fill="#9ca3af"/>` : ''}
    ${p.levelAfter != null ? `<circle cx="${x(p.refLevel!)}" cy="${y(p.levelAfter)}" r="4.5" fill="#1d4ed8" stroke="#fff" stroke-width="1.5"/>` : ''}`).join('')
  return `<svg width="${W}" height="${H + 18}" viewBox="0 0 ${W} ${H + 18}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">
    ${grid}
    <line x1="${x(lo)}" y1="${y(lo)}" x2="${x(hi)}" y2="${y(hi)}" stroke="#6b7280" stroke-dasharray="4 4"/>
    ${dots}
    <text x="${(L + W - R) / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="#374151">Level papan duga (m)</text>
    <text x="12" y="${(T + H - B) / 2}" font-size="10" text-anchor="middle" fill="#374151" transform="rotate(-90 12 ${(T + H - B) / 2})">Level hitungan (m)</text>
    <circle cx="${L + 6}" cy="${H + 10}" r="4" fill="#9ca3af"/><text x="${L + 14}" y="${H + 13}" font-size="9.5" fill="#374151">Sebelum</text>
    <circle cx="${L + 70}" cy="${H + 10}" r="4" fill="#1d4ed8"/><text x="${L + 78}" y="${H + 13}" font-size="9.5" fill="#374151">Sesudah</text>
    <line x1="${L + 134}" x2="${L + 152}" y1="${H + 10}" y2="${H + 10}" stroke="#6b7280" stroke-dasharray="4 4"/><text x="${L + 158}" y="${H + 13}" font-size="9.5" fill="#374151">Sama dengan acuan</text>
  </svg>`
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
