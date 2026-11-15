# Tareas

Estados: `pendiente` · `en curso` · `hecho` · `bloqueado`. Un archivo o módulo no debe tener dos agentes trabajando a la vez: anota tu nombre en "Responsable" antes de empezar.

## Fase 0 · Diagnóstico (bloquea todo lo demás)

| # | Tarea | Responsable | Estado |
|---|---|---|---|
| 0.1 | Conectar el repositorio real e inventariar tecnologías, estructura, base de datos y módulos (terminado / parcial / falta) | Claude Code | bloqueado: falta el repo |
| 0.2 | Llenar "Arquitectura real" en PROJECT_CONTEXT.md | Claude Code | pendiente |
| 0.3 | Verificar opciones de integración con Bringgo y EasyShip (API, exportación) | ChatGPT + propietario | pendiente |
| 0.4 | Revisar la hoja y el sitio de retornos (solo lectura) y documentar campos y estados | ChatGPT | pendiente |

## Fase 1 · MVP de tickets (escanear, reportar, tomar, gestionar, resolver)

| # | Tarea | Responsable | Estado |
|---|---|---|---|
| 1.1 | Migración: `tickets`, `ticket_events`, `ticket_assignments`, `ticket_messages`, `ticket_evidence` (ver HANDOFF) | Claude Code | pendiente (requiere aprobación) |
| 1.2 | Roles y permisos en servidor: operador, procesamiento, customer_service, supervisor | Claude Code | pendiente |
| 1.3 | Endpoint "registrar incidencia" (por tracking o código tecleado) con anti-duplicado (código + tipo, ticket abierto) y estado "Resuelto en piso" | Codex | pendiente |
| 1.4 | Endpoint "tomar ticket" atómico (`UPDATE … WHERE owner_id IS NULL`) y pruebas de concurrencia | Codex | pendiente |
| 1.5 | Interfaz de registro de incidencias en 3 pasos sobre la API (prioridad 1) | Claude Code | pendiente |
| 1.6 | Bandeja y detalle administrativo | Claude Code | pendiente |
| 1.7 | Subida de evidencias a almacenamiento privado, sin borrado | Codex | pendiente |

## Fase 1b · Agente de búsqueda de órdenes

| # | Tarea | Responsable | Estado |
|---|---|---|---|
| 1b.1 | Confirmar autorización / API con Bringgo y EasyShip; usuario de solo consulta | Propietario | pendiente |
| 1b.2 | Mapear campos de Accept goods, Item Look Up (outbound) y EasyShip Item lookup | ChatGPT + propietario | pendiente |
| 1b.0 | Prueba de concepto en la PC de la bodega (`agent-poc/`) | Claude Code | en curso: falta conectar la PC |
| 1b.3 | Cola `enrichment_jobs` + worker idempotente con reintentos y bitácora | Codex | bloqueado: 1b.1 |
| 1b.4 | Panel "Información de la orden" en el ticket y columna "Orden" en la bandeja | Claude Code | hecho en prototipo |

## Fase 2 · Plazos y duplicados

| # | Tarea | Responsable | Estado |
|---|---|---|---|
| 2.1 | Job programado idempotente: marca retraso a 3 días, pasa duplicados a Dispose programado a 10 días | Codex | pendiente |
| 2.2 | Vista de duplicados e historial de Dispose | Claude Code | pendiente |
| 2.3 | Confirmar Dispose realizado con evidencia obligatoria | Claude Code | pendiente |

## Fase 3 · Descartes, chat y retornos

| # | Tarea | Responsable | Estado |
|---|---|---|---|
| 3.1 | Descarte con justificación, doble confirmación, archivo y restauración | Claude Code | pendiente |
| 3.2 | Chat interno por ticket con tipos de instrucción | Claude Code | pendiente |
| 3.3 | Propuesta de sincronización con Google Sheets de retornos | ChatGPT → propietario | pendiente |
| 3.4 | Implementar la sincronización aprobada | Claude Code | bloqueado: falta aprobación |

## Fase 4 · Preparación para la nube (ver PLAN_PRUEBAS_NUBE.md)

| # | Tarea | Responsable | Estado |
|---|---|---|---|
| 4.1 | CI: `npm ci && npm test` con `TZ=UTC` en cada push | Codex | pendiente |
| 4.2 | Pruebas faltantes de reglas y permisos (secciones 4.1 y 4.2 del plan) | Codex | pendiente |
| 4.3 | Resolver B1–B3 y B7 (login, cookie, zona horaria) | Claude Code | pendiente |
| 4.4 | API del agente, evidencias en almacenamiento privado, base en la nube (B4, B5, B8) | Claude Code | pendiente (requiere aprobación) |
| 4.5 | Piloto de 2 semanas en piso y prueba del agente con datos reales | Propietario + Claude Code | pendiente |

## Hecho

| # | Tarea | Responsable | Fecha |
|---|---|---|---|
| T.1 | Plan de pruebas para pedir la migración a la nube | Claude Code | 2026-11-15 |
| M.1 | MVP de incidencias en `app/` (servidor, BD, interfaz, agente, pruebas) | Claude Code | 2026-11-15 |

### Anteriores

| # | Tarea | Responsable | Fecha |
|---|---|---|---|
| P.1 | Prototipo de escaneo de No procesados | Claude Code | 2026-11-14 |
| P.2 | Prototipo de tickets, plazos, duplicados, descartes y retornos | Claude Code | 2026-11-15 |
| P.3 | Documentos compartidos (este archivo y los de `docs/`) | Claude Code | 2026-11-15 |
| P.4 | Prototipo enfocado en registro de incidencias (escanear o teclear MX/ES, motivo, acción, evidencia) y equipo de CS real | Claude Code | 2026-11-15 |
