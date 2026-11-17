# Instalador de MX Wharehouse para la PC de la bodega (Windows 10/11).
# Uso: clic derecho en "instalar-windows.bat" → Ejecutar como administrador
#      (sin administrador también funciona, pero no abre el firewall ni ajusta la suspensión).
# Es seguro correrlo varias veces: no borra datos ni cambia los PIN existentes.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
function Paso($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  OK  $t" -ForegroundColor Green }
function Aviso($t){ Write-Host "  !!  $t" -ForegroundColor Yellow }

Paso '1/6 Node.js'
try { $v = (node -v).TrimStart('v') } catch { $v = $null }
if (-not $v -or [version]$v -lt [version]'22.13.0') {
  Aviso "Falta Node.js 22.13 o más nuevo (encontrado: $v). Se abre la página de descarga: instala la versión LTS y vuelve a correr este instalador."
  Start-Process 'https://nodejs.org/es/download'
  exit 1
}
Ok "Node.js $v"

Paso '2/6 Dependencias'
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install falló. Revisa la conexión a internet.' }
Ok 'Dependencias instaladas'
# El agente usa Microsoft Edge, que ya viene con Windows. Solo si no está, se descarga Chromium.
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { Ok 'Navegador del agente: Microsoft Edge (no hace falta descargar nada)' }
else {
  $env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT = '300000'
  $okNav = $false
  foreach ($i in 1..3) {
    Write-Host "  Descargando Chromium para el agente (intento $i de 3)..."
    npx playwright install chromium
    if ($LASTEXITCODE -eq 0) { $okNav = $true; break }
  }
  if ($okNav) { $env:AGENT_BROWSER = 'chromium'; [Environment]::SetEnvironmentVariable('AGENT_BROWSER', 'chromium', 'User'); Ok 'Navegador del agente: Chromium' }
  else { Aviso 'No se pudo descargar el navegador del agente. El resto se instala igual; instala Microsoft Edge o vuelve a correr este instalador con mejor conexión.' }
}

Paso '3/6 Base de datos y usuarios'
if (Test-Path 'data\incidencias.db') { Ok 'Ya existe; no se cambió nada.' }
else {
  npm run setup
  Aviso 'Anota los PIN de arriba y entrégalos en persona. No se vuelven a mostrar.'
  Read-Host 'Presiona Enter cuando los hayas anotado'
}

Paso '4/6 Arranque automático al iniciar sesión'
foreach ($n in @(@{Nombre='MX Wharehouse - Servidor'; Bat='iniciar-servidor.bat'}, @{Nombre='MX Wharehouse - Agente'; Bat='iniciar-agente.bat'})) {
  $accion = New-ScheduledTaskAction -Execute (Join-Path $PSScriptRoot $n.Bat) -WorkingDirectory $PSScriptRoot
  $disparo = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $n.Nombre -Action $accion -Trigger $disparo -Settings $ajustes -Force | Out-Null
  Ok $n.Nombre
}

Paso '5/6 Red y energía'
if ($admin) {
  if (-not (Get-NetFirewallRule -DisplayName 'MX Wharehouse 8080' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'MX Wharehouse 8080' -Direction Inbound -Protocol TCP -LocalPort 8080 -Profile Private -Action Allow | Out-Null
  }
  Ok 'Firewall: puerto 8080 abierto solo en redes privadas'
  powercfg /change standby-timeout-ac 0 | Out-Null
  Ok 'Suspensión desactivada mientras esté conectada a la corriente'
} else {
  Aviso 'Sin permisos de administrador: la primera vez que arranque el servidor, Windows preguntará por el firewall; elige "Redes privadas".'
  Aviso 'Desactiva la suspensión en Configuración → Sistema → Inicio/apagado y suspensión.'
}

Paso '6/6 Sesión de Bringgo y EasyShip para el agente'
if (Test-Path 'perfil-agente') { Ok 'Ya hay una sesión guardada. Si vence, corre: npm run agent:login' }
else {
  Write-Host '  Se abrirá un navegador. Inicia sesión en Bringgo y en EasyShip y luego cierra la ventana.'
  npm run agent:login
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
Write-Host "`nListo." -ForegroundColor Green
Write-Host "  En esta PC:              http://localhost:8080"
if ($ip) { Write-Host "  Otros equipos de la red: http://${ip}:8080" }
Write-Host '  Para arrancar ahora sin reiniciar: Programador de tareas → "MX Wharehouse - Servidor" y "- Agente" → Ejecutar.'
Write-Host '  Copia a Google Sheets (opcional): npm run sheets:setup  (ver LEEME.md)'
