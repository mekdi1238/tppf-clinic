@echo off
setlocal EnableDelayedExpansion
title Install TPPF Clinic Windows Service (24/7 Auto-Start)
cd /d "%~dp0"

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ELEVATION] Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo =========================================================
echo   Installing TPPF Clinic Windows Background Service
echo =========================================================
echo.
echo Configuration:
echo   - Mode: Real Windows Service (Session 0 background)
echo   - Auto-Start: Automatic on computer boot (No user login required)
echo   - Auto-Recovery: Restarts automatically in 5s if stopped/crashed
echo   - Port: 3000 (http://localhost:3000)
echo.

:: Ensure binary and xml exist in current folder
if not exist ClinicDeployService.exe (
    if exist "%~dp0..\ClinicDeployService.exe" copy "%~dp0..\ClinicDeployService.exe" "%~dp0" >nul
)

:: 1. Database migrations check
echo [1/3] Applying database migrations...
call node db/migrate.js up

:: 2. Install Service
echo.
echo [2/3] Installing Windows Service...
ClinicDeployService.exe stop >nul 2>&1
ClinicDeployService.exe uninstall >nul 2>&1
ClinicDeployService.exe install
if errorlevel 1 (
    echo [ERROR] Failed to install service.
    pause
    exit /b 1
)

:: 3. Start Service
echo.
echo [3/3] Starting Windows Service...
ClinicDeployService.exe start
if errorlevel 1 (
    echo [WARNING] Service installed, but failed to start immediately.
    echo Please check ClinicDeployService.err.log for details.
) else (
    echo.
    echo =========================================================
    echo [SUCCESS] Service installed & started successfully!
    echo.
    echo Server URL: http://localhost:3000
    echo The server will now run 24/7 and start automatically
    echo every time the computer boots up, even before user login.
    echo =========================================================
)

echo.
pause
