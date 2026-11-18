@echo off
REM Actualiza el programa SIN tocar los datos (viven en C:\ProgramData\MX Wharehouse, fuera de esta carpeta).
cd /d "%~dp0"
echo == 1/3 Respaldo de la base de datos ==
call npm run respaldo
if errorlevel 1 (
  echo No se pudo hacer el respaldo. No se actualiza. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo == 2/3 Descargar la version nueva ==
if not exist "..\.git" (
  echo Esta carpeta no se instalo con git. Baja el ZIP nuevo de GitHub y reemplaza la carpeta del programa:
  echo los datos NO se pierden porque ya no viven aqui. Despues corre este archivo otra vez o "npm install".
  pause
  exit /b 1
)
git -C .. pull
if errorlevel 1 (
  echo git pull fallo. Los datos no se tocaron.
  pause
  exit /b 1
)
echo == 3/3 Dependencias ==
call npm install --no-audit --no-fund
echo.
echo Listo. Reinicia el servidor: cierra la ventana negra "iniciar-servidor" y da doble clic a iniciar-servidor.bat
echo (o cierra sesion de Windows y vuelve a entrar). Los datos y los PIN siguen igual.
pause
