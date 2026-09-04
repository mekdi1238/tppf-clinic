@echo off
setlocal EnableDelayedExpansion
title TPPF Clinic Management System - Deployment Control Panel
cd /d "%~dp0"

:: Handle direct command line flags
if "%1"=="--autostart" goto AUTOSTART_LOOP
if "%1"=="--install-service" goto INSTALL_SERVICE_ACTION
if "%1"=="--uninstall-service" goto UNINSTALL_SERVICE_ACTION
if "%1"=="--start-service" goto START_SERVICE_ACTION
if "%1"=="--stop-service" goto STOP_SERVICE_ACTION
if "%1"=="--restart-service" goto RESTART_SERVICE_ACTION
if "%1"=="--status-service" goto STATUS_SERVICE_ACTION

echo =========================================================
echo       TPPF Clinic Management System - Deployment
echo =========================================================
echo.

:: Check if setup has been executed
if not exist node_modules (
    echo [NOTICE] node_modules not found. Launching setup.bat first...
    echo.
    call setup.bat
    if errorlevel 1 exit /b 1
)

if not exist .env (
    echo [NOTICE] .env file not found. Launching setup.bat first...
    echo.
    call setup.bat
    if errorlevel 1 exit /b 1
)

:: Run migrations automatically before startup
echo [PRE-FLIGHT] Checking database migrations...
call node db/migrate.js up
echo.

:MENU
echo ---------------------------------------------------------
echo Select Deployment / Service Action:
echo ---------------------------------------------------------
echo   [1] Start Server Now (Interactive Console)
echo   [2] Install Windows Background Service (Runs 24/7 on Boot without login)
echo   [3] Start Windows Service
echo   [4] Stop Windows Service
echo   [5] Restart Windows Service
echo   [6] Check Windows Service Status & Logs
echo   [7] Uninstall Windows Service
echo   [8] Run Database Migrations (migrate:up)
echo   [9] Exit
echo ---------------------------------------------------------
set /p CHOICE="Enter choice [1-9]: "

if "%CHOICE%"=="1" goto START_INTERACTIVE
if "%CHOICE%"=="2" goto ELEVATE_INSTALL_SERVICE
if "%CHOICE%"=="3" goto ELEVATE_START_SERVICE
if "%CHOICE%"=="4" goto ELEVATE_STOP_SERVICE
if "%CHOICE%"=="5" goto ELEVATE_RESTART_SERVICE
if "%CHOICE%"=="6" goto STATUS_SERVICE_ACTION
if "%CHOICE%"=="7" goto ELEVATE_UNINSTALL_SERVICE
if "%CHOICE%"=="8" goto RUN_MIGRATIONS
if "%CHOICE%"=="9" exit /b 0

echo Invalid choice. Please select 1-9.
echo.
goto MENU

:START_INTERACTIVE
echo.
echo =========================================================
echo Starting TPPF Clinic Server (Interactive Console)...
echo Access in browser at: http://localhost:3000
echo Press Ctrl+C to stop the server.
echo =========================================================
echo.
call npm run dev
pause
goto MENU

:AUTOSTART_LOOP
echo.
echo =========================================================
echo Starting Server in Resilient Auto-Restart Loop Mode...
echo Server URL: http://localhost:3000
echo =========================================================
echo.

:SERVER_RUN_LOOP
echo [%DATE% %TIME%] Launching Node.js Server...
node server/src/server.js
echo.
echo [WARNING] Server stopped or crashed unexpectedly at %TIME%.
echo Restarting server automatically in 5 seconds... (Press Ctrl+C to abort)
timeout /t 5 >nul
goto SERVER_RUN_LOOP

:RUN_MIGRATIONS
echo.
echo Running database migrations...
call node db/migrate.js up
echo.
pause
goto MENU

:: -----------------------------------------------------------
:: Windows Service Elevation & Actions
:: -----------------------------------------------------------

:ELEVATE_INSTALL_SERVICE
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ELEVATION] Requesting Administrator privileges to install Windows Service...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--install-service' -Verb RunAs"
    goto MENU
)
goto INSTALL_SERVICE_ACTION

