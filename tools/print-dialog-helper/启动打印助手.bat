@echo off
pushd "%~dp0"
echo Starting tapePrinter local print helper...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-bridge.ps1"
pause
