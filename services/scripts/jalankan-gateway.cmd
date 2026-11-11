@echo off
REM ==========================================================================
REM Menjalankan gateway (radar -> MQTT) terus-menerus.
REM Bila program berhenti atau crash, dijalankan ulang otomatis 10 detik lagi.
REM Jalur baca dipilih lewat GATEWAY_CONFIG di file services\.env:
REM   config/gateway-radar-usb.json  radar via adaptor USB ke RS-485
REM   config/gateway-radar-usr.json  radar via converter USR-TCP232-304
REM   config/gateway.json            PLC (Modbus TCP)
REM Log: services\logs\gateway.log
REM ==========================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] gateway mulai (config dari GATEWAY_CONFIG di .env)>> logs\gateway.log
call npm run gateway >> logs\gateway.log 2>&1
echo [%date% %time%] gateway berhenti, dijalankan ulang 10 detik lagi>> logs\gateway.log
ping -n 11 127.0.0.1 > nul
goto loop
