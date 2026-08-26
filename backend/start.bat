@echo off
REM Starts the BiteN Go API on Windows. Double-click this file, or run it from
REM PowerShell:  .\backend\start.bat
setlocal
cd /d "%~dp0"

if not exist .env (
  echo No .env found - copying .env.example. Edit it with your PostgreSQL password!
  copy .env.example .env >nul
)

if not exist node_modules (
  echo Installing backend dependencies...
  call npm install || exit /b 1
)

if not exist cpp\build\biten_engine.exe (
  echo Building the C++ engine...
  call cpp\build.bat || echo C++ build failed - the API will use the TypeScript fallback.
)

call npm run dev
