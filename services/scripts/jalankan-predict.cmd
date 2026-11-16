@echo off
REM ==========================================================================
REM Menjalankan worker prediksi AI (Supabase -> model ONNX -> tabel predictions)
REM terus-menerus. Bila berhenti atau crash, dijalankan ulang 60 detik lagi.
REM Config: PREDICT_CONFIG di services\.env (bawaan config/predict-kincang.json)
REM Model : services\models\ (file .onnx dan .json dari AI Engineer)
REM Log   : services\logs\predict.log
REM ==========================================================================
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] predict mulai>> logs\predict.log
call npm run predict >> logs\predict.log 2>&1
echo [%date% %time%] predict berhenti, dijalankan ulang 60 detik lagi>> logs\predict.log
ping -n 61 127.0.0.1 > nul
goto loop
