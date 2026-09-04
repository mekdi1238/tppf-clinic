@echo off
setlocal EnableDelayedExpansion
title Uninstall TPPF Clinic Windows Service
cd /d "%~dp0"

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ELEVATION] Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo =========================================================
echo   Uninstalling TPPF Clinic Windows Background Service
echo =========================================================
echo.
ClinicDeployService.exe stop
ClinicDeployService.exe uninstall
echo.
echo [SUCCESS] Service uninstalled cleanly.
echo.
pause
