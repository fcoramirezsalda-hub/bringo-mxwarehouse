# Handoff

## 2026-11-17 (8) · Claude Code · escaneo de retornos con detección, racks y copia a la hoja (v0.5.0)

- Implementado ADR-002 (aprobado): menú "Escanear retorno", `guias.js`, `retornos-escaneo.js`, `Retornos.gs`. Ver el ADR para el detalle.
- Tablas nuevas (solo se agregan): racks, rack_assign, return_scans, return_events, guide_refs, guide_rules, sheet_registro, returns_state.
- Apagado por defecto: se activa con `npm run retornos:setup` (o `RETURNS_SCAN=on`). Sin hoja configurada guarda solo en la PC.
- Pruebas: `npm test` 26/26. `Retornos.gs` se ejecuta contra una hoja simulada (no toca D/G/I, reintentos sin duplicar, respeta escaneos directos).
  Navegador: operador y admin, Enter del lector, repetida, Por identificar → corrección, rack, asignación, anulación, móvil sin desbordes.
  Datos reales: 328/328 coinciden con la hoja; con guías nuevas 83.5 % automático y 100 % de aciertos.
- **No probado:** `Retornos.gs` en Google real (no hay acceso de escritura desde aquí). Probarlo primero en una **copia** de la hoja.
- Pendiente: instalar en la PC de la bodega; saber si los racks tienen código de barras (DECISIONS, pendiente 11).

## 2026-11-17 (7) · Claude Code · propuesta de escaneo de retornos con detección y racks

- Solo documentación: `docs/ADR-002-escaneo-retornos.md`. Sin cambios de código.
- Se revisó en solo lectura el Apps Script "Escaneo Retornos — Eyoyo" y las pestañas Reglas, Catálogo, Referencia BrinGO y Modelo ML;
  el algoritmo de detección queda documentado en el ADR para portarlo a Node.
- Pendiente: respuestas del propietario (DECISIONS, pendiente 11) antes de crear tablas o escribir en la hoja.

## 2026-11-17 (6) · Claude Code · retornos escaneados integrados (apagado por defecto)

- Se integró el ZIP de prueba de Codex (`BrinGO-prueba-retornos-Claude.zip`, base 60aecc1), revisado y depurado. Detalle y opciones: `docs/ADR-001-retornos.md`.
- Nuevo `app/src/returns.js` y menú "Retornos escaneados". Variable `RETURNS_MODE`: `off` (predeterminado), `demo`, `site`.
  Con `off` la aplicación se comporta igual que v0.3.0. Sin cambios de esquema ni dependencias nuevas.
- Abrir ticket desde un retorno crea un ticket "Otro" con la guía; si ya hay uno abierto, lo abre sin escribir nada.
- Revisión de la hoja "Escaneo de Retornos" (solo lectura): la pestaña Registro no tiene rack ni estado; esos campos solo están en el Site.
- Pruebas: `npm test` 15/15 (5 nuevas de retornos). Prueba en navegador (Chromium) con `off` y `demo`, como admin y operador: menú, búsqueda con Enter, abrir ticket; sin errores de consola.
- Pendiente: el propietario elige la fuente real (recomendado: leer la hoja con cuenta de servicio de solo lectura). El modo `site` no se probó con datos reales.

## 2026-11-17 (5) · Claude Code · instalador arranca el sistema y lo comprueba

- En la PC de la bodega el instalador terminó, pero http://localhost:8080 no respondía y no se vio Edge en el paso 6.
  Causa probable de localhost: las tareas programadas solo arrancan al iniciar sesión, así que nada estaba corriendo.
- Nuevo paso 7/7: inicia las tareas "MX Wharehouse - Servidor" y "- Agente", espera hasta 60 s a que responda
  http://localhost:8080 y lo abre en el navegador; si no responde, indica dónde ver el error.
- Paso 6: explica que se abrirá Edge y que hay que cerrarlo; si `agent:login` falla, lo avisa en lugar de seguir en silencio.
- Pendiente: saber por qué no se abrió Edge (¿existía `perfil-agente`? ¿error de Playwright 1.47 con Node 26?). Pedí captura al propietario.
  El servidor arranca bien con Node 22 aquí; no se pudo probar con Node 26 ni con PowerShell en este entorno.