:INSTALL_SERVICE_ACTION
echo.
echo =========================================================
echo Installing TPPF Clinic Windows Background Service
echo =========================================================
echo Service will start automatically on boot (no login required).
echo.

:: Ensure binary and xml exist in current folder
if not exist ClinicDeployService.exe (
    if exist "%~dp0..\ClinicDeployService.exe" copy "%~dp0..\ClinicDeployService.exe" "%~dp0" >nul
)

:: Run migrations first
echo [1/3] Ensuring database is up to date...
call node db/migrate.js up

:: Stop existing service if already installed
echo [2/3] Installing Windows Service...
ClinicDeployService.exe stop >nul 2>&1
ClinicDeployService.exe uninstall >nul 2>&1
ClinicDeployService.exe install
if errorlevel 1 (
    echo.
    echo [ERROR] Service installation failed. Make sure you ran as Administrator.
    pause
    if "%1"=="" goto MENU
    exit /b 1
)

echo [3/3] Starting Windows Service...
ClinicDeployService.exe start
if errorlevel 1 (
    echo.
    echo [WARNING] Service installed, but could not start immediately.
    echo Check logs in ClinicDeployService.err.log
) else (
    echo.
    echo =========================================================
    echo [SUCCESS] Windows Service installed and running 24/7!
    echo Display Name: TPPF Clinic Management System
    echo Server URL:   http://localhost:3000
    echo It will start automatically every time the PC is turned on.
    echo =========================================================
)
echo.
pause
if "%1"=="" goto MENU
exit /b 0

:ELEVATE_START_SERVICE
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--start-service' -Verb RunAs"
    goto MENU
)
goto START_SERVICE_ACTION

:START_SERVICE_ACTION
echo.
echo Starting TPPF Clinic Windows Service...
ClinicDeployService.exe start
echo.
pause
if "%1"=="" goto MENU
exit /b 0

:ELEVATE_STOP_SERVICE
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--stop-service' -Verb RunAs"
    goto MENU
)
goto STOP_SERVICE_ACTION

:STOP_SERVICE_ACTION
echo.
echo Stopping TPPF Clinic Windows Service...
ClinicDeployService.exe stop
echo.
pause
if "%1"=="" goto MENU
exit /b 0

:ELEVATE_RESTART_SERVICE
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--restart-service' -Verb RunAs"
    goto MENU
)
goto RESTART_SERVICE_ACTION

:RESTART_SERVICE_ACTION
echo.
echo Restarting TPPF Clinic Windows Service...
ClinicDeployService.exe restart
echo.
pause
if "%1"=="" goto MENU
exit /b 0

:STATUS_SERVICE_ACTION
echo.
echo =========================================================
echo TPPF Clinic Windows Service Status
echo =========================================================
ClinicDeployService.exe status
echo.
echo --- Network Port 3000 Listening Check ---
netstat -ano | findstr ":3000"
echo.
echo --- Recent Service Output Log (Last 10 lines) ---
if exist ClinicDeployService.out.log (
    powershell -Command "Get-Content -Path 'ClinicDeployService.out.log' -Tail 10 -ErrorAction SilentlyContinue"
) else (
    echo [No out log file yet]
)
echo.
echo --- Recent Service Error Log (Last 10 lines) ---
if exist ClinicDeployService.err.log (
    powershell -Command "Get-Content -Path 'ClinicDeployService.err.log' -Tail 10 -ErrorAction SilentlyContinue"
) else (
    echo [No error log file yet]
)
echo =========================================================
echo.
pause
if "%1"=="" goto MENU
exit /b 0

:ELEVATE_UNINSTALL_SERVICE
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--uninstall-service' -Verb RunAs"
    goto MENU
)
goto UNINSTALL_SERVICE_ACTION

:UNINSTALL_SERVICE_ACTION
echo.
echo =========================================================
echo Uninstalling TPPF Clinic Windows Background Service
echo =========================================================
ClinicDeployService.exe stop
ClinicDeployService.exe uninstall
echo.
echo [SUCCESS] Windows Service uninstalled.
echo.
pause
if "%1"=="" goto MENU
exit /b 0
