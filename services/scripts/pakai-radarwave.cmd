@echo off
REM ==========================================================================
REM Lepaskan COM port untuk aplikasi RadarWave.
REM Menghentikan task "PLTMH Gateway" (satu COM port hanya bisa dipakai satu
REM aplikasi). Selama RadarWave dipakai, web menampilkan "komunikasi gagal".
REM Setelah RadarWave DITUTUP, jalankan kembali-ke-web.cmd.
REM Klik kanan file ini -> Run as administrator.
REM ==========================================================================
schtasks /End /TN "PLTMH Gateway"
REM Mengakhiri task belum tentu menutup program Node di dalamnya; tutup juga
REM agar COM port benar-benar bebas.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'gateway.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo Gateway dihentikan. COM port bebas, silakan buka RadarWave.
echo Setelah RadarWave DITUTUP, jalankan kembali-ke-web.cmd.
pause
