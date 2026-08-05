@echo off
setlocal EnableDelayedExpansion
title TPPF Clinic Management System - Setup
cd /d "%~dp0"

echo =========================================================
echo       TPPF Clinic Management System - Setup
echo =========================================================
echo.

:: 1. Check Node.js
echo [1/5] Checking Node.js installation...
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is NOT installed or not in your system PATH!
    echo Please download and install Node.js LTS version from https://nodejs.org/
    echo After installing, restart this script.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo     - Node.js version: !NODE_VERSION! (OK)
echo.

:: 2. Check npm
echo [2/5] Checking npm package manager...
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm is NOT installed or not in your system PATH!
    echo Please install Node.js which includes npm.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do set NPM_VERSION=%%v
echo     - npm version: !NPM_VERSION! (OK)
echo.

:: 3. Check environment configuration (.env)
echo [3/5] Checking environment file (.env)...
if exist .env goto ENV_EXISTS

if exist .env.example (
    echo     - Creating .env from .env.example...
    copy .env.example .env >nul
    echo     - .env created successfully!
    echo     [NOTE] Please update DATABASE_URL in .env if your PostgreSQL setup differs.
    goto ENV_DONE
)

echo     [WARNING] .env.example not found!
goto ENV_DONE

:ENV_EXISTS
echo     - .env file found (OK).

:ENV_DONE
echo.

:: 4. Install Node modules
echo [4/5] Checking and installing npm dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install npm dependencies! Please check internet connection or npm logs.
    echo.
    pause
    exit /b 1
)
echo     - Dependencies installed successfully! (OK)
echo.

:: 5. Database Migrations and Seeding
echo [5/5] Checking database connectivity and running migrations...
call npm run migrate:up
if errorlevel 1 (
    echo.
    echo [WARNING] Migration encountered an issue!
    echo Please check that PostgreSQL is running and the DATABASE_URL in .env is correct.
    echo Default connection expected: postgresql://tppf_dev:tppf_dev_pw@localhost:5432/tppf_clinic_dev
    echo.
    echo Press any key to attempt running seed anyway, or Ctrl+C to stop.
    pause >nul
) else (
    echo     - Database migrations applied successfully! (OK)
)

echo.
echo Running reference data seed script (admin user and lab catalog)...
call npm run seed
echo.

echo =========================================================
echo [SUCCESS] Setup completed!
echo.
echo To start the server and deploy:
echo   Run "deploy.bat"
echo =========================================================
echo.
