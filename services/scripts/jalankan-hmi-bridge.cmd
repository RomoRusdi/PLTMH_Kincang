@echo off
REM ==========================================================================
REM Menjalankan penghubung HMI Haiwell -> ingest (data daya dari HMI ke web)
REM terus-menerus. Bila berhenti atau crash, dijalankan ulang 10 detik lagi.
REM Config: HMI_BRIDGE_CONFIG di services\.env (bawaan config/hmi-kincang.json)
REM Log   : services\logs\hmi-bridge.log
REM ==========================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] hmi-bridge mulai>> logs\hmi-bridge.log
call npm run hmi-bridge >> logs\hmi-bridge.log 2>&1
echo [%date% %time%] hmi-bridge berhenti, dijalankan ulang 10 detik lagi>> logs\hmi-bridge.log
ping -n 11 127.0.0.1 > nul
goto loop
