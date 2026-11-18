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
| 2026-11-17 | Los racks no tienen código de barras: el rack se asigna solo por paquetería y el operador puede cambiarlo en pantalla (sin confirmación por escaneo). | Propietario |
| 2026-11-17 | El módulo de retornos se integra apagado por defecto (`RETURNS_MODE=off`), solo lectura y sin escribir en la hoja ni en el Site. Ver ADR-001. | Claude Code (propuesta, confirmar) |
| 2026-11-17 | Chat interno sin "tipo" de mensaje. Las fotos se envían desde el chat (texto, foto o ambos) y se quitó la pestaña Evidencias. Las fotos siguen siendo evidencias del expediente y no se borran. | Propietario |
| 2026-11-17 | Los códigos MX/ES se pueden teclear sin prefijo (`4748635` = `ES-4748635` o `MX-4748635`). Un número solo de 6 a 9 dígitos en el campo de código queda "por identificar" y el agente lo busca en Bringgo y EasyShip; el anti-duplicado trata `4748635`, `MX-4748635` y `ES-4748635` como el mismo paquete. Un número **escaneado** sigue siendo guía. | Propietario (pedido) · Claude Code (diseño) |
| 2026-11-17 | Bandeja de tickets: solo filtros Estado y Responsable (se quitan Motivo, Origen, Vencimiento y Orden) y un buscador por código MX/ES o guía, que es la herramienta principal. Para CS y Victor, botón "Resuelto" en la fila: un clic, sin ventana adicional; queda en "Resueltos" e historial. | Propietario (pedido) · Claude Code (diseño) |
| 2026-11-17 | Detalles de la resolución rápida: (a) la búsqueda ignora los filtros y busca en todos los estados; (b) si el ticket no tiene responsable, quien pulsa "Resuelto" queda como responsable; (c) CS no puede resolver con un clic un ticket que tiene otra persona; Victor y Francisco R. sí (permiso de transferir) y queda anotado; (d) los tickets en Dispose programado no muestran el botón. | Propietario (confirmó la propuesta de Claude Code) |
| 2026-11-17 | Se agrega "Reabrir" para tickets resueltos (en lugar de "Deshacer"). Puede quien lo resolvió y quien tiene el permiso de restaurar (hoy Victor y Francisco R.); la resolución anterior queda en el historial. | Propietario (eligió Reabrir y confirmó quién puede) |
| 2026-11-17 | Equipo de retornos: Adrian y Josué (Isaac pasó a Operación, ver abajo). Solo registran incidencias (perfil operador, área "Retornos"); sin permisos de CS ni de Victor. | Propietario |
| 2026-11-17 | Usuarios se agregan y se dan de baja desde "Equipo y permisos" con perfiles fijos. La baja es lógica (no se borra): no puede entrar, sus tickets abiertos quedan sin responsable y se puede reactivar. Nadie se da de baja a sí mismo. | Propietario (pedido) · Claude Code (diseño) |
| 2026-11-17 | Usuarios nuevos: Janneth en Customer Service (mismos permisos que Samantha, Pamela y Rachel) e Isaac como operador de Operación. | Propietario |
| 2026-11-17 | Interfaz en español e inglés (botón ES/EN, también en el inicio de sesión), inicio de sesión y "Agregar persona" centrados, y diseño horizontal oscuro estilo Vuexy con opción a claro. Idioma y tema se guardan por PC; el historial y lo que escribe la gente no se traducen. Ver ADR-003. | Propietario (pedido) · Claude Code (diseño) |
| 2026-11-18 | Los datos se guardan fuera de la carpeta del programa (Windows: `C:\ProgramData\MX Wharehouse\data`), con respaldo automático de la base al arrancar y cada 6 h (últimos 30), `npm run respaldo` y `actualizar.bat`. La primera vez se copian los datos de `app\data` sin borrarlos. La demo ya no cambia su clave de almacenamiento entre versiones. | Propietario (pedido: no perder datos al actualizar) · Claude Code (diseño) |

## Pendientes (requieren respuesta del propietario)

1. **Repositorio real:** ¿dónde está (GitHub owner/repo)? Sin él no se puede hacer el diagnóstico técnico ni las migraciones.
2. **API de Bringgo y EasyShip:** ¿hay acceso autorizado, documentación o exportaciones? Si no, se arranca con captura manual o CSV.
3. **Permisos del equipo de CS (propuesta del prototipo, falta confirmar):** Francisco R. tiene todos los permisos. Victor puede todo menos administrar usuarios. Samantha M., Pamela V., Rachel y Janneth pueden tomar, resolver y confirmar duplicados; no pueden transferir tickets de otros, descartar, restaurar ni confirmar Dispose.
4. **Alerta previa al vencimiento:** el prototipo avisa 24 h antes. ¿Está bien?
5. **Clave anti-duplicado de tickets:** el prototipo usa código + tipo de incidencia. ¿Basta, o se necesita también el tracking inbound?
6. **Paquete sin código** (sin etiqueta): no puede deduplicarse por código. ¿Se usa una foto o una descripción como identificador?
7. **Duplicado ES** con pantalla de selección de paquetería: ¿cuenta como "duplicado confirmado" desde que se reporta, o espera a que alguien lo confirme?
8. **Regla de zonas** (≤ 5 kg y ≤ 60 cm → Zona 1): es un ejemplo. Hacen falta las tablas reales de tarifas.
9. **Retornos:** ¿qué fuente real se usa? Recomendado: leer la hoja "Escaneo de Retornos" con una cuenta de servicio de solo lectura (ADR-001, opción B). La hoja no tiene rack ni estado; ¿se necesitan?
10. **Motivos que se resuelven en piso** (Guía no reconocida, Extra Dept, No use label): con el registro de 3 clicks hoy abren ticket. ¿Deben registrarse directo como "Resuelto en piso" (solo historial)?
11. **Número sin MX/ES repetido en las dos plataformas:** si `4748635` existe como MX y como ES, el agente muestra ambas y pide buscar de nuevo con el prefijo. ¿Pasa en la práctica? Si los rangos no se cruzan (hoy MX ≈ 2.9–3.0 M y ES ≈ 4.4–4.7 M), se podría decidir la plataforma al instante por el rango.
12. **Bitácora de altas y bajas de usuarios:** hoy no queda registro de quién agregó o dio de baja a alguien (requiere una tabla nueva, es decir, una migración). ¿Se aprueba?
13. **Idioma y tema por persona o por PC:** hoy se guardan en cada navegador. ¿Debe seguir a la persona en cualquier PC? (requiere una columna nueva, es decir, una migración).
