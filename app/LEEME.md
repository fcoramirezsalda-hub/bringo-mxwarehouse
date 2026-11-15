# MX Wharehouse · Incidencias (piloto en la PC de la bodega)

Sistema de incidencias de registro: los operadores abren tickets en 3 clics, Victor y Customer Service los gestionan,
y un agente busca la información de la orden en Bringgo y EasyShip (solo lectura).

## Requisitos

- PC con Windows, siempre encendida durante el turno (sin suspensión) y con internet.
- **Node.js 24 LTS** (o 22.13 o más nuevo) desde https://nodejs.org → "Windows Installer".

## Instalación (una vez)

1. Copia la carpeta `app` a la PC, por ejemplo `C:\wms-agente\app` o `D:\app`.
   **No la pongas dentro de OneDrive**: la sincronización puede bloquear o dañar la base de datos de `data\`.
2. Abre "Símbolo del sistema" en esa carpeta (en el Explorador, escribe `cmd` en la barra de direcciones y Enter).
   Comprueba Node con `node -v`; si no lo reconoce, instálalo (`winget install OpenJS.NodeJS.LTS`) y abre una ventana nueva.
3. Ejecuta, uno por uno, esperando a que vuelva a aparecer la ruta antes del siguiente:

```
npm install
npm run setup
```

El agente usa **Microsoft Edge**, que ya viene en Windows, así que no hace falta descargar Chromium.
Para usar otro navegador: `set AGENT_BROWSER=chrome` (Google Chrome instalado) o `set AGENT_BROWSER=chromium`
(el de Playwright; requiere `npx playwright install chromium`, unos 400 MB en el disco C:).

No ejecutes `npm audit fix --force`: cambia las versiones fijas de Express y Playwright y puede romper la app.

`npm run setup` crea la base de datos y muestra **un PIN de 4 dígitos para cada persona**. Anótalos y entrégalos en persona;
no se vuelven a mostrar. Francisco R. puede restablecer cualquier PIN desde "Equipo y permisos".

4. Inicia sesión en Bringgo y EasyShip para el agente (se abre Edge; inicias sesión tú y lo cierras):

```
npm run agent:login
```

La sesión queda guardada en `perfil-agente\`. No se guarda ninguna contraseña en archivos.

## Uso diario

Abre dos ventanas (o usa los `.bat`):

```
npm start
```

```
npm run agent
```

- En la PC: http://localhost:8080
- En otros equipos de la red de la bodega: la dirección que muestra `npm start` (por ejemplo http://192.168.1.50:8080).
  La primera vez, Windows pregunta si permite el acceso en la red: elige **Redes privadas**.
- Los otros equipos no instalan nada: solo abren esa dirección en el navegador, conectados a la misma red (no la de invitados).

### Si los otros equipos no pueden abrir la dirección

1. En la PC del servidor, la red debe tener perfil **Privada**: Configuración → Red e Internet → Wi‑Fi o Ethernet → la red → Tipo de perfil de red.
2. Abre el puerto 8080 en el firewall. Abre una ventana **como administrador**
   (`powershell -Command "Start-Process cmd -Verb RunAs"` y responde Sí; el título debe decir "Administrador") y ejecuta:

```
netsh advfirewall firewall add rule name="MX Wharehouse 8080" dir=in action=allow protocol=TCP localport=8080 profile=private
```

   Windows responde `Aceptar`. Si dice "requiere elevación", la ventana no está como administrador.
3. Pide que el router le reserve una IP fija a esta PC, para que la dirección no cambie.

## Que arranque solo al encender la PC

Programador de tareas de Windows → Crear tarea básica → "Al iniciar sesión" → Iniciar un programa:
`iniciar-servidor.bat`. Repite con `iniciar-agente.bat`. Los dos se reinician solos si se cierran.

## Copia en Google Sheets (mientras no haya nube autorizada)

La base de datos de esta PC es la principal. Cada minuto, el sistema copia los tickets y su historial a una hoja de Google,
para respaldo y para que Customer Service pueda consultarlos desde fuera de la bodega (solo lectura: los cambios se hacen en el sistema).

1. En Google Drive crea una hoja de cálculo vacía, por ejemplo "MX Wharehouse · Tickets de incidencias".
2. En la hoja: **Extensiones → Apps Script**. Borra lo que haya y pega el contenido de `integraciones\google-sheets\Codigo.gs`. Guarda.
3. En esta PC ejecuta `npm run sheets:setup`. Muestra un **TOKEN**.
4. En Apps Script: **Configuración del proyecto (engrane) → Propiedades de la secuencia de comandos → Agregar propiedad**:
   nombre `TOKEN`, valor el que mostró el paso 3.
5. En Apps Script: **Implementar → Nueva implementación → Tipo: Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
   Autoriza los permisos que pide Google y copia la **URL de la aplicación web** (termina en `/exec`).
6. Pega esa URL en la ventana del paso 3. Si todo está bien dice "Listo" y aparecen las pestañas **Tickets** e **Historial** en la hoja.
7. Reinicia `npm start`. El tablero muestra "Copia en Google Sheets: al día" o el error si algo falla.

Notas:
- "Cualquier usuario" permite que la PC envíe datos sin iniciar sesión en Google; sin el TOKEN correcto el script no escribe nada.
- No edites las pestañas Tickets e Historial a mano: el sistema las sobrescribe. Para análisis, crea otra pestaña con fórmulas que lean de ellas.
- La hoja tiene datos de clientes: compártela solo con el equipo.
- Si cambias el código del Apps Script, haz **Implementar → Gestionar implementaciones → Editar → Versión nueva** para que tome efecto.

## Respaldos

Todo vive en la carpeta `data\` (base de datos y evidencias). Cópiala a otro lugar al final de cada día.

## Si algo falla

- El panel muestra abajo a la izquierda si el agente está en línea y cuántas búsquedas hay en cola.
- Si el agente dice "La sesión venció", corre `npm run agent:login`.
- Si no logra leer una página, guarda una captura en `data\capturas-agente\` para ajustar el lector.
  Esas capturas tienen datos de clientes: no las compartas fuera del equipo.

## Pruebas

```
npm test
```

Prueba del agente sin Bringgo/EasyShip (datos de prueba): `set AGENT_FAKE=1` y luego `npm run agent`.
