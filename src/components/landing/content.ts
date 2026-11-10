// ============================================================================
// Konten landing page Digihidrotech.
// Ubah teks di file ini; komponen tampilan tidak perlu disentuh.
//
// Aturan: angka dan klaim harus bisa dipertanggungjawabkan. Spesifikasi di
// bawah diambil dari manual radar RS-RAD-N01-3 dan implementasi sistem.
// Kontak yang dikosongkan tidak ditampilkan di halaman.
// ============================================================================

export const company = {
  name: 'Digihidrotech',
  tagline: 'Monitoring sungai untuk PLTMH',
  description:
    'Digihidrotech menghadirkan sistem monitoring aliran sungai dan kelistrikan untuk Pembangkit Listrik Tenaga Mikrohidro, dari sensor di lapangan hingga dashboard di layar operator.',
  // [SESUAIKAN] isi bila sudah tersedia; nilai kosong tidak ditampilkan.
  contact: {
    email: '',
    whatsapp: '', // format internasional tanpa +, mis. 6281234567890
    address: '',
  },
}

export const hero = {
  eyebrow: 'Sistem Monitoring Sungai untuk PLTMH',
  // Judul hero ada di routes/index.tsx karena sebagian katanya diberi gradien.
  description:
    'Radar non-kontak mengukur level air, kecepatan aliran, dan debit. Data dari panel kontrol dikirim ke cloud dan tampil di dashboard dalam hitungan detik, lengkap dengan alarm dan riwayat.',
}

export const specs = [
  { value: '±1 mm', label: 'Ketelitian ukur level air', detail: 'Radar FMCW 77–79 GHz' },
  { value: '0,1–20 m/s', label: 'Rentang kecepatan aliran', detail: 'Radar Doppler 24 GHz' },
  { value: '1 menit', label: 'Interval pembaruan data', detail: 'Dari panel ke dashboard' },
  { value: 'IP67', label: 'Sensor tahan cuaca', detail: 'Tanpa kontak dengan air' },
]

export const challenges = [
  {
    title: 'Debit menentukan daya',
    text: 'Produksi listrik PLTMH bergantung langsung pada debit sungai. Tanpa data aliran yang akurat, operator sulit menyesuaikan operasi saat debit berubah.',
  },
  {
    title: 'Gangguan terlambat diketahui',
    text: 'Banjir, debit rendah, atau sensor yang berhenti mengirim data sering baru disadari saat operator memeriksa lokasi. Alarm otomatis memangkas waktu tanggap.',
  },
  {
    title: 'Keputusan butuh data historis',
    text: 'Catatan manual tidak cukup untuk melihat pola musiman. Riwayat data yang tersimpan rapi menjadi dasar evaluasi dan prediksi.',
  },
]

export const pipeline = [
  { step: 'Radar Flow-meter', text: 'Mengukur level, kecepatan, dan debit tanpa menyentuh air, melalui RS-485 Modbus RTU.' },
  { step: 'PLC & HMI', text: 'Membaca sensor, menjalankan logika lokal, dan menampilkan data di panel kontrol.' },
  { step: 'PC Gateway', text: 'Membaca register PLC lewat Modbus TCP, memberi tanda kualitas data, dan menyusun JSON.' },
  { step: 'MQTT via ZeroTier', text: 'Mengirim data melalui jaringan virtual terenkripsi, dengan buffer saat koneksi terputus.' },
  { step: 'Cloud & Dashboard', text: 'Menyimpan data, mengevaluasi alarm, dan menampilkannya secara real-time di web.' },
]

export const features = [
  { icon: 'activity', title: 'Monitoring real-time', text: 'Level air, kecepatan, debit, daya, dan suhu panel diperbarui otomatis tanpa memuat ulang halaman.' },
  { icon: 'bell', title: 'Alarm bertingkat', text: 'Batas High-High, High, Low, dan Low-Low per parameter, dengan deadband dan acknowledge oleh operator.' },
  { icon: 'shield', title: 'Validasi kualitas data', text: 'Setiap nilai diberi tanda good, stale, atau gangguan komunikasi agar data rusak tidak terbaca normal.' },
  { icon: 'chart', title: 'Riwayat & laporan', text: 'Grafik tren hingga tiga bulan, statistik alarm, laporan gangguan, dan ekspor CSV.' },
  { icon: 'users', title: 'Akses berbasis peran', text: 'Lima tingkat pengguna dari viewer hingga superadmin, dibatasi langsung di tingkat database.' },
  { icon: 'brain', title: 'Prediksi berbasis AI', text: 'Prediksi kondisi aliran dari data historis untuk mendukung perencanaan operasi.', soon: true },
] as const

export const hardware = [
  {
    name: 'Radar Flow-meter',
    model: 'RS-RAD-N01-3',
    points: ['Level air, kecepatan, debit, volume, arah aliran', 'Non-kontak, tahan sedimen', 'Catu daya 10–30 VDC, IP67'],
  },
  {
    name: 'PLC & HMI',
    model: 'Haiwell 24 VDC',
    points: ['Master Modbus RTU ke radar', 'Logika alarm dan scaling lokal', 'Tampilan operator di panel'],
  },
  {
    name: 'Energy Meter',
    model: 'Monitoring kelistrikan',
    points: ['Tegangan, arus, daya aktif', 'Energi, faktor daya, frekuensi', 'Terbaca bersama data sungai'],
  },
  {
    name: 'Panel Kontrol',
    model: 'Enclosure terproteksi',
    points: ['Power supply 24 VDC, MCB, proteksi', 'Thermostat dan kipas panel', 'Terminal block dan cable duct'],
  },
]

export const deployment = {
  site: 'PLTMH Kincang, Banjarnegara, Jawa Tengah',
  status: 'Tahap uji implementasi',
  steps: [
    { label: 'Tantangan', text: 'Kondisi aliran sungai yang memengaruhi produksi listrik belum terpantau secara terus-menerus dan terpusat.' },
    { label: 'Solusi', text: 'Radar flow-meter non-kontak, panel kontrol dengan PLC dan HMI, serta dashboard web dengan alarm otomatis.' },
    { label: 'Implementasi', text: 'Panel dirakit dan dihubungkan ke radar; data dikirim dari gateway ke cloud melalui MQTT dan ZeroTier.' },
    { label: 'Hasil', text: 'Data aliran dan kelistrikan pembangkit tampil di satu dashboard; pengujian lapangan sedang berlangsung.' },
  ],
}