## 2026-11-17 (4) · Claude Code · instalador: no depender de descargar Chromium

- En la PC de la bodega `npx playwright install chromium` se cortó por tiempo (descarga de 140 MB) y el instalador se detuvo.
- Ahora el agente abre **Microsoft Edge** (ya viene con Windows) mediante `channel: 'msedge'` de Playwright. Si Edge no abre,
  intenta con el Chromium de Playwright. `AGENT_BROWSER=chromium` fuerza Chromium.
- `instalar-windows.ps1` solo descarga Chromium si no encuentra Edge: 3 intentos con 5 min de espera por conexión, y si falla
  avisa y sigue con el resto de la instalación en vez de abortar.
- La sesión guardada en `perfil-agente` es la misma carpeta; si ya se había iniciado sesión con Chromium, puede pedir volver a hacer `npm run agent:login`.

**Pruebas:** `npm test` 10/10. No se pudo probar en Windows desde aquí: falta confirmar en la PC de la bodega que el paso 6 abre Edge.

## 2026-11-17 (3) · Claude Code · chat con fotos (v0.3.0) · rama `agente/claude/chat-evidencias`

**Diseño**
- Sin migración: las fotos siguen en `ticket_evidence` y los mensajes en `ticket_messages`. La interfaz arma una sola línea de tiempo
  ordenada por hora; foto + texto de la misma persona con menos de 5 s de diferencia se muestran en una burbuja.
- `POST /api/tickets/:id/messages` acepta `{ body?, photo?: { name, data } }` (al menos uno). Guarda la foto como evidencia y el texto como mensaje.
  El campo `tag` ya no se usa; los mensajes nuevos se guardan como "Mensaje" y los anteriores conservan su etiqueta.
- `POST /api/tickets/:id/evidence` se queda solo para la evidencia de Dispose.
- Se quitó la pestaña Evidencias; las fotos de Dispose también aparecen en el chat con la etiqueta "Evidencia de disposición".
- Fotos de más de 1.2 MB se reducen en el navegador a 1600 px JPG antes de subir.
- Errores de JSON mal formado ya no devuelven la traza interna: responden `{"error":"Solicitud no válida."}`.

**Pruebas:** 10/10 (`npm test`, nueva prueba del chat). En navegador, servidor real y demo: sin menú de tipo, 2 pestañas,
foto + texto en una burbuja, foto sola, envío vacío rechazado, sin errores.

**Para revisar después:** si el chat crece mucho, paginarlo; si CS necesita filtrar instrucciones del equipo turco, volver a una etiqueta opcional.

## 2026-11-17 (2) · Claude Code · demo publicada de la plataforma real

