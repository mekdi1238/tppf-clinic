@echo off
setlocal EnableDelayedExpansion
title TPPF Clinic Management System - Deployment Server
cd /d "%~dp0"

:: Handle automatic non-interactive start flag from Task Scheduler / Startup Folder
if "%1"=="--autostart" goto AUTOSTART_LOOP

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
call npm run migrate:up
echo.

:MENU
echo ---------------------------------------------------------
echo Select Deployment Action:
echo ---------------------------------------------------------
echo   [1] Start Server Now (Interactive Console)
echo   [2] Start Server with Auto-Restart Crash Recovery
echo   [3] Configure Windows Auto-Start on System Boot (Task Scheduler)
echo   [4] Add Shortcut to User Startup Folder (Auto-launch on Login)
echo   [5] Remove Windows Auto-Start Task
echo   [6] Exit
echo ---------------------------------------------------------
set /p CHOICE="Enter choice [1-6]: "

if "%CHOICE%"=="1" goto START_INTERACTIVE
if "%CHOICE%"=="2" goto AUTOSTART_LOOP
if "%CHOICE%"=="3" goto INSTALL_SCHTASKS
if "%CHOICE%"=="4" goto INSTALL_STARTUP_FOLDER
if "%CHOICE%"=="5" goto REMOVE_SCHTASKS
if "%CHOICE%"=="6" exit /b 0

echo Invalid choice. Please select 1-6.
echo.
goto MENU

:START_INTERACTIVE
echo.
echo =========================================================
echo Starting TPPF Clinic Server...
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

:INSTALL_SCHTASKS
echo.
echo =========================================================
echo Creating Windows Task Scheduler Task for Auto-Start on Boot
echo =========================================================
echo Task Name: TPPF_Clinic_Server
echo Script: "%~dp0deploy.bat" --autostart
echo.

schtasks /Create /TN "TPPF_Clinic_Server" /TR "\"%~dp0deploy.bat\" --autostart" /SC ONSTART /RU SYSTEM /F >nul 2>&1
if errorlevel 1 (
    echo [NOTE] Standard permissions failed. Re-trying with current user login trigger...
    schtasks /Create /TN "TPPF_Clinic_Server" /TR "\"%~dp0deploy.bat\" --autostart" /SC ONLOGON /F >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Could not create Task Scheduler task.
        echo Please right-click deploy.bat and select "Run as Administrator".
    ) else (
        echo [SUCCESS] Windows Auto-Start Task created (runs on User Logon)!
    )
) else (
    echo [SUCCESS] Windows Auto-Start Task created successfully!
    echo The server will now start automatically whenever the computer boots up.
)
echo.
pause
goto MENU

:INSTALL_STARTUP_FOLDER
echo.
echo =========================================================
echo Adding Shortcut to User Startup Folder...
echo =========================================================
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_SCRIPT=%TEMP%\CreateStartupShortcut.vbs

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo sLinkFile = "%STARTUP_DIR%\TPPF_Clinic_Server.lnk" >> "%VBS_SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS_SCRIPT%"
echo oLink.TargetPath = "%~dp0deploy.bat" >> "%VBS_SCRIPT%"
echo oLink.Arguments = "--autostart" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%~dp0" >> "%VBS_SCRIPT%"
echo oLink.Description = "TPPF Clinic Auto Server Launcher" >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%" >nul 2>&1

echo [SUCCESS] Startup folder shortcut created at:
echo %STARTUP_DIR%\TPPF_Clinic_Server.lnk
echo.
pause
goto MENU

:REMOVE_SCHTASKS
echo.
echo =========================================================
echo Removing Windows Auto-Start Task...
echo =========================================================
schtasks /Delete /TN "TPPF_Clinic_Server" /F >nul 2>&1
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
if exist "%STARTUP_DIR%\TPPF_Clinic_Server.lnk" del "%STARTUP_DIR%\TPPF_Clinic_Server.lnk" >nul 2>&1
echo [SUCCESS] Auto-start tasks and shortcuts removed.
echo.
pause
goto MENU
