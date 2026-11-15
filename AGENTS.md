# Instrucciones para agentes (Claude Code, Codex, ChatGPT)

Los agentes no comparten memoria. Lo que no esté en estos archivos no existe para el siguiente.

## Antes de empezar

1. Lee `docs/PROJECT_CONTEXT.md`, `docs/DECISIONS.md`, `docs/TASKS.md` y la última entrada de `docs/HANDOFF.md`.
2. Toma una tarea de `docs/TASKS.md` poniendo tu nombre y el estado `en curso`. No trabajes en una tarea que ya tiene responsable.
3. Trabaja en una rama propia: `agente/<nombre>/<tarea>` (ej. `agente/codex/1.4-tomar-ticket`).

## Reglas

- Este proyecto **ya existe**. No reconstruyas desde cero ni hagas cambios destructivos.
- Conserva recepción, escaneo, inventario, ubicaciones, racks y usuarios.
- Cambios estructurales (migraciones, nuevas dependencias, cambios de arquitectura): propón y espera la aprobación del propietario.
- No asumas que Bringgo o EasyShip tienen API: verifícalo y documéntalo.
- No modifiques el sistema de retornos en Google Sheets / Sites.
- Los permisos se validan en backend y base de datos, no solo en la interfaz.
- Nunca escribas credenciales en el código, los documentos o los commits. No toques producción sin autorización.
- No borres evidencias ni tickets físicamente; usa estados y auditoría.

## Roles

- **Claude Code:** implementación principal y continuidad técnica.
- **Codex:** tareas delimitadas, revisión de código y pruebas.
- **ChatGPT:** análisis funcional, arquitectura operativa, revisión de requisitos y validación de procesos.
- **Propietario:** aprueba decisiones.

## Al terminar una tarea

1. Marca la tarea como `hecho` en `docs/TASKS.md`.
2. Agrega una entrada al inicio de `docs/HANDOFF.md`: qué cambió, cómo se probó, qué falta.
3. Si tomaste una decisión o surgió una pregunta, anótala en `docs/DECISIONS.md`.
4. Si cambió la arquitectura o el stack, actualiza `docs/PROJECT_CONTEXT.md`.

## Prototipo

`prototype/mx-wharehouse.html` es una maqueta sin backend. Sirve de referencia de interfaz y flujos, no es código de producción.
