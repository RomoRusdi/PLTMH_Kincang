// ============================================================================
// Konten landing page Digihydrotek.
// Ubah teks di file ini; komponen tampilan tidak perlu disentuh.
//
// Sumber isi: poster "Modernisasi Sistem Kontrol PLTA" dan "Mitra EPC & Teknis
// PLTA di Indonesia", materi Program Hilirisasi Riset Prioritas, foto pameran
// KSTI 2026, dan implementasi sistem monitoring di repository ini.
// Jangan menambah angka atau klaim yang tidak ada di sumber tersebut.
// Kontak yang dikosongkan tidak ditampilkan di halaman.
// ============================================================================

export const company = {
  name: 'Digihydrotek',
  tagline: 'Smart Technology for Sustainable Hydropower',
  summary:
    'Mitra EPC dan teknis untuk pembangkit listrik tenaga air: sistem governor dan hidrolik, eksitasi, PLC/SCADA, retrofit, serta monitoring aliran sungai.',
  // [SESUAIKAN] isi bila sudah tersedia; nilai kosong tidak ditampilkan.
  contact: {
    email: '',
    whatsapp: '', // format internasional tanpa +, mis. 6281234567890
    phone: '',
    address: '',
  },
}

export const hero = {
  kicker: 'Hydropower EPC · Electrical & Automation · Technical Service',
  description:
    'Digihydrotek merancang, memasang, dan merawat sistem kendali pembangkit listrik tenaga air, dari governor turbin hingga ruang kontrol, dan memantau aliran sungainya secara real-time.',
  photo: {
    src: '/images/company/panel-front.jpg',
    alt: 'Panel monitoring Digihydrotek dengan layar HMI dan sensor radar aliran di bagian bawah',
    caption: 'Panel monitoring Digihydrotek · HMI dan radar aliran',
  },
}

/** Jenis proyek yang dilayani (poster "Mitra EPC & Teknis PLTA di Indonesia"). */
export const projectTypes = ['PLTA', 'PLTMH', 'Bendungan', 'Irigasi']

export const profile = {
  statement: 'Satu mitra untuk sistem pembangkit tenaga air, dari mesin hingga ruang kontrol.',
  paragraphs: [
    'Digihydrotek menangani rekayasa, pengadaan, pemasangan, dan dukungan teknis (EPC) untuk pembangkit listrik tenaga air di Indonesia, baik PLTA maupun PLTMH.',
    'Pekerjaan kami mencakup pembangkit baru dan modernisasi pembangkit lama, termasuk sistem kontrol dari merek lain, agar aset bekerja lebih efisien dan berumur lebih panjang.',
  ],
  facts: [
    { term: 'Bidang', detail: 'Hydropower EPC, electrical & automation, technical service' },
    { term: 'Cakupan proyek', detail: 'PLTA, PLTMH, bendungan, irigasi' },
    { term: 'Sistem yang ditangani', detail: 'Termasuk sistem PLTA dari merek lain' },
    { term: 'Riset & pengembangan', detail: 'Program Hilirisasi Riset Prioritas, skema Dorongan Teknologi' },
  ],
}

/**
 * Layanan utama. `marker` dipakai sebagai kunci pada skema pembangkit:
 * huruf yang sama menandai bagian pembangkit yang ditangani layanan itu.
 */
export const services = [
  {
    marker: 'A',
    where: 'Turbin',
    title: 'Sistem governor & hidrolik',
    text: 'Kontrol presisi bukaan turbin untuk menjaga putaran dan stabilitas pembangkit.',
    points: ['Presisi', 'Stabil', 'Andal'],
  },
  {
    marker: 'B',
    where: 'Generator',
    title: 'Sistem eksitasi',
    text: 'Keandalan tegangan generator untuk kinerja pembangkit yang optimal.',
    points: ['Pengaturan tegangan', 'Kinerja generator'],
  },
  {
    marker: 'C',
    where: 'Ruang kontrol',
    title: 'PLC/SCADA & otomasi',
    text: 'Monitoring real-time dan kendali jarak jauh seluruh peralatan pembangkit dari satu sistem.',
    points: ['Monitoring real-time', 'Kendali jarak jauh'],
  },
  {
    marker: 'D',
    where: 'Saluran & sungai',
    title: 'Monitoring aliran sungai',
    text: 'Radar non-kontak mengukur level air, kecepatan, dan debit yang menjadi sumber energi pembangkit.',
    points: ['Level air', 'Kecepatan', 'Debit'],
  },
] as const