- El link del panel "MX Wharehouse" (https://claude.ai/artifact/AohXAPkYV8vAeoeb1g1zCy) ya no muestra la maqueta vieja:
  muestra la interfaz real v0.2.0 con un servidor simulado en el navegador (`demo/`). PIN de prueba 1234.
- Probado en navegador: login (PIN malo y bueno), registro en 3 clics, bandeja, tomar ticket, evidencia, tablero,
  duplicados, enviados dañados, descartes, equipo, sesión tras recargar, 400 px sin scroll horizontal, sin errores.
- La maqueta anterior sigue en `prototype/mx-wharehouse.html`.

## 2026-11-17 · Claude Code · versión visible (v0.2.0)

- La versión (`app/package.json`, ahora 0.2.0) se muestra en el inicio de sesión y en la barra lateral, vía `GET /api/version`.
  Sirve para comparar si dos instalaciones corren el mismo código.
- Los archivos de la interfaz se sirven con `Cache-Control: no-cache` para que el navegador no muestre una versión vieja.
- Al publicar cambios en la interfaz, subir la versión en `app/package.json`.
- Probado: 9/9 pruebas; en navegador se ve "v0.2.0" en login y panel.

## 2026-11-16 · Claude Code · rama `agente/claude/instalador-windows`

- `app/instalar-windows.bat` + `app/instalar-windows.ps1`: instalador para la PC de la bodega (Node ≥ 22.13, npm install, Chromium del agente,
  `npm run setup` solo si no hay base, tareas programadas al iniciar sesión para servidor y agente, regla de firewall 8080 en red privada,
  suspensión desactivada con corriente, `agent:login` si no hay sesión). Idempotente.
- **No probado en Windows**: aquí no hay PowerShell. Probarlo en la PC de la bodega es el siguiente paso.
- La PC aún no está conectada por Remote Control (no aparece ninguna carpeta compartida).

## 2026-11-15 (10) · Claude Code · rama `agente/claude/ux-registro-estado`

- Registro: cuando "Abrir ticket" está desactivado, se muestra qué falta ("Falta: especifica el motivo y describe el producto.").
- El estado del agente en la barra lateral se actualiza cada 10 s (antes 30 s): evitaba ver "sin conexión" justo al arrancar.
- Probado en navegador contra la demo: el aviso cambia al escribir, el botón se activa y el ticket se registra; sin errores de consola.

## 2026-11-15 (9) · Claude Code · Copia a Google Sheets

- `app/src/sheets-sync.js`: cada minuto envía los tickets que cambiaron (por hash) y los eventos nuevos al Apps Script de la hoja.
  Si falla, no avanza y reintenta; el tablero muestra el estado. `npm run sheets:setup` genera el token y guarda la URL en `data/sheets.json`.
- `app/integraciones/google-sheets/Codigo.gs`: recibe, valida el token, actualiza "Tickets" por folio y agrega a "Historial" sin repetir; guarda todo como texto (las guías largas no se convierten en números).
- Pruebas: `test/sheets.test.js` con un receptor falso (alta, solo cambios, sin eventos repetidos, error de red, token incorrecto). 9/9 pasan.
- No probado contra Google real: el conector de Drive pidió volver a iniciar sesión, así que la hoja la crea el propietario a mano (instrucciones en `app/LEEME.md`).

## 2026-11-15 (8) · Claude Code · MVP en `app/`

### Qué hay
- Servidor, base de datos, interfaz y agente de búsqueda reales (ver PROJECT_CONTEXT → Arquitectura real).
- Operador: registrar incidencia (escanear o teclear MX/ES o sin etiqueta → motivo → Abrir ticket), Mis reportes.
- Panel (Victor + CS): bandeja con filtros (estado, motivo, responsable, origen, vencimiento, orden), detalle, tomar/liberar/transferir,
  respuesta pendiente, ubicación, chat con tipos de instrucción, historial, evidencias, resolver, duplicados (10 d → Dispose programado,
  confirmación con evidencia), enviados dañados con desenlace, descartes con doble confirmación y restauración, tablero, equipo (restablecer PIN).
- Agente: cola `enrichment_jobs`, reintentos 1/3/10 min, latido cada 15 s, captura de pantalla si falla, borra correos de los datos leídos.

### Cómo se probó
- `npm test`: 8 pruebas (login y bloqueo, registro y anti-duplicado, permisos de operador, toma atómica concurrente, resolver/descartar/restaurar, plazos idempotentes y Dispose con evidencia, agente en modo de prueba, restablecer PIN). Todas pasan.
- Recorrido en navegador con servidor + agente en modo de prueba: operador abre ticket en 3 clics, aviso de ticket existente, Victor toma, chatea, sube evidencia, resuelve; vista de 400 px sin scroll horizontal; sin errores de consola.

### Qué NO se ha probado
- Los lectores de Bringgo y EasyShip contra las páginas reales (los selectores salen de capturas). Primera tarea al conectar la PC.
- Windows: los `.bat` y la instalación se escribieron pero no se ejecutaron en Windows.

### Siguiente
1. Conectar la PC de la bodega (Remote Control) o copiar `app/` a mano y seguir `app/LEEME.md`.
2. `npm run agent:login` y probar `npm run agent` con 3–5 tickets reales; ajustar `connectors.js` con las capturas de `data/capturas-agente/`.
3. Retornos (Google Sheets) sigue fuera del MVP.

## 2026-11-15 (7) · Claude Code

- PC de la bodega: Windows, sin 2FA ni captcha en Bringgo/EasyShip (según el propietario).
- Se creó `agent-poc/` (Node + Playwright): `node poc.js login | mx | guia | es`. El login lo hace la persona en el navegador; la sesión queda en `perfil/` y no se guardan contraseñas. Solo lectura.
- **No se ha probado contra las plataformas reales**: los selectores salen de capturas y pueden necesitar ajuste. Solo se verificó la sintaxis.
- Pendiente: conectar la PC a la sesión (Remote Control) y la URL de Item Look Up de Bringgo.

## 2026-11-15 (6) · Claude Code

- Mapeo de campos de Bringgo Item Look Up y EasyShip Item lookup en `docs/CONNECTORS.md` (con base en capturas del propietario).
- El panel "Información de la orden" del prototipo usa ya esos mismos nombres de campo según la fuente.
- No se guardan correos de clientes.

## 2026-11-15 (5) · Claude Code

- Agente de búsqueda: guía escaneada se busca en Bringgo Item Look Up por Outbound → Inbound → Canceled Tracking Number y luego en EasyShip.
- Cuentas: el agente consulta con las cuentas de Francisco R.; panel en Equipo y permisos para ligar cuentas de otros miembros (simulado, sin contraseñas).
- Riesgos de usar cuenta personal y mitigaciones en `docs/CONNECTORS.md`.
- Probado con Playwright: búsqueda por inbound, ligar cuenta, cambiar cuenta del agente, permisos (Rachel no ve "Conectar"). Sin errores.

## 2026-11-15 (4) · Claude Code

- El registro ya no muestra información del producto: acepta cualquier guía escaneada o un MX/ES tecleado (valida solo el formato del código).
- Se simuló el **agente de búsqueda**: cada ticket entra a una cola y a los 2–3 min aparece "Información de la orden" en el detalle y "Lista / Buscando / Sin coincidencias" en la bandeja. Hay "Buscar de nuevo" cuando no encuentra nada.
- El reloj de prueba avanza en tiempo real; "+3 min" adelanta la búsqueda.
- Diseño y pendientes en `docs/CONNECTORS.md`. No se tuvo acceso a Bringgo ni EasyShip (requieren sesión).

## 2026-11-15 (3) · Claude Code

- Registro de incidencias en 2 pasos (máximo 3 clicks): sin acciones sugeridas, con "Otro" (especificar) y "Guía no reconocida" primero y destacado.
- "Dañado o con escurrimiento" ya no abre ticket: queda como "Enviado dañado" en la vista nueva **Enviados dañados** (panel administrativo), donde se marca el desenlace. Registrar un retorno con ese código lo marca como "Regresó".
- Se probó con Playwright: los 3 clicks, Otro, sin etiqueta, envío dañado y retorno ligado. Sin errores de consola.
- Pendiente: decidir si Guía no reconocida, Extra Dept y No use label se registran directo como "Resuelto en piso" (DECISIONS #10).

## 2026-11-15 (2) · Claude Code

### Qué cambió

- El prototipo ahora **empieza en Incidencias**. La pantalla del operador es "Registrar incidencia" en 3 pasos:
  1. Identificar el paquete (escanear, o teclear el MX/ES si no escanea o no es válido, o marcar "sin etiqueta").
  2. Elegir el motivo.
  3. Hacer la acción con evidencia y registrar.
- Validación por motivo: el botón no se activa hasta tener las fotos, confirmaciones y campos obligatorios. La lista de faltantes se muestra.
- Las incidencias que se resuelven en piso quedan como tickets **"Resuelto en piso"**; la bandeja tiene un filtro para verlas.
- Si el código ya tiene un ticket abierto, se avisa en el paso 1 y el registro se agrega a ese expediente.
- Usuarios de CS reales: Samantha M., Pamela V., Rachel y Francisco R. (administrador del sistema).
- Se quitaron el escaneo correcto, la impresión de etiquetas, Item Lookup y las zonas de despacho.

### Cómo probar

1. Sesión "Fatima" → prueba "Tracking no válido" → aparece el error → teclea `mx 3015532` → se prellena "Inbound mal capturada".
2. "MX con ticket abierto" → aviso de INC-0412 → registra "Sin producto o diferente" → se agrega a INC-0412.
3. "El paquete no tiene etiqueta" → "No aparece" → foto → se crea un ticket escalado con Murat.
4. Sesión "Francisco R." → Bandeja → toma el ticket nuevo → pestaña Evidencias.

Se hizo un recorrido automatizado (Playwright) de estos flujos: sin errores de consola y sin scroll horizontal a 400 px.

## 2026-11-15 · Claude Code

### Qué se hizo

- Se integraron al prototipo (`prototype/mx-wharehouse.html`, artifact "MX Wharehouse") los requisitos de tickets, permisos,
  chat, plazos, duplicados con Dispose, descartes y retornos. Detalle en REQUIREMENTS.md.
- Se crearon `docs/` y `AGENTS.md`.
- **No se tocó ningún repositorio real**: no estaba disponible en la sesión.

### Cómo probar el prototipo

Ábrelo en el navegador. No necesita servidor. Todo vive en memoria, así que recargar la página lo reinicia.

1. Sesión "Fatima" → Estación de escaneo → caso "Incorrecto · producto distinto" → adjunta foto → Reportar. Se crea `INC-0420` sin responsable.
2. Repite el paso 1: no se crea un ticket nuevo, se agrega un evento al mismo expediente.
3. Cambia la sesión a "Victor" → Bandeja → abre `INC-0420` (no se asigna solo) → Tomar ticket → chat → departamento esperado → resolver.
4. Abre `INC-0416` → Confirmar duplicado → usa "+1 día" varias veces → Mercancías duplicadas: pasa a Dispose programado al cumplir 10 días.
5. Descarta un ticket (justificación + 2 confirmaciones) → Archivo de descartes → Restaurar.
6. Sesión "Luis (CS)": los botones sin permiso aparecen desactivados (matriz en "Equipo y permisos").

Se ejecutó un recorrido automatizado con Playwright sobre estos flujos: sin errores de consola y sin scroll horizontal a 400 px.

### Modelo de datos propuesto (a adaptar al motor y las convenciones reales)

```sql
tickets(
  id, code, platform /*MX|ES*/, type, status, reporter_id, reporter_dept,
  owner_id NULL, waiting_dept NULL, location NULL,
  created_at, due_at,                       -- created_at + 3 días
  dup_confirmed_by NULL, dup_confirmed_at NULL, dup_due_at NULL,  -- +10 días
  resolution NULL, resolved_at NULL,
  discarded_by NULL, discarded_at NULL, discard_reason NULL, status_before_discard NULL,
  late_flagged_at NULL, dispose_scheduled_at NULL, dispose_done_at NULL,
  version INT                              -- control de concurrencia optimista
)
-- índice único parcial: (code, type) WHERE status NOT IN ('Resuelto','Dispose realizado','Descartado') AND code <> '—'
ticket_events(id, ticket_id, actor_id /*NULL = proceso programado*/, kind, payload JSON, created_at)   -- solo inserción
ticket_assignments(id, ticket_id, from_user, to_user, action, actor_id, created_at)
ticket_messages(id, ticket_id, author_id, tag, body, created_at)
ticket_evidence(id, ticket_id, storage_key, file_name, uploaded_by, created_at)   -- sin DELETE por la aplicación
job_runs(id, job, started_at, finished_at, changes, lock_key)
```

Toma atómica: `UPDATE tickets SET owner_id=:me, version=version+1 WHERE id=:id AND owner_id IS NULL` → si afecta 0 filas, responder 409 "ya lo tomó X".
Job idempotente: cada cambio se condiciona a `late_flagged_at IS NULL` / `dispose_scheduled_at IS NULL`; un candado (advisory lock o `lock_key`) evita dos ejecuciones simultáneas.

### Riesgos

- Sin el repositorio real, el modelo de datos puede chocar con tablas existentes (usuarios, ubicaciones, racks).
- La integración con Bringgo y EasyShip puede no tener API; el MVP no debe depender de ella.
- Las evidencias fotográficas pueden crecer rápido; definir retención y tamaño máximo.
- La migración de retornos desde Google Sheets puede duplicar registros si no hay una clave estable.

### Siguientes pasos

1. El propietario comparte el repositorio (owner/repo) → Claude Code hace la tarea 0.1 y actualiza PROJECT_CONTEXT.md.
2. El propietario responde las decisiones pendientes de DECISIONS.md.
3. Se aprueba la migración de la Fase 1 antes de escribir código.
