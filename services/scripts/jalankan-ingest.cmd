@echo off
REM ==========================================================================
REM Menjalankan layanan ingest (MQTT -> Supabase) terus-menerus.
REM Bila program berhenti atau crash, dijalankan ulang otomatis 10 detik lagi.
REM Log: services\logs\ingest.log
REM ==========================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] ingest mulai>> logs\ingest.log
call npm run ingest >> logs\ingest.log 2>&1
echo [%date% %time%] ingest berhenti, dijalankan ulang 10 detik lagi>> logs\ingest.log
ping -n 11 127.0.0.1 > nul
goto loop
