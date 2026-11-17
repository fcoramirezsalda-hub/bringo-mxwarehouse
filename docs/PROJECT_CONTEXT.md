# Contexto del proyecto · WMS México (MX Wharehouse)

Última actualización: 2026-11-17 · Claude Code

## Qué es

Plataforma complementaria para el almacén de México que recibe paquetes desde Laredo, TX.
No reemplaza a Bringgo (códigos MX) ni a EasyShip (códigos ES).

**Alcance actual (decisión del propietario):** la plataforma empieza en el punto **"2. Incidencias"** del flujo
Laredo → Almacén → Despacho. El escaneo correcto, la verificación del producto y la impresión de guías siguen ocurriendo
en Bringgo y EasyShip. Esta plataforma registra las **incidencias durante el registro**, las convierte en tickets
y da seguimiento con Victor y Customer Service. También cubre duplicados y retornos.

## Estado real (diagnóstico)

| Elemento | Estado |
|---|---|
| Repositorio de código del WMS (backend, base de datos, recepción, inventario, ubicaciones, racks, usuarios) | **No disponible en esta sesión.** La carpeta de trabajo estaba vacía. No se ha inspeccionado. |
| Repositorio del MVP | https://github.com/fcoramirezsalda-hub/bringo-mxwarehouse (este repositorio, desde 2026-11-15). El WMS original sigue sin estar disponible. |
| Prototipo interactivo (HTML, sin backend) | Hecho: `prototype/mx-wharehouse.html`. Publicado como artifact "MX Wharehouse". |
| Integración con Bringgo / EasyShip | Sin verificar. No hay credenciales ni documentación de API. |
| Sistema de retornos actual (Google Sheets + Site) | Revisado en solo lectura (2026-11-17): hoja "Escaneo de Retornos" (captura Eyoyo + Apps Script) que alimenta un Site aparte. Ver `docs/ADR-001-retornos.md`. |

> El documento de requisitos dice que el proyecto ya tiene trabajo previo con recepción, escaneo, inventario,
> ubicaciones, racks y usuarios. Ese código **no** está en esta sesión. Antes de implementar nada, el siguiente
> agente debe conectar el repositorio real y completar la sección "Arquitectura real" de abajo.

## Arquitectura real (MVP de incidencias, `app/`)

Decisión 2026-11-15: MVP nuevo e independiente (el repositorio del WMS original no está disponible), piloto en la PC de la bodega.

| Pieza | Tecnología |
|---|---|
| Servidor + API | Node.js ≥ 22.13, Express 4.21.2 (`app/src/server.js`) |
| Base de datos | SQLite integrado de Node (`node:sqlite`), archivo `app/data/incidencias.db`, modo WAL |
| Reglas de negocio | `app/src/domain.js` (permisos, anti-duplicado, toma atómica, plazos idempotentes) |
| Interfaz | HTML + JavaScript sin framework (`app/public/`), basada en el prototipo |
| Sesión | Usuario + PIN de 4 dígitos (scrypt), cookie HttpOnly de 14 h, bloqueo tras 5 intentos |
| Agente de búsqueda | Proceso aparte `app/src/worker.js` + `app/src/connectors.js` (Playwright, solo lectura) |
| Evidencias | Archivos en `app/data/evidencias/<ticket>/`, sin borrado desde la aplicación |
| Retornos (consulta del Site) | `app/src/returns.js`, solo lectura, `RETURNS_MODE=off` por defecto (ADR-001) |
| Escaneo de retornos | `app/src/retornos-escaneo.js` + `guias.js` (detección), 10 racks; copia a "Escaneo de Retornos" con `integraciones/google-sheets/Retornos.gs` (ADR-002). Apagado hasta `npm run retornos:setup` |
| Pruebas | `npm test` (node:test) |


## Arquitectura propuesta para lo nuevo (a validar contra la real)

- **Conectores de origen** (`connectors/bringgo`, `connectors/easyship`) con una interfaz común:
  `buscarPorTracking(trk)`, `buscarPorCodigo(code)`, `buscarPorAsin(asin)` → `PaqueteNormalizado`.
  Si no hay API autorizada, un conector `manual` permite capturar y consultar datos a mano o por importación CSV.
- **Módulo de tickets** dentro del backend existente: tablas nuevas, servicios con validación de permisos en servidor.
- **Proceso programado** (cron o cola) para vencimientos: idempotente, con bitácora de ejecuciones.
- **Almacenamiento de evidencias** en un bucket privado con URLs firmadas; sin borrado desde la aplicación.
- **Dos interfaces** sobre la misma API: operador (escaneo rápido) y panel administrativo (Victor + Customer Service).

## Prototipo: qué demuestra

- **Registro de incidencias en 3 pasos (operador):**
  1. Identificar el paquete: escanear la guía americana o, si no escanea o no es válida, **teclear el MX/ES con problema**. También hay un botón "El paquete no tiene etiqueta".
  2. Elegir el motivo: los 6 de la tabla de incidencias más Duplicado, cada uno con su destino.
  3. Hacer la acción, adjuntar evidencia y registrar. Avisa si ya hay un ticket abierto para ese código.
  - Cada incidencia queda como ticket. Las que se resuelven en piso (inbound, Extra Dept, No use label, sin etiqueta encontrado, duplicado asignado) se cierran como **"Resuelto en piso"**. Las demás quedan abiertas y sin responsable.

- Interfaz de operador: registro de incidencias, "Mis reportes" en solo lectura y retornos.
- Panel administrativo: bandeja con filtros (estado, responsable, origen, vencimiento), detalle del paquete,
  Tomar / Liberar / Transferir, departamento esperado separado del responsable, ubicación física,
  chat interno bajo demanda, historial, evidencias sin borrado, resolución final.
- Plazos: 3 días naturales generales con alerta a 24 h; duplicados confirmados con 10 días y paso automático a Dispose programado;
  Dispose realizado solo con evidencia; historial de casos enviados a Dispose.
- Descartes: permiso restringido, justificación obligatoria, doble confirmación, archivo de auditoría y restauración.
- Retornos: registro con antiduplicado y creación de ticket desde el retorno.
- Reloj de prueba "+1 día" para simular vencimientos.
- Customer Service: Samantha M., Pamela V., Rachel, Janneth y Francisco R. (también administrador del sistema). Sus permisos son una propuesta.
- Se quitaron del prototipo el flujo de escaneo correcto, la impresión de etiquetas, Item Lookup y las zonas de despacho, porque quedan fuera del alcance.
