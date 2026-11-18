# MX Wharehouse · Incidencias (piloto en la PC de la bodega)

Sistema de incidencias de registro: los operadores abren tickets en 3 clics, Victor y Customer Service los gestionan,
y un agente busca la información de la orden en Bringgo y EasyShip (solo lectura).

## Requisitos

- PC con Windows, siempre encendida durante el turno (sin suspensión) y con internet.
- **Node.js 24 LTS** (o 22.13 o más nuevo) desde https://nodejs.org → "Windows Installer".

## Instalación rápida (recomendada)

1. Instala **Node.js 24 LTS**.
2. Descarga el repositorio (botón verde **Code → Download ZIP** en GitHub, o `git clone`) y descomprímelo en `C:\wms-agente`.
3. En `C:\wms-agente\app`, clic derecho en **instalar-windows.bat → Ejecutar como administrador**.

Para actualizar después, usa `actualizar.bat` (ver "Dónde están los datos").

El instalador hace todo lo de la sección siguiente: dependencias, usuarios y PIN, arranque automático al iniciar sesión,
firewall para la red privada, suspensión desactivada y la sesión de Bringgo/EasyShip para el agente. Se puede correr otra vez sin perder datos.

## Instalación manual (una vez)

1. Copia la carpeta `app` a la PC, por ejemplo `C:\wms-agente\app`.
2. Abre "Símbolo del sistema" en esa carpeta y ejecuta, uno por uno:

```
npm install
npm run setup
```

El agente usa Microsoft Edge, que ya viene con Windows 10/11. Solo si la PC no tiene Edge, descarga Chromium con
`npx playwright install chromium` y define la variable `AGENT_BROWSER=chromium`.

`npm run setup` crea la base de datos y muestra **un PIN de 4 dígitos para cada persona**. Anótalos y entrégalos en persona;
no se vuelven a mostrar. Francisco R. puede restablecer cualquier PIN desde "Equipo y permisos".

**Agregar o quitar personas:** en "Equipo y permisos" (solo quien tiene el permiso "Administrar usuarios", hoy Francisco R.):
escribe el nombre, elige el perfil (Operación, Equipo de retornos, Customer Service o Procesamiento) y pulsa "Agregar"; se muestra su PIN una sola vez.
"Dar de baja" impide que entre y deja sin responsable sus tickets abiertos; su historial se conserva y se puede "Reactivar".
Volver a correr `npm run setup` en una base existente solo agrega a las personas del equipo base que falten (por ejemplo, Isaac).

3. Inicia sesión en Bringgo y EasyShip para el agente (se abre un navegador; inicias sesión tú y lo cierras):

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

## Escanear retornos (opcional, apagado hasta configurarlo)

Menú "Escanear retorno": el lector Eyoyo escanea la guía, MX Wharehouse detecta la paquetería (mismo sistema que la hoja
"Escaneo de Retornos"), indica el rack y lo copia a la hoja con la columna nueva "Rack" (J). El script actual de la hoja no se toca.

1. Crea un proyecto **nuevo** en script.google.com y pega `integraciones/google-sheets/Retornos.gs` (no edites "Escaneo Retornos — Eyoyo").
2. En la PC de la bodega: `npm run retornos:setup`. Muestra el TOKEN y el RETORNOS_ID que van en las propiedades del script.
3. Implementa el script como aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario) y pega la URL `/exec`.
   El setup lee la hoja, muestra cuántas guías coinciden con la detección y activa el menú. Reinicia `npm start`.

- Sin internet se sigue escaneando; la hoja se pone al día sola (cada 30 s) y cada 5 min se lee el catálogo, las reglas y lo escaneado directo en la hoja.
- Durante el piloto, escanear **solo** en MX Wharehouse (no en la hoja al mismo tiempo).
- Para apagarlo: `set RETURNS_SCAN=off` antes de `npm start` (lo ya escaneado sigue en la hoja).

## Retornos escaneados (opcional, apagado)

El menú "Retornos escaneados" está apagado por defecto. Para probarlo con datos ficticios, arranca el servidor con
`RETURNS_MODE=demo` (en Windows: `set RETURNS_MODE=demo` antes de `npm start`). No escribe en la hoja ni en el Site.
La conexión con datos reales está pendiente de aprobación (`docs/ADR-001-retornos.md`).

## Dónde están los datos y cómo actualizar sin perderlos

Desde la v0.9.0 los datos viven **fuera de la carpeta del programa**, para que actualizar o reemplazar el código nunca los borre:

| Qué | Dónde (Windows) |
|---|---|
| Base de datos y fotos (evidencias) | `C:\ProgramData\MX Wharehouse\data` |
| Respaldos automáticos de la base | `C:\ProgramData\MX Wharehouse\respaldos` |
| Sesión de Bringgo/EasyShip del agente | `C:\ProgramData\MX Wharehouse\perfil-agente` |

`npm run datos` muestra la carpeta de datos. La variable `DATA_DIR` sigue funcionando para usar otra carpeta.

- **Primera vez con la v0.9.0:** al arrancar, copia sola los datos de la ubicación anterior (`app\data`) a la nueva. No borra la anterior;
  deja ahí `LEEME-DATOS-MOVIDOS.txt`. Si actualizas reemplazando la carpeta con un ZIP, **guarda antes `app\data`** (solo esta vez) y
  pégala de vuelta en la carpeta nueva antes de arrancar.
- **Actualizar:** doble clic a `actualizar.bat` (respaldo → `git pull` → `npm install`) y luego reinicia el servidor.
  Si se instaló con ZIP, basta con reemplazar la carpeta del programa: los datos ya no están ahí.
- **Respaldos:** el servidor guarda una copia de la base al arrancar y cada 6 horas (conserva las últimas 30). `npm run respaldo` hace una al momento.
  Las fotos no entran en ese respaldo: copia `data\evidencias` aparte de vez en cuando.
- **Restaurar:** detén el servidor, copia el respaldo como `incidencias.db` en la carpeta de datos (borra antes `incidencias.db-wal` y `incidencias.db-shm`) y arráncalo.
- No ejecutes `npm run setup` para "arreglar" algo: solo agrega usuarios faltantes, pero en una carpeta de datos vacía crea una base nueva.

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
