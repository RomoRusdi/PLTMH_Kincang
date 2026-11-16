-- ============================================================================
-- 10 – STASIUN PLTM SINGGI (1 × 200 kW, Banjarnegara)
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 01 sampai 09. Aman dijalankan ulang (upsert);
-- threshold alarm dan tabel bulanan yang sudah diubah dari web tidak ditimpa.
--
-- Isi: stasiun, perangkat (radar + PC gateway), tag radar beserta ambang alarm,
-- parameter estimasi daya, dan tabel rencana produksi 2026. Belum ada data
-- pengukuran; stasiun tampil "offline" sampai gateway Singgi mulai mengirim.
--
-- Sumber data:
--   - Spesifikasi Dashboard Radar Debit PLTM Singgi (16-11-2026), menggantikan
--     Laporan Kalibrasi Revisi 1 (15-11-2026)
--   - Profil Pembangkitan Tahun 2026 PLTMH Singgi (1 × 200 kW)
--
-- Catatan penting:
--   - Radar dipasang di saluran pembawa tepat sebelum turbin. Tidak ada
--     pelimpah di antara radar dan turbin, jadi debit radar = debit turbin.
--   - Koreksi K disimpan DI DALAM radar (register 0xC11E). Debit yang dikirim
--     sudah dikali K. JANGAN simpan kalibrasi dari menu Kalibrasi Sensor untuk
--     stasiun ini: kalibrasi web menghitung ulang debit dari kecepatan, padahal
--     kecepatan radar ikut dikali K.
--   - Kecepatan radar hanya indeks (sudah dikali K), bukan kecepatan air
--     sebenarnya, sehingga tag HYDRO.VELOCITY tidak dibuat.
--   - Per 16-11-2026 debit belum final (akurasi sampai ±30%): K = 3,73 terlalu
--     besar dan disarankan diturunkan ke 2,5 sementara. Level sudah bisa dipakai.
--
-- Nilai bertanda [SESUAIKAN] belum diketahui.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Stasiun dan parameter estimasi daya
-- ----------------------------------------------------------------------------
-- Daya dari debit = 9,8 × debit × rated head 7,70 m × 0,91 × 0,93
--                 = 63,86 × debit (kW), maksimal 200 kW.
-- Kapasitas turbin tercapai pada debit 3,13 m³/s; di atas itu web menampilkan
-- 200 kW dengan tanda "melebihi kapasitas turbin". Batas debit FS kontrak
-- 3,25 m³/s tidak pernah berpengaruh karena batas 200 kW tercapai lebih dulu.
-- Contoh (Spesifikasi bagian 4): 2,00 → 127,7 kW; 2,50 → 159,7 kW; 3,13 → 200 kW.
insert into public.stations (
  id, name, location, latitude, longitude, description, status, river_name,
  power_head_m, power_turbine_efficiency, power_generator_efficiency, power_efficiency,
  power_max_kw, power_design_flow_m3s
)
values (
  '017b0c85-42ea-4283-ae91-e6343368b854',
  'PLTM Singgi',
  'Kabupaten Banjarnegara, Jawa Tengah',          -- [SESUAIKAN] desa/kecamatan
  null, null,                                      -- [SESUAIKAN] koordinat, bisa diisi dari halaman Peta
  'Radar di saluran pembawa (persegi 2 × 2 m) tepat sebelum turbin, tanpa pelimpah di antaranya. Koreksi K tersimpan di radar; debit belum final sampai K ditetapkan dari data 7 hari.',
  'active',
  null,                                            -- [SESUAIKAN] nama sungai/saluran
  7.70, 0.91, 0.93, round((0.91 * 0.93)::numeric, 4)::float8,
  200, 3.25
)
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location,
  description = excluded.description,
  updated_at = now();
-- Koordinat, sungai, dan parameter daya sengaja tidak ditimpa saat dijalankan
-- ulang agar perubahan dari web tidak hilang.

