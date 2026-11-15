@echo off
REM Inicia el sistema de incidencias. Programador de tareas: "Al iniciar sesión", reiniciar si falla.
cd /d "%~dp0"
:loop
call npm start
echo El servidor se detuvo. Reintentando en 10 segundos...
timeout /t 10 /nobreak >nul
goto loop
