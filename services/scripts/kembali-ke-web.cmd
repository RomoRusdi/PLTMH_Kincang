@echo off
REM ==========================================================================
REM Kembalikan COM port ke sistem monitoring web.
REM Tutup RadarWave dulu, lalu klik kanan file ini -> Run as administrator.
REM ==========================================================================
schtasks /Run /TN "PLTMH Gateway"
echo.
echo Gateway dijalankan lagi. Dalam 1-2 menit data di web kembali normal.
pause