-- ----------------------------------------------------------------------------
-- 2. Perangkat
-- ----------------------------------------------------------------------------
-- Tanpa PLC dan energy meter: gateway membaca radar langsung lewat USB ke
-- RS-485. Data generator (Active Power) masih di SCADA Singgi yang terpisah.
--
-- Perangkat dibuat NONAKTIF (enabled = false) supaya alarm engine tidak
-- membuat alarm "offline" dan "data stale" selama gateway Singgi belum jalan.
-- Data dari gateway tetap diterima walau nonaktif. Setelah data pertama
-- masuk, aktifkan dengan query di bagian paling bawah file ini.
insert into public.devices (id, station_id, name, device_type, protocol, modbus_address, status, enabled, scan_interval_sec, manufacturer, model, config)
values
  ('416d3544-f13e-4349-ab9b-89f7ecb080b1', '017b0c85-42ea-4283-ae91-e6343368b854',
   'Radar Flow-meter', 'radar_flowmeter', 'modbus_rtu', 1, 'offline', false, 60,
   'Shandong Renke', 'RS-RAD-N01-3',
   '{"tipe": "LM7863_GB", "firmware": "LM4_V1.4.62", "bus": "USB ke RS-485", "baud_rate": 9600, "parity": "none", "data_bits": 8, "stop_bits": 1,
     "kabel": "kuning = A, hijau = B, coklat = +9-30 VDC, putih = GND",
     "koreksi_k": 3.73, "koreksi_k_per": "2026-11-16 09:13 WIB", "koreksi_k_saran": 2.5, "koreksi_b": 0,
     "tipe_penampang": "persegi", "lebar_dasar_m": 2.0, "tinggi_pasang_m": 2.10,
     "catatan": "tinggi pasang belum diukur langsung (level absolut bisa meleset sampai ±10 cm); K final dari saran K setelah 7 hari data radar dan kW; jangan tulis baudrate, slave address, factory reset, angle calibration dari jauh"}'),
  ('ea17f506-5fa3-4341-a343-ab7a5b6c7733', '017b0c85-42ea-4283-ae91-e6343368b854',
   'PC Gateway', 'gateway', 'mqtt', null, 'offline', false, 60,
   null, null,
   '{"role": "baca radar via USB ke RS-485, publish JSON via MQTT", "config": "services/config/gateway-singgi-usb.json"}')
on conflict (id) do update set
  name = excluded.name,
  device_type = excluded.device_type,
  protocol = excluded.protocol,
  modbus_address = excluded.modbus_address,
  scan_interval_sec = excluded.scan_interval_sec,
  manufacturer = excluded.manufacturer,
  model = excluded.model,
  config = excluded.config;

-- ----------------------------------------------------------------------------
-- 3. Tag (harus sama dengan services/config/gateway-singgi-usb.json)
-- ----------------------------------------------------------------------------
-- Ambang alarm dari Spesifikasi bagian 7 (nilai normal semalam 15–16 Nov):
--   low/high          = Peringatan (prioritas high)
--   low_low/high_high = Alarm      (prioritas critical)
insert into public.tags (station_id, device_id, tag_id, name, description, value_type, unit, source_address,
                         alarm_low_low, alarm_low, alarm_high, alarm_high_high, deadband, display_precision)
values
  ('017b0c85-42ea-4283-ae91-e6343368b854', '416d3544-f13e-4349-ab9b-89f7ecb080b1',
   'HYDRO.WATER_LEVEL', 'Level Air', 'Level air saluran pembawa; tinggi pasang 2,10 m belum diukur langsung, nilai absolut bisa meleset sampai ±10 cm. Alarm < 0,30 m (hampir kering) atau > 1,80 m (hampir penuh)',
   'float', 'm', 'radar FC04 0xAA23 float32', 0.30, null, null, 1.80, 0.02, 3),
  ('017b0c85-42ea-4283-ae91-e6343368b854', '416d3544-f13e-4349-ab9b-89f7ecb080b1',
   'HYDRO.FLOW_RATE', 'Debit Saluran', 'Debit saluran pembawa = debit turbin (tidak ada pelimpah di antaranya), sudah dikali koreksi K di radar. Belum final, akurasi sampai ±30%',
   'float', 'm3/s', 'radar FC04 0xAA15 float32', null, null, null, null, 0.01, 3),
  ('017b0c85-42ea-4283-ae91-e6343368b854', '416d3544-f13e-4349-ab9b-89f7ecb080b1',
   'HYDRO.VOLUME', 'Volume Kumulatif', 'Akumulasi debit radar sejak terakhir di-reset (ikut dikali K)',
   'float', 'm3', 'radar FC04 0xAA25 float64', null, null, null, null, 0, 0),
  ('017b0c85-42ea-4283-ae91-e6343368b854', '416d3544-f13e-4349-ab9b-89f7ecb080b1',
   'HYDRO.POWER_EST', 'Daya Estimasi', 'Daya dari debit = 63,86 × debit radar (9,8 × 7,70 m × 0,91 × 0,93), maksimal 200 kW (debit ≥ 3,13 m³/s = melebihi kapasitas turbin)',
   'float', 'kW', 'hitungan dari HYDRO.FLOW_RATE', null, null, null, null, 0, 1),
  ('017b0c85-42ea-4283-ae91-e6343368b854', '416d3544-f13e-4349-ab9b-89f7ecb080b1',
   'RADAR.ANGLE', 'Sudut Radar', 'Peringatan bila bergeser > 0,5° dari 54,1° (cek dudukan); alarm bila > 3° dari 55° (pasang ulang)',
   'float', 'deg', 'radar FC04 0xAA22 int16 ÷ 100', 52.0, 53.6, 54.6, 58.0, 0.05, 2),
  ('017b0c85-42ea-4283-ae91-e6343368b854', '416d3544-f13e-4349-ab9b-89f7ecb080b1',
   'RADAR.TEMPERATURE', 'Suhu Radar', 'Suhu internal radar; peringatan > 60 °C, batas operasi 70 °C',
   'float', 'C', 'radar FC04 0xAA01 int16 ÷ 100', null, null, 60, null, 0.5, 1),
  ('017b0c85-42ea-4283-ae91-e6343368b854', '416d3544-f13e-4349-ab9b-89f7ecb080b1',
   'RADAR.ECHO_AMPLITUDE', 'Kualitas Sinyal Radar', 'Amplitudo echo; normal 78–84 dB, peringatan < 70 dB (hujan, benda di bawah radar, atau kotoran)',
   'float', 'dB', 'radar FC04 0xAA0B uint16', null, 70, null, null, 1, 0)
