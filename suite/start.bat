@echo off
setlocal
cd /d "%~dp0"
title Pushkaralu 2027 Suite
echo.
echo   Pushkaralu 2027 Suite - starting...
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
if %NODEMAJOR% LSS 18 (
  echo   Node.js %NODEMAJOR% is too old. Version 18 or newer is needed.
  goto :install
)

if not defined PORT set PORT=8080
echo   If Windows Firewall asks, tick "Private networks" and click Allow
echo   so phones on your Wi-Fi can open the pilgrim and field apps.
echo.
node server.mjs --open
echo.
echo   The server stopped. Read any message above, then press a key to close.
pause >nul
exit /b 0

:nonode
echo   Node.js is not installed on this laptop. It is the only thing the suite needs.
:install
echo.
where winget >nul 2>nul
if errorlevel 1 goto :manual
echo   Installing Node.js LTS with winget (about 30 MB). Approve the prompt if one appears...
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo   Done. CLOSE this window, then double-click start.bat again
echo   (a new window is needed so Windows picks up Node.js).
pause
exit /b 1

:manual
echo   Download the Windows Installer (.msi) for the LTS version from
echo     https://nodejs.org/en/download
echo   Run it with the default options, then double-click start.bat again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1
