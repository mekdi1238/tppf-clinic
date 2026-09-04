@echo off
setlocal EnableDelayedExpansion
title TPPF Clinic Windows Service Status
cd /d "%~dp0"

echo =========================================================
echo       TPPF Clinic Windows Background Service Status
echo =========================================================
echo.
ClinicDeployService.exe status
echo.
echo --- Network Port 3000 Listening Status ---
netstat -ano | findstr ":3000"
if errorlevel 1 (
    echo [NOTE] Port 3000 is not currently active.
) else (
    echo [OK] Port 3000 is ACTIVE and listening for connections!
)
echo.
echo --- Recent Service Output Log (Last 15 lines) ---
if exist ClinicDeployService.out.log (
    powershell -Command "Get-Content -Path 'ClinicDeployService.out.log' -Tail 15 -ErrorAction SilentlyContinue"
) else (
    echo [No out log file yet]
)
echo.
echo --- Recent Service Error Log (Last 15 lines) ---
if exist ClinicDeployService.err.log (
    powershell -Command "Get-Content -Path 'ClinicDeployService.err.log' -Tail 15 -ErrorAction SilentlyContinue"
) else (
    echo [No error log file yet]
)
echo.
echo =========================================================
pause
