-- ============================================================================
-- DIGIHYDROTEK - DATA KONFIGURASI STASIUN
-- ============================================================================
-- Jalankan setelah 01-schema.sql sampai 06-manajemen-pengguna.sql.
-- Aman dijalankan ulang (upsert).
--
-- Isi file ini adalah konfigurasi, bukan data pengukuran: satu stasiun PLTMH,
-- perangkat yang terpasang di panel, dan daftar tag yang dikirim gateway.
-- tag_id di sini harus sama persis dengan konfigurasi gateway
-- (services/config/gateway.json) karena ingest_telemetry menolak tag yang tidak terdaftar.
--
-- Nilai bertanda [SESUAIKAN] adalah placeholder sampai data lapangan pasti.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Stasiun
-- ----------------------------------------------------------------------------
insert into public.stations (id, name, location, latitude, longitude, description, status, river_name)
values (
  '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10',
  'PLTMH Kincang',                              -- nama stasiun (Google Maps: "PLTMH Kincang 2")
  'Kabupaten Banjarnegara, Jawa Tengah',         -- [SESUAIKAN] desa/kecamatan
  -7.4205088, 109.5504972,                       -- titik PLTMH Kincang dari Google Maps
  'Stasiun monitoring aliran sungai untuk operasional PLTMH',
  'active',
  null                                           -- [SESUAIKAN] nama sungai/saluran
)
on conflict (id) do update set
  name = excluded.name,
  location = excluded.location,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  description = excluded.description,
  river_name = excluded.river_name,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- Perangkat (status awal offline; berubah online saat telemetry pertama masuk)
-- ----------------------------------------------------------------------------
insert into public.devices (id, station_id, name, device_type, protocol, modbus_address, status, scan_interval_sec, manufacturer, model, config)
values
  ('7df3b847-b372-4933-bd4a-19bf6e9d9e73', '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10',
   'Radar Flow-meter', 'radar_flowmeter', 'modbus_rtu', 1, 'offline', 60,
   'Shandong Renke', 'RS-RAD-N01-3',
   '{"bus": "RS-485 ke PLC", "baud_rate": null, "parity": "none", "note": "baud rate default di manual tidak konsisten (4800/9600), verifikasi di alat"}'),
  ('ddd397f1-053b-4663-ace2-0c6db53ebc5a', '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10',
   'PLC Panel', 'plc', 'modbus_tcp', null, 'offline', 60,
   null, null,                                    -- [SESUAIKAN] merek/tipe PLC
   '{"role": "master Modbus RTU ke radar, slave Modbus TCP ke gateway"}'),
  ('10422b2e-269a-43ab-b75b-696307ed5878', '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10',
   'Energy Meter', 'power_meter', 'modbus_rtu', null, 'offline', 60,
   null, null,                                    -- [SESUAIKAN] merek/tipe energy meter
   '{}'),
  ('ea2215f6-239f-4173-b998-8faa1334f67f', '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10',
   'PC Gateway', 'gateway', 'mqtt', null, 'offline', 60,
   null, null,
   '{"role": "baca PLC via Modbus TCP, publish JSON via MQTT melalui ZeroTier"}')
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
-- Tag
-- source_address mencatat asal data di radar/PLC agar mudah ditelusuri.
-- Threshold alarm adalah placeholder dan dapat diubah dari menu Pengaturan.
-- ----------------------------------------------------------------------------
insert into public.tags (station_id, device_id, tag_id, name, description, value_type, unit, source_address,
                         alarm_low_low, alarm_low, alarm_high, alarm_high_high, deadband, display_precision)
