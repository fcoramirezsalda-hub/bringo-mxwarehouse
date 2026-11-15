# Requisitos funcionales y reglas de negocio

Fuente: instrucciones del propietario (2026-11-14 y 2026-11-15). Estado de cada punto en el prototipo: ✅ demostrado · ⏳ pendiente.

## 0. Alcance

La plataforma empieza en "2. Incidencias" del flujo. La prioridad es **Incidencias durante el registro**. ✅

### Registro de incidencias

- Se puede reportar desde el inicio del escaneo. ✅
- Si el número no escanea o no es válido, se teclea el código MX/ES con problema (equivale a buscar en Bringgo "Accept goods"). ✅
- Paquete sin etiqueta: se registra sin código, con descripción. ✅
- Registro en 2 pasos y máximo 3 clicks: identificar (escanear o teclear) → motivo → Abrir ticket. Sin acciones sugeridas. "Otro" pide especificar. ✅
- "Guía no reconocida" (antes "Inbound mal capturada") va primero y destacado. ✅
- Lo resuelto en piso solo queda en el historial. ✅
- Enviados dañados: al registrar un retorno con el mismo código, se marca "Regresó" automáticamente. ✅

> La tabla de abajo es la referencia operativa del flujo; el sistema ya no muestra acciones sugeridas al registrar.

| Motivo | Acción | Destino | Ticket |
|---|---|---|---|
| Sin producto o diferente | Fotos de producto y caja + mensaje en plataforma | Pendiente de resolución | Abierto |
| Dañado o con escurrimiento | Re-empacar y enviar | Enviado con paquetería | No abre ticket: registro "Enviados dañados" con desenlace |
| Inbound mal capturada | Corregir número → reetiquetar | Despacho | Resuelto en piso |
| Extra Dept | Comparar costos → menor costo → imprimir guía | Despacho | Resuelto en piso |
| Sin etiqueta | Item Look Up por nombre: si aparece, MX disponible + guía; si no, escalar con Murat | Despacho / escalar | Resuelto en piso / Abierto |
| No use label | Generar o reimprimir guía mexicana | Despacho | Resuelto en piso |
| Duplicado | Asignar a orden sin guía; si no hay, o si ES muestra selección de paquetería: escalar | Despacho / escalar | Resuelto en piso / Abierto |

## 1. Operación de piso (contexto; el escaneo correcto queda fuera del alcance)

- Se escanea la guía americana (inbound) o el código MX/ES. MX → Bringgo, ES → EasyShip. ✅
- Escaneo correcto: verificar producto contra la foto, reetiquetar con guía MX. ES imprime 2 guías (guía MX + hoja de orden ES). ✅
- La zona de despacho (Zona 1 chicos / Zona 2 grandes) es **sugerencia**, no paso obligatorio. La separación por paquetería se hace en despacho. ✅
- Motivos de incidencia: producto distinto o sin producto, dañado o escurrimiento, inbound mal capturado, Extra Dept, sin etiqueta, No use label, duplicado. ✅
- Duplicados: buscar por ASIN y asignar a una orden sin guía MX; si no hay orden, o si EasyShip muestra la selección de paquetería y autorización, se reporta. ✅
- Se registran usuario, fecha y hora automáticamente. ✅
- Los operadores no administran tickets, no modifican resoluciones y no eliminan evidencias. ✅ (en el prototipo es solo UI; ⏳ backend)

## 2. Tickets

Campos mínimos: id, código MX/ES, tipo, creado, quién reportó, departamento, evidencias, estado, responsable actual,
departamento del que se espera respuesta, ubicación física, historial, chat interno, fecha límite, resolución final. ✅

- No duplicar tickets abiertos con el mismo código y tipo: se agrega un evento al expediente existente. ✅
- Los tickets nuevos nacen **sin responsable**. ✅
- "Tomar ticket" asigna al usuario autenticado con fecha y hora, sin que otro pueda tomarlo al mismo tiempo. ✅ UI / ⏳ atomicidad real
- Abrir un ticket no lo asigna. ✅
- Transferir y liberar según permisos; el historial de asignaciones se conserva. ✅
- Customer Service ve los tickets desde que se reportan. ✅

## 3. Chat interno

- Uno por ticket, disponible bajo demanda (no se abre solo). ✅
- Mensajes, fotos e instrucciones con autor y fecha. ✅
- Tipos para documentar instrucciones del equipo turco y de vendedores de Amazon. ✅

## 4. Plazos

- General: 3 días naturales desde la creación, alerta previa (24 h en el prototipo), si vence sigue abierto y se registra el retraso. ✅
- Duplicados: al confirmar se registra quién y cuándo, y empieza un plazo de 10 días naturales. ✅
- A los 10 días sin resolución → **Dispose programado** automático. ✅
- "Dispose realizado" solo con confirmación + evidencia. ✅
- Historial de casos enviados a Dispose por vencimiento. ✅
- Indicadores separados: tiempo de revisión inicial y plazo especial. ✅

## 5. Descartes

Permiso restringido, doble confirmación, justificación obligatoria, registro de usuario y fecha, conserva historial y evidencias,
archivo de auditoría aparte, restauración por usuarios autorizados, sin borrado físico. ✅

## 6. Retornos

- Sistema actual en Google Sheets / Google Sites: **no modificar** hasta aprobar la estrategia. ⏳
- Identificar archivos, flujo, campos y estados; proponer la conexión con tickets; evitar duplicados y pérdida de datos. ⏳
- Prototipo: registro con antiduplicado por guía y "Crear ticket" desde un retorno. ✅

## 7. Seguridad

- Permisos validados en backend y base de datos (no solo ocultar botones). ⏳
- Bitácora de auditoría y evidencias protegidas. ⏳
- Toma de tickets atómica. ⏳
- Vencimientos con proceso programado confiable e idempotente. ✅ lógica / ⏳ infraestructura
- No exponer credenciales ni tocar producción sin autorización.
