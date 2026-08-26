@echo off
REM ===========================================================================
REM  doctor.bat — double-click this.
REM
REM  It installs everything, type-checks and really builds both halves of the
REM  project, and (if the backend happens to be running) logs in as every role
REM  and calls the main endpoints. All of it lands in doctor-report.txt next to
REM  this file — send that one file to Claude and every error is visible.
REM
REM  Nothing here changes your database. It is safe to run as often as you like.
REM ===========================================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0doctor.ps1"