values
  -- Radar RS-RAD-N01-3 (dibaca PLC lewat Modbus RTU, diteruskan ke gateway)
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '7df3b847-b372-4933-bd4a-19bf6e9d9e73',
   'HYDRO.WATER_LEVEL', 'Level Air', 'Tinggi muka air = tinggi pasang - jarak sensor ke permukaan',
   'float', 'm', 'radar IR 2 FC04 (mm)', 0.15, 0.30, 1.50, 2.00, 0.02, 3),        -- [SESUAIKAN] threshold
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '7df3b847-b372-4933-bd4a-19bf6e9d9e73',
   'HYDRO.VELOCITY', 'Kecepatan Aliran', 'Kecepatan permukaan air (Doppler 24 GHz)',
   'float', 'm/s', 'radar IR 1 FC04 (mm/s)', null, null, 3.00, 4.00, 0.05, 2),    -- [SESUAIKAN] threshold
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '7df3b847-b372-4933-bd4a-19bf6e9d9e73',
   'HYDRO.FLOW_RATE', 'Debit Aliran', 'Debit sesaat; bergantung parameter penampang saluran di radar',
   'float', 'm3/s', 'radar IR 4 FC04 (m3/s x1000)', null, 0.10, null, null, 0.01, 3), -- [SESUAIKAN] threshold
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '7df3b847-b372-4933-bd4a-19bf6e9d9e73',
   'HYDRO.VOLUME', 'Volume Kumulatif', 'Akumulasi volume air sejak penghitung radar direset',
   'float', 'm3', 'radar (register belum teridentifikasi)', null, null, null, null, 0, 0),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '7df3b847-b372-4933-bd4a-19bf6e9d9e73',
   'HYDRO.AIR_GAP', 'Jarak Sensor ke Air', 'Jarak dari radar ke permukaan air',
   'float', 'm', 'radar IR 3 FC04 (mm)', null, null, null, null, 0, 3),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '7df3b847-b372-4933-bd4a-19bf6e9d9e73',
   'HYDRO.FLOW_DIRECTION', 'Arah Aliran', '0 = searah aliran, 1 = melawan arus',
   'integer', '-', 'radar (register belum teridentifikasi)', null, null, null, null, 0, 0),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '7df3b847-b372-4933-bd4a-19bf6e9d9e73',
   'HYDRO.POWER_EST', 'Daya Estimasi', 'Dihitung dari debit: 9,81 x debit x tinggi jatuh x efisiensi, dibatasi kapasitas maksimal',
   'float', 'kW', 'hitungan dari HYDRO.FLOW_RATE', null, null, null, null, 0, 1),

  -- Energy meter
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '10422b2e-269a-43ab-b75b-696307ed5878',
   'POWER.VOLTAGE', 'Tegangan', 'Tegangan fasa',
   'float', 'V', 'PLC [SESUAIKAN]', 187, 198, 242, 253, 2, 1),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '10422b2e-269a-43ab-b75b-696307ed5878',
   'POWER.CURRENT', 'Arus', 'Arus beban',
   'float', 'A', 'PLC [SESUAIKAN]', null, null, null, null, 0, 2),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '10422b2e-269a-43ab-b75b-696307ed5878',
   'POWER.ACTIVE_POWER', 'Daya Aktif', 'Daya aktif keluaran generator',
   'float', 'kW', 'PLC [SESUAIKAN]', null, null, null, null, 0, 2),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '10422b2e-269a-43ab-b75b-696307ed5878',
   'POWER.ENERGY_KWH', 'Energi Kumulatif', 'Energi terukur sejak meter dipasang',
   'float', 'kWh', 'PLC [SESUAIKAN]', null, null, null, null, 0, 1),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '10422b2e-269a-43ab-b75b-696307ed5878',
   'POWER.POWER_FACTOR', 'Faktor Daya', null,
   'float', 'PF', 'PLC [SESUAIKAN]', null, 0.80, null, null, 0.01, 2),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', '10422b2e-269a-43ab-b75b-696307ed5878',
   'POWER.FREQUENCY', 'Frekuensi', null,
   'float', 'Hz', 'PLC [SESUAIKAN]', 48.5, 49.5, 50.5, 51.5, 0.1, 2),

  -- Panel dan status komunikasi (diolah PLC)
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', 'ddd397f1-053b-4663-ace2-0c6db53ebc5a',
   'PANEL.TEMPERATURE', 'Suhu Panel', 'Temperatur di dalam enclosure panel',
   'float', 'C', 'PLC [SESUAIKAN]', null, null, 45, 55, 1, 1),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', 'ddd397f1-053b-4663-ace2-0c6db53ebc5a',
   'PANEL.FAN_STATUS', 'Kipas Panel', '1 = kipas menyala, 0 = mati',
   'boolean', '-', 'PLC [SESUAIKAN]', null, null, null, null, 0, 0),
  ('5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10', 'ddd397f1-053b-4663-ace2-0c6db53ebc5a',
   'SYS.RADAR_COMM', 'Komunikasi Radar', '0 = normal, 1 = PLC tidak menerima respons Modbus dari radar',
   'integer', '-', 'PLC [SESUAIKAN]', null, null, 1, null, 0, 0)
on conflict (station_id, tag_id) do update set
  station_id = excluded.station_id,
  device_id = excluded.device_id,
  name = excluded.name,
  description = excluded.description,
  value_type = excluded.value_type,
  unit = excluded.unit,
  source_address = excluded.source_address,
  display_precision = excluded.display_precision;
-- Threshold sengaja tidak ditimpa saat dijalankan ulang agar perubahan dari
-- menu Pengaturan tidak hilang.

-- Parameter estimasi daya (migrasi 005), data operator PLTMH Kincang:
-- tinggi jatuh 4,7 m, kapasitas maksimal 320 kW. Efisiensi 0,8 perkiraan awal.
update public.stations
set power_head_m = 4.7, power_efficiency = 0.8, power_max_kw = 320
where id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10' and power_head_m is null;
