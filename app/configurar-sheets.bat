@echo off
REM Conecta la copia de tickets con Google Sheets. Doble clic. Ver LEEME.md, seccion "Copia en Google Sheets".
cd /d "%~dp0"
call npm run sheets:setup
pause
