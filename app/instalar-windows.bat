@echo off
REM Instala MX Wharehouse en esta PC. Clic derecho -> Ejecutar como administrador.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-windows.ps1"
pause
