@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Deploy-WindowsWorkerSourceUpdate.ps1"