on conflict (station_id, tag_id) do update set
  device_id = excluded.device_id,
  name = excluded.name,
  description = excluded.description,
  value_type = excluded.value_type,
  unit = excluded.unit,
  source_address = excluded.source_address,
  display_precision = excluded.display_precision;
-- Threshold sengaja tidak ditimpa saat dijalankan ulang agar perubahan dari
-- menu Pengaturan tidak hilang.

-- Jarak sensor ke air tidak dikirim radar Singgi (hanya level).
delete from public.tags
where station_id = '017b0c85-42ea-4283-ae91-e6343368b854' and tag_id = 'HYDRO.AIR_GAP';

-- ----------------------------------------------------------------------------
-- 4. Tabel rencana produksi 2026 (Profil Pembangkitan PLTMH Singgi)
-- ----------------------------------------------------------------------------
-- Rated head 7,70 m sepanjang tahun. Debit rencana PSDA 2,50 m³/s, kecuali
-- April–Juli 2,60 m³/s. Pengeringan Agustus 13, September 12, Oktober 13 hari;
-- pemeliharaan 2 hari di bulan lainnya. Total rencana 1.201.471 kWh.
insert into public.station_power_monthly (station_id, month, head_m, permit_flow_m3s, drying_days, maintenance_days)
select '017b0c85-42ea-4283-ae91-e6343368b854'::uuid, v.month, v.head_m, v.permit_flow, v.drying, v.maintenance
from (values
  (1::smallint,  7.70::float8, 2.50::float8,  0::smallint, 2::smallint),
  (2,  7.70, 2.50,  0, 2),
  (3,  7.70, 2.50,  0, 2),
  (4,  7.70, 2.60,  0, 2),
  (5,  7.70, 2.60,  0, 2),
  (6,  7.70, 2.60,  0, 2),
  (7,  7.70, 2.60,  0, 2),
  (8,  7.70, 2.50, 13, 0),
  (9,  7.70, 2.50, 12, 0),
  (10, 7.70, 2.50, 13, 0),
  (11, 7.70, 2.50,  0, 2),
  (12, 7.70, 2.50,  0, 2)
) as v(month, head_m, permit_flow, drying, maintenance)
on conflict (station_id, month) do nothing;

-- ----------------------------------------------------------------------------
-- Cek: harus sama dengan kolom "Daya mampu" tabel (2,50 → 160 kW, 2,60 → 166 kW)
--
--   select pm.month, pm.permit_flow_m3s,
--          public.estimate_power_kw_at(pm.station_id, pm.permit_flow_m3s,
--            make_timestamptz(2026, pm.month, 15, 12, 0, 0, 'Asia/Jakarta')) as daya_kw
--   from public.station_power_monthly pm
--   where pm.station_id = '017b0c85-42ea-4283-ae91-e6343368b854'
--   order by pm.month;
--
-- Akses: superadmin langsung melihat stasiun ini. Admin/operator Singgi
-- dibuat dari halaman Pengguna dengan memilih stasiun PLTM Singgi.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- SETELAH GATEWAY SINGGI MENGIRIM DATA: aktifkan alarm offline/stale.
-- Jalankan terpisah (blok ke query ini saja, lalu Run). Jalankan ulang file
-- ini tidak menonaktifkan perangkat lagi.
--
--   update public.devices set enabled = true
--   where station_id = '017b0c85-42ea-4283-ae91-e6343368b854';
-- ----------------------------------------------------------------------------
