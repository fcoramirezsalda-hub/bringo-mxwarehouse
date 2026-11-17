# ADR-001: Integración de retornos escaneados en MX Wharehouse

**Estado:** Propuesta · implementada en modo apagado/demo, falta aprobar la fuente real
**Fecha:** 2026-11-17
**Decide:** Propietario
**Origen:** paquete `BrinGO-prueba-retornos-Claude.zip` (rama de prueba de Codex, base `60aecc1`), revisado y depurado por Claude Code.

## Contexto

- El sistema actual de retornos es la hoja de Google **"Escaneo de Retornos"** (captura con escáner Eyoyo + Apps Script
  "Escaneo Retornos — Eyoyo"), que alimenta un Site de consulta (aplicación aparte con D1 y acceso con sesión de ChatGPT)
  los miércoles y sábados a las 19:30, hora México. **No se debe modificar** (AGENTS.md, DECISIONS 2026-11-15).
- Revisión de la hoja (solo lectura, 2026-11-17):
  - Pestaña **Registro**: `Fecha de Escaneo`, `Guía / RMA`, `Paquetería / origen`, `Mes`, `Operador`, `Observaciones`,
    `Control` (aviso de duplicado), `Método de identificación`, `Clave única` (p. ej. `G:383922474018`).
  - Una pestaña por paquetería (FedEx, Estafeta, PaqueteExpress, J&T, iMile, DHL, Correos de México, Castores, Afimex, UPS),
    "Por identificar" y "Cliente RMA", filtradas por mes en B1.
  - Catálogo de guías, Reglas, Referencia BrinGO / Process y Modelo ML para identificar la paquetería.
  - **La hoja no tiene rack ni estado.** Esos campos (`rack`, `recibido / acomodado / cerrado`) solo existen en el Site.
- El ZIP agrega un menú "Retornos escaneados" que lee el Site con una cookie de sesión privada (`RETURNS_SITE_COOKIE`),
  permite abrir un ticket local "Otro" desde un retorno y, solo en demo, cambiar el estado.

## Decisión

Integrar el módulo del ZIP **detrás de un interruptor `RETURNS_MODE` apagado por defecto**, con lectura únicamente,
sin cambios de esquema ni dependencias nuevas. La fuente real queda pendiente de aprobación (ver opciones).

| `RETURNS_MODE` | Comportamiento |
|---|---|
| `off` (predeterminado, o valor desconocido) | No aparece el menú; `/api/returns*` responde 404. La bodega funciona igual que en v0.3.0. |
| `demo` | Dos retornos ficticios en memoria para probar la interfaz. |
| `site` | Lectura del Site con `RETURNS_SITE_COOKIE`. **Sin validar con datos reales**; no usar en la bodega todavía. |

## Opciones para la fuente real

### A. Leer el Site con la cookie de sesión (lo que trae el ZIP)
| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja (ya escrito) |
| Fiabilidad | Baja: la sesión de ChatGPT expira, el endpoint `/api/warehouse` no está documentado ni verificado |
| Seguridad | Débil: una cookie personal guardada en la PC de la bodega da acceso a todo lo que esa sesión puede ver |
| Datos | Incluye rack y estado |

### B. Leer la hoja "Escaneo de Retornos" en solo lectura (recomendada)
Cuenta de servicio de Google con permiso **Lector** en la hoja (o un Apps Script nuevo e independiente con `doGet` y token,
como el que ya existe para la copia de tickets). La hoja original no se toca.
| Dimensión | Evaluación |
|---|---|
| Complejidad | Media: un adaptador `sheet` con la misma interfaz `list/get` |
| Fiabilidad | Alta: la hoja es la fuente primaria y se actualiza al escanear (no dos veces por semana) |
| Seguridad | Buena: credencial de solo lectura, revocable, sin sesión personal |
| Datos | Guía, paquetería, fecha, operador, duplicado, clave única. **Sin rack ni estado** |

### C. Importar CSV a mano
Simple y sin credenciales, pero manual y desfasado. Útil solo como respaldo.

## Análisis

La hoja es la fuente de verdad del escaneo; el Site es una vista derivada. Leer la hoja evita depender de una sesión
personal y de un endpoint no documentado (AGENTS.md: "no asumas que hay API: verifícalo"). Lo que se pierde es rack y
estado; si se necesitan, se puede combinar después con el Site o pedir que la hoja los incluya (decisión del propietario).

## Consecuencias

- Fácil: probar la pantalla en demo sin riesgo; apagarla con una variable.
- Fácil: la clave anti-duplicado de la hoja (`Clave única`) sirve para no abrir dos tickets por la misma guía.
- Difícil: los cambios de estado de retornos siguen en el Site; MX Wharehouse no escribe en él.
- Revisar: cuando exista la fuente real, el ticket "Otro" creado desde un retorno debería guardar la `Clave única`.

## Correcciones hechas al ZIP antes de integrarlo

1. Antes los datos ficticios aparecían por defecto en la bodega (`RETURNS_MODE` = `demo`). Ahora el valor predeterminado es `off`.
2. El menú del operador mostraba "Retornos escaneados" dos veces.
3. La demo publicada (`demo/mock-api.js`) no tiene `/api/returns`. Con el menú oculto cuando el módulo está apagado, la demo no se rompe.
4. La comprobación de "ticket ya abierto" comparaba la guía sin normalizar (espacios); ahora usa la misma normalización que `createIncident`.
5. Las filas del Site sin `id` o sin guía se descartan; antes podían provocar errores 400/500 al abrir ticket.
6. El modo `site` enviaba `Content-Type` en un GET; ahora solo hace GET y nunca escribe.
7. "Abrir ticket" usa `openTicket` (actualiza la URL a `#tickets`) y avisa si el ticket ya existía.
8. Buscar retornos funciona con Enter (el escáner Eyoyo termina con Enter).
9. Errores inesperados se registran en consola del servidor.
10. Documentos: se quitaron referencias a un `CLAUDE.md` que no existe; la fila R1 quedaba fuera de la tabla de TASKS.

## Pasos siguientes

1. [ ] Propietario: aprobar la opción B (o A/C) para la fuente real.
2. [ ] Si B: crear cuenta de servicio con permiso Lector en "Escaneo de Retornos" y guardar la clave fuera del repositorio.
3. [ ] Implementar el adaptador `sheet` (pestaña Registro) con pruebas; mapear `Clave única` → id del retorno.
4. [ ] Probar en la PC de la bodega con `RETURNS_MODE=demo` antes de activar la fuente real.
