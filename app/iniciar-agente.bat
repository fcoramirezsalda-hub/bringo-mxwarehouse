@echo off
REM Inicia el agente de búsqueda (Bringgo / EasyShip). Requiere haber corrido antes: npm run agent:login
cd /d "%~dp0"
:loop
call npm run agent
echo El agente se detuvo. Si la sesion vencio, corre "npm run agent:login". Reintentando en 60 segundos...
timeout /t 60 /nobreak >nul
goto loop
