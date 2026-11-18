-- ============================================================================
-- 14 – ENERGY METER KINCANG DARI HMI (MQTT HAIWELL)
-- ============================================================================
-- Jalankan di SQL Editor SETELAH 13-model-lstm-kincang.sql. Aman dijalankan ulang.
--
-- Data listrik Kincang dikirim HMI Haiwell lewat MQTT dan diteruskan
-- services/src/hmi-bridge.ts (config/hmi-kincang.json) tiap 30 detik:
--   POWER.ACTIVE_POWER   daya aktif sebenarnya = KW_TOTAL_20KV ÷ 4 (arahan tim 18-11-2026)
--   POWER.VOLTAGE        tegangan fasa (rata-rata VOLT_AB/BC/CA ÷ 10 ÷ √3)
--   POWER.CURRENT        arus rata-rata tiga fasa (CURRENT_A/B/C ÷ 10)
--   POWER.FREQUENCY      frekuensi (FREKUENSI ÷ 100)
--   POWER.POWER_FACTOR   faktor daya (PF ÷ 1000)
-- ============================================================================

update public.tags set source_address = case tag_id
    when 'POWER.ACTIVE_POWER' then 'HMI MQTT MODNET_PLC_KW_TOTAL_20KV ÷ 4'
    when 'POWER.VOLTAGE' then 'HMI MQTT rata-rata MODNET_PLC_VOLT_AB/BC/CA ÷ 10 ÷ √3'
    when 'POWER.CURRENT' then 'HMI MQTT rata-rata MODNET_PLC_CURRENT_A/B/C ÷ 10'
    when 'POWER.FREQUENCY' then 'HMI MQTT MODNET_PLC_FREKUENSI ÷ 100'
    when 'POWER.POWER_FACTOR' then 'HMI MQTT MODNET_PLC_PF ÷ 1000'
    else source_address end
where station_id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10'
  and device_id = '10422b2e-269a-43ab-b75b-696307ed5878';

-- Aktifkan perangkat dan hanya tag yang dikirim HMI, agar tag lain (mis. kWh)
-- tidak memicu alarm "data stale". Data tetap per 30 detik, tetapi lewat
-- broker publik HMI bisa mengirim ulang data yang tertahan sampai belasan
-- menit; scan_interval 600 detik berarti alarm stale baru muncul bila tidak
-- ada data lebih dari 30 menit (3 × 600 detik).
update public.devices set enabled = true, scan_interval_sec = 600
where id = '10422b2e-269a-43ab-b75b-696307ed5878';

update public.tags
set enabled = tag_id in ('POWER.ACTIVE_POWER', 'POWER.VOLTAGE', 'POWER.CURRENT', 'POWER.FREQUENCY', 'POWER.POWER_FACTOR')
where station_id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10'
  and device_id = '10422b2e-269a-43ab-b75b-696307ed5878';

-- Cek setelah hmi-bridge berjalan:
--   select tag_id, value, quality, source_timestamp at time zone 'Asia/Jakarta' as wib
--   from public.latest_measurements
--   where station_id = '5b0d6f2e-3c1a-4b8e-9f47-2d6a1c8e7b10' and tag_id like 'POWER.%'
--   order by tag_id;
