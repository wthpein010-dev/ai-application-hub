@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or newer from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
node server.mjs
if errorlevel 1 pause