/** Layanan pendukung (poster "Modernisasi Sistem Kontrol PLTA"). */
export const supportServices = [
  'Retrofit & modernisasi sistem kontrol',
  'Suku cadang original & berkualitas',
  'Instalasi & commissioning',
  'Pelatihan & dukungan teknis',
  'Layanan purna jual',
]

export const product = {
  name: 'Sistem Monitoring Sungai untuk PLTMH',
  description:
    'Produk riset Digihydrotek yang menghubungkan radar aliran, panel kontrol, dan dashboard web. Operator melihat kondisi sungai dan pembangkit dari mana saja, lengkap dengan alarm otomatis dan riwayat data.',
  chain: ['Radar aliran', 'Panel PLC & HMI', 'Komputer gateway', 'Cloud', 'Dashboard web'],
  specs: [
    { label: 'Sensor', value: 'Radar RS-RAD-N01-3, non-kontak' },
    { label: 'Parameter', value: 'Level air, kecepatan permukaan, debit' },
    { label: 'Pembaruan data', value: 'Setiap 1 menit' },
    { label: 'Alarm', value: 'High-High, High, Low, Low-Low per stasiun' },
    { label: 'Kalibrasi', value: 'Papan duga & current meter, laporan PDF' },
    { label: 'Akses', value: 'Web & ponsel, hak akses berbasis peran' },
  ],
  site: 'PLTMH Kincang, Banjarnegara · tahap uji lapangan',
  interiorPhoto: {
    src: '/images/company/panel-interior.jpg',
    alt: 'Isi panel kontrol: MCB, power supply, PLC, dan kabel jaringan',
  },
}

export const research = {
  program: 'Program Hilirisasi Riset Prioritas',
  scheme: 'Skema Dorongan Teknologi',
  // Nama sesuai logo pada materi program.
  parties: ['Kemdiktisaintek', 'Ditjen Risbang', 'Soegijapranata Catholic University', 'Roastek Power and Automation'],
}

export type GalleryItem = { src: string; alt: string; title: string; text: string; width: number; height: number }

export const exhibition: GalleryItem = {
  src: '/images/company/ksti-2026.jpg',
  alt: 'Panel Digihydrotek dan radar aliran dipamerkan di stan pameran KSTI 2026',
  title: 'Pameran KSTI 2026',
  text: 'Panel monitoring dan radar aliran Digihydrotek ditampilkan di pameran KSTI 2026.',
  width: 716,
  height: 532,
}

export const programPhoto: GalleryItem = {
  src: '/images/company/research-program.webp',
  alt: 'Panel monitoring Digihydrotek, tampak dalam dan tampak depan, pada materi Program Hilirisasi Riset Prioritas',
  title: 'Hilirisasi riset',
  text: 'Pengembangan panel monitoring melalui Program Hilirisasi Riset Prioritas, skema Dorongan Teknologi.',
  width: 1280,
  height: 720,
}

export const posters: GalleryItem[] = [
  {
    src: '/images/company/epc-technical-partner.webp',
    alt: 'Poster Digihydrotek: Mitra EPC dan teknis PLTA di Indonesia',
    title: 'Mitra EPC & teknis PLTA',
    text: 'Hydropower EPC, electrical & automation, dan technical service.',
    width: 1024,
    height: 1415,
  },
  {
    src: '/images/company/control-modernization.webp',
    alt: 'Poster Digihydrotek: Modernisasi sistem kontrol PLTA',
    title: 'Modernisasi sistem kontrol',
    text: 'Suku cadang, retrofit, dan dukungan teknis untuk sistem PLTA dan merek lainnya.',
    width: 1024,
    height: 1426,
  },
]
