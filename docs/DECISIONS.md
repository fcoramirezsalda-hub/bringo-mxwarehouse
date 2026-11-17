# Decisiones

## Aprobadas

| Fecha | Decisión | Quién |
|---|---|---|
| 2026-11-14 | La ubicación de despacho al escanear es solo sugerencia; la separación por paquetería ocurre en la zona de despacho. | Propietario (comentario en el prototipo) |
| 2026-11-14 | El tablero no muestra el total recibido de la caja; solo los paquetes reportados como no procesados. | Propietario |
| 2026-11-14 | El nombre visible del sistema es "MX Wharehouse". | Propietario |
| 2026-11-15 | El WMS es complementario a Bringgo y EasyShip, no los reemplaza. | Propietario (requisitos) |
| 2026-11-15 | No se modifica el sistema de retornos en Google Sheets / Sites hasta aprobar una estrategia. | Propietario (requisitos) |
| 2026-11-15 | La plataforma empieza en "2. Incidencias"; la prioridad es Incidencias durante el registro. | Propietario |
| 2026-11-15 | Si el tracking no escanea o no es válido, el operador teclea el MX/ES con problema. | Propietario |
| 2026-11-15 | Equipo de Customer Service: Samantha M., Pamela V., Rachel y Francisco R. (también administrador del sistema). | Propietario |
| 2026-11-15 | Los motivos de incidencia no sugieren acción: el registro solo abre el ticket. Se agrega "Otro" con campo para especificar. | Propietario (comentario) |
| 2026-11-15 | "Inbound mal capturada" se llama "Guía no reconocida" y va primero, destacado. | Propietario (comentario) |
| 2026-11-15 | Registro rápido: 2 pasos, máximo 3 clicks para abrir un ticket; por ahora sin paso de detalles ni fotos. | Propietario (comentario) |
| 2026-11-15 | Lo que se resuelve en piso basta con que quede en el historial; CS no lo revisa. | Propietario |
| 2026-11-15 | Al registrar no se muestra información del producto. Un agente de búsqueda consulta después Bringgo (Accept goods por MX; Item Look Up por guía mexicana) y EasyShip (Item lookup) y escribe la orden en el ticket. Se acepta un retraso de 2–3 min. Ver CONNECTORS.md. | Propietario |
| 2026-11-15 | El agente usa cuentas existentes: por ahora las de Francisco R. en Bringgo y EasyShip. Más adelante cada miembro del equipo podrá ligar las suyas. Ver CONNECTORS.md. | Propietario |
| 2026-11-15 | El agente de búsqueda será automatización de navegador y correrá en una PC de la bodega (solo se necesita durante el turno). Ver CONNECTORS.md. | Propietario |
| 2026-11-15 | Se construye un MVP de incidencias nuevo e independiente (Node + SQLite) que corre en la PC de la bodega durante el piloto. | Propietario |
| 2026-11-15 | Inicio de sesión con usuario + PIN de 4 dígitos; Francisco R. restablece PINs. | Claude Code (propuesta, confirmar) |
| 2026-11-15 | Mientras no haya nube autorizada, los tickets y su historial se copian cada minuto a una hoja de Google Sheets en el Drive del propietario (Apps Script con token). La base local sigue siendo la principal. | Propietario |
| 2026-11-15 | Dañado o con escurrimiento: se re-empaca y se envía. No abre ticket para CS; queda en un registro de "Enviados dañados" con desenlace (pendiente, regresó, dispose de paquetería, entregado). | Propietario |
| 2026-11-17 | Retornos se escanean en MX Wharehouse; la hoja "Escaneo de Retornos" es la copia (columna nueva J "Rack"); 10 racks por paquetería; el operador corrige la paquetería; Apps Script nuevo con token y el Sheets actual sigue funcionando. Ver ADR-002. | Propietario |
| 2026-11-17 | El módulo de retornos se integra apagado por defecto (`RETURNS_MODE=off`), solo lectura y sin escribir en la hoja ni en el Site. Ver ADR-001. | Claude Code (propuesta, confirmar) |
| 2026-11-17 | Chat interno sin "tipo" de mensaje. Las fotos se envían desde el chat (texto, foto o ambos) y se quitó la pestaña Evidencias. Las fotos siguen siendo evidencias del expediente y no se borran. | Propietario |

## Pendientes (requieren respuesta del propietario)

1. **Repositorio real:** ¿dónde está (GitHub owner/repo)? Sin él no se puede hacer el diagnóstico técnico ni las migraciones.
2. **API de Bringgo y EasyShip:** ¿hay acceso autorizado, documentación o exportaciones? Si no, se arranca con captura manual o CSV.
3. **Permisos del equipo de CS (propuesta del prototipo, falta confirmar):** Francisco R. tiene todos los permisos. Victor puede todo menos administrar usuarios. Samantha M., Pamela V. y Rachel pueden tomar, resolver y confirmar duplicados; no pueden transferir tickets de otros, descartar, restaurar ni confirmar Dispose.
4. **Alerta previa al vencimiento:** el prototipo avisa 24 h antes. ¿Está bien?
5. **Clave anti-duplicado de tickets:** el prototipo usa código + tipo de incidencia. ¿Basta, o se necesita también el tracking inbound?
6. **Paquete sin código** (sin etiqueta): no puede deduplicarse por código. ¿Se usa una foto o una descripción como identificador?
7. **Duplicado ES** con pantalla de selección de paquetería: ¿cuenta como "duplicado confirmado" desde que se reporta, o espera a que alguien lo confirme?
8. **Regla de zonas** (≤ 5 kg y ≤ 60 cm → Zona 1): es un ejemplo. Hacen falta las tablas reales de tarifas.
9. **Retornos:** ¿qué fuente real se usa? Recomendado: leer la hoja "Escaneo de Retornos" con una cuenta de servicio de solo lectura (ADR-001, opción B). La hoja no tiene rack ni estado; ¿se necesitan?
11. **Racks:** ¿tienen o pueden tener etiqueta con código de barras? Si sí, se puede pedir confirmar el acomodo escaneando el rack.
10. **Motivos que se resuelven en piso** (Guía no reconocida, Extra Dept, No use label): con el registro de 3 clicks hoy abren ticket. ¿Deben registrarse directo como "Resuelto en piso" (solo historial)?
