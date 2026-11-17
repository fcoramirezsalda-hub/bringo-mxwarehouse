/* MX Wharehouse · idioma de la interfaz (Español / English).
 *
 * El español es el idioma fuente: app.js genera el HTML en español y este archivo traduce lo que se pinta.
 * Las cadenas en español sirven de clave (como los msgid de gettext). Así app.js y la demo no cambian
 * y lo que no tenga traducción simplemente queda en español.
 *
 * Qué NO se traduce: lo que escribe la gente (chat, resolución, justificación, descripción), el historial
 * de auditoría (queda como se registró), nombres, códigos y guías. Se marcan con translate="no".
 * Los valores de <option> sin atributo value se fijan antes de traducir, para que el servidor reciba
 * siempre el valor en español.
 */
'use strict';
(function () {
  const KEY = 'mxw-lang';
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  // ---------- Diccionario exacto: español → inglés ----------
  const EN = {
    // Marca, sesión y navegación
    'Incidencias de registro': 'Intake incidents', '¿Quién eres?': 'Who are you?', 'Entrar': 'Sign in', 'Salir': 'Sign out',
    'Inicia sesión.': 'Please sign in.', 'Usuario o PIN incorrecto.': 'Wrong user or PIN.', 'Demasiados intentos. Espera un minuto.': 'Too many attempts. Wait a minute.',
    'Inicia sesión para continuar': 'Sign in to continue', 'Idioma': 'Language', 'Tema': 'Theme', 'Oscuro': 'Dark', 'Claro': 'Light',
    'Cambiar a tema claro': 'Switch to light theme', 'Cambiar a tema oscuro': 'Switch to dark theme', 'Menú principal': 'Main menu',
    'Escanear retorno': 'Scan return', 'Retornos escaneados': 'Scanned returns', 'Registrar incidencia': 'Report incident', 'Mis reportes': 'My reports',
    'Bandeja de tickets': 'Ticket inbox', 'Tablero': 'Dashboard', 'Mercancías duplicadas': 'Duplicate merchandise', 'Enviados dañados': 'Shipped damaged',
    'Archivo de descartes': 'Discard archive', 'Equipo y permisos': 'Team & permissions',
    'Gestión': 'Management', 'Piso': 'Floor', 'Personal': 'Staff', 'Mi estación': 'My station',
    'Panel administrativo': 'Admin panel', 'Operación': 'Operations', 'Operador': 'Operator', 'Ticket': 'Ticket',
    'No se pudo cargar': 'Could not load', 'Agente de búsqueda…': 'Lookup agent…', 'Agente de búsqueda': 'Lookup agent', 'en línea': 'online',

    // Estados, motivos, áreas, desenlaces, etiquetas de chat
    'Abierto': 'Open', 'En gestión': 'In progress', 'Esperando respuesta': 'Awaiting response', 'Resuelto': 'Resolved', 'Enviado dañado': 'Shipped damaged',
    'Dispose programado': 'Dispose scheduled', 'Dispose realizado': 'Dispose completed', 'Descartado': 'Discarded',
    'Guía no reconocida': 'Unrecognized tracking', 'Sin producto o diferente': 'Missing or different product', 'Dañado o con escurrimiento': 'Damaged or leaking',
    'Sin etiqueta': 'No label', 'sin etiqueta': 'no label', 'Duplicado': 'Duplicate', 'Otro': 'Other',
    'Equipo turco': 'Turkish team', 'Vendedor Amazon': 'Amazon seller', 'Procesamiento': 'Processing', 'Retornos': 'Returns',
    'Pendiente': 'Pending', 'Regresó': 'Returned', 'Dispose de paquetería': 'Carrier dispose', 'Entregado': 'Delivered',
    'Mensaje': 'Message', 'Instrucción del equipo turco': 'Turkish team instruction', 'Instrucción del vendedor Amazon': 'Amazon seller instruction', 'Seguimiento': 'Follow-up',
    'Por identificar': 'To be identified', 'Buscando…': 'Searching…', 'Buscando': 'Searching', 'Lista': 'Ready', 'Sin coincidencias': 'No matches',
    'Plazo cumplido': 'Deadline reached', 'Evidencia de disposición': 'Disposal evidence',
    'Procesadora de paquetes': 'Package processor', 'Procesador de paquetes': 'Package processor', 'Procesador(a) de paquetes': 'Package processor',
    'Equipo de retornos': 'Returns team', 'Resuelve incidencias': 'Resolves incidents', 'administrador del sistema': 'system administrator',

    // Registrar incidencia
    'Identifica el paquete': 'Identify the package', 'Cambiar': 'Change', 'Escanea la guía': 'Scan the tracking label', 'Buscar': 'Search',
    '¿No escanea o el número no es válido?': 'Won’t scan, or the number isn’t valid?',
    'Teclea el código MX o ES con problema': 'Type the problem MX or ES code', 'con o sin “MX-”/“ES-”': 'with or without “MX-”/“ES-”',
    'MX-0000000 o solo el número': 'MX-0000000 or just the number', 'Usar código': 'Use code', 'El paquete no tiene etiqueta': 'The package has no label',
    'Teclea el código MX o ES.': 'Type the MX or ES code.', 'Escanea o escribe la guía.': 'Scan or type the tracking number.',
    'Número tecleado': 'Typed number', 'Código tecleado': 'Typed code', 'Guía escaneada': 'Scanned tracking',
    'Sin código: se identifica por descripción.': 'No code: identified by its description.',
    'La información de la orden la agrega el agente de búsqueda al ticket en unos minutos.': 'The lookup agent adds the order information to the ticket within a few minutes.',
    'Si registras el mismo motivo, se agrega a ese expediente.': 'If you report the same reason, it is added to that case file.',
    'Motivo y abrir ticket': 'Reason and open ticket',
    'El tracking no escanea, no es válido o no aparece en la plataforma': 'The tracking won’t scan, isn’t valid or isn’t in the platform',
    'Especifica el motivo': 'Specify the reason', 'obligatorio': 'required', 'obligatoria': 'required', 'Descripción del producto': 'Product description',
    'Ej. lámpara LED de escritorio negra': 'E.g. black LED desk lamp',
    'Re-empácalo y envíalo. Queda en el registro de enviados dañados.': 'Repack and ship it. It is logged in the shipped-damaged register.',
    'Se abre sin responsable para Victor y Customer Service.': 'Opens unassigned for Victor and Customer Service.',
    'A nombre de': 'Logged as', ', con fecha y hora.': ', with date and time.',
    'Falta: especifica el motivo.': 'Missing: specify the reason.', 'Falta: describe el producto.': 'Missing: describe the product.',
    'Falta: especifica el motivo y describe el producto.': 'Missing: specify the reason and describe the product.',
    'Registrar envío dañado': 'Log damaged shipment', 'Abrir ticket': 'Open ticket',
    'Elige el motivo; después presiona “Abrir ticket”.': 'Pick the reason, then press “Open ticket”.', 'Primero identifica el paquete.': 'Identify the package first.',
    'Estación de': 'Station of', 'Escanea y presiona Enter, o teclea el código. Máximo 3 clics para abrir un ticket.': 'Scan and press Enter, or type the code. At most 3 clicks to open a ticket.',
    'se agregó al ticket abierto.': 'added to the open ticket.', 'quedó en el registro de enviados dañados.': 'logged in the shipped-damaged register.',
    'ticket abierto; Victor y Customer Service ya lo ven.': 'ticket opened; Victor and Customer Service can see it.',

    // Tablas y bandeja
    'Solo consulta. La gestión la hacen Victor y Customer Service.': 'Read only. Victor and Customer Service manage them.',
    'Folio': 'Ticket no.', 'Código / guía': 'Code / tracking', 'Motivo': 'Reason', 'Registrado': 'Reported', 'Responsable': 'Owner', 'Estado': 'Status',
    'Sin asignar': 'Unassigned', 'Aún no registras incidencias.': 'You haven’t reported any incidents yet.', 'Orden': 'Order', 'Registró': 'Reported by',
    'Esperando a': 'Waiting on', 'Plazo': 'Deadline', 'Acción': 'Action', 'Reabrir': 'Reopen', 'Ningún ticket coincide con los filtros.': 'No tickets match the filters.',
    'Compartida por Victor y Customer Service': 'Shared by Victor and Customer Service', 'abrir un ticket no lo asigna': 'opening a ticket doesn’t assign it',
    'se actualiza sola': 'refreshes automatically', 'Buscar por código MX/ES o guía': 'Search by MX/ES code or tracking',
    'Escanea o teclea: MX-3015532, 4748635, 1Z999…': 'Scan or type: MX-3015532, 4748635, 1Z999…', 'Limpiar': 'Clear',
    'Abiertos': 'Open', 'Sin responsable': 'Unassigned', 'Asignados a mí': 'Assigned to me', 'Resueltos': 'Resolved', 'Cerrados': 'Closed', 'Todos': 'All',
    'en todos los estados': 'in every status', 'los filtros no aplican mientras buscas.': 'filters don’t apply while searching.',

    // Orden (agente)
    'Información de la orden': 'Order information', 'MX-0000000, ES-0000000, número o guía': 'MX-0000000, ES-0000000, number or tracking',
    'Buscar de nuevo': 'Search again', 'El agente de búsqueda está consultando Bringgo / EasyShip. Esta página se actualiza sola.': 'The lookup agent is querying Bringgo / EasyShip. This page refreshes automatically.',
    'Confirma cuál corresponde al paquete.': 'Confirm which one matches the package.', 'Obtenida por el agente': 'Retrieved by the agent', 'solo lectura.': 'read only.',
    'No se pudo consultar': 'Could not query', 'Sin código ni guía: el agente no puede buscar todavía.': 'No code or tracking: the agent can’t search yet.',

    // Detalle del ticket
    '← Bandeja': '← Inbox', 'Respuesta pendiente de': 'Awaiting response from', 'Ubicación física': 'Physical location', 'Sin registrar': 'Not recorded',
    'Fecha límite': 'Due date', 'duplicado (10 d)': 'duplicate (10 d)', 'general (3 d)': 'general (3 d)', 'Motivo especificado': 'Specified reason',
    'Descripción': 'Description', 'Desenlace del envío': 'Shipment outcome', 'Resolución final': 'Final resolution',
    'Sin conversación': 'No conversation', 'El chat se abre cuando hace falta coordinar algo. Aquí también se suben las fotos.': 'Start the chat when something needs coordinating. Photos are uploaded here too.',
    'Iniciar conversación': 'Start conversation', 'Escribe un mensaje o una instrucción recibida': 'Write a message or an instruction you received',
    'Adjuntar foto': 'Attach photo', 'Enviar': 'Send', 'Quitar foto': 'Remove photo', 'Las fotos quedan en el expediente y no se pueden borrar.': 'Photos stay in the case file and can’t be deleted.',
    'Tomar ticket': 'Take ticket', 'Liberar': 'Release', 'Transferir a': 'Transfer to', 'Transferir': 'Transfer',
    'Asignado a otra persona. Puedes consultar y escribir en el chat.': 'Assigned to someone else. You can view it and write in the chat.',
    'Ninguno': 'None', 'Guardar': 'Save', 'Desenlace del envío dañado': 'Damaged shipment outcome', 'Mercancía duplicada': 'Duplicate merchandise',
    'Confirmó': 'Confirmed by', 'Confirmar que es duplicado': 'Confirm it’s a duplicate', 'Inicia el plazo de 10 días.': 'Starts the 10-day deadline.',
    'Sube la evidencia y confirma.': 'Upload the evidence and confirm.', 'Confirmar Dispose realizado': 'Confirm dispose completed',
    'Resolver ticket': 'Resolve ticket', 'Toma el ticket para resolverlo.': 'Take the ticket to resolve it.', 'Descartar requiere permiso especial.': 'Discarding requires special permission.',
    'Descartar incidencia reportada por error…': 'Discard incident reported by mistake…', 'Pasa al archivo de auditoría. No se borra y puede restaurarse.': 'It moves to the audit archive. It isn’t deleted and can be restored.',
    'Justificación (obligatoria)': 'Justification (required)', 'Cancelar': 'Cancel', 'Continuar': 'Continue', 'Segunda confirmación': 'Second confirmation',
    'No, volver': 'No, go back', 'Sí, descartar': 'Yes, discard', 'Restaurar': 'Restore',

    // Tablero y listas
    'Hoy': 'Today', 'Registradas hoy': 'Reported today', 'Tickets abiertos': 'Open tickets', 'Vencidos': 'Overdue', 'Vencen en 24 h': 'Due within 24 h',
    'Por motivo': 'By reason', 'Por persona': 'By person', 'Sin registros hoy.': 'No reports today.', 'La copia a Google Sheets falló': 'The Google Sheets copy failed',
    '. Se reintenta cada minuto.': '. It retries every minute.', 'Copia en Google Sheets: sin configurar': 'Google Sheets copy: not configured', 'Copia en Google Sheets: pendiente': 'Google Sheets copy: pending',
    '10 días naturales desde la confirmación': '10 calendar days from confirmation', 'después pasa a Dispose programado': 'then it moves to Dispose scheduled',
    'Re-empacados y enviados; se espera que regresen o terminen en dispose con la paquetería': 'Repacked and shipped; expected to come back or end in carrier dispose',
    'Enviado': 'Shipped', 'Desenlace': 'Outcome', 'Sin envíos dañados.': 'No damaged shipments.',
    'Auditoría': 'Audit', 'nada se borra': 'nothing is deleted', 'Código': 'Code', 'Descartó': 'Discarded by', 'Justificación': 'Justification',
    'Ver expediente': 'View case file', 'No hay descartes.': 'No discards.',

    // Equipo
    'Activo': 'Active', 'Dado de baja': 'Deactivated', 'Restablecer PIN': 'Reset PIN', 'Dar de baja': 'Deactivate', 'Reactivar': 'Reactivate',
    'Entrégalo en persona. No se vuelve a mostrar.': 'Hand it over in person. It won’t be shown again.', 'Agregar persona': 'Add person',
    'entra con su nombre y un PIN de 4 dígitos': 'signs in with their name and a 4-digit PIN', 'Nombre': 'Name', 'Ej. Isaac': 'E.g. Isaac', 'Perfil': 'Profile', 'Agregar': 'Add',
    'Operación (registra incidencias)': 'Operations (reports incidents)', 'Equipo de retornos (registra incidencias)': 'Returns team (reports incidents)',
    'Customer Service (panel: tomar, resolver, confirmar duplicado)': 'Customer Service (panel: take, resolve, confirm duplicate)',
    'Procesamiento (panel: todo menos administrar usuarios)': 'Processing (panel: everything except managing users)',
    'Persona': 'Person', 'Rol': 'Role', 'Área': 'Area', 'Matriz de permisos': 'Permission matrix', 'validados en el servidor': 'enforced on the server',
    'Operadores y retornos': 'Operators and returns', 'Sí': 'Yes', 'No': 'No', 'Ver bandeja, chat, historial y evidencias': 'View inbox, chat, history and evidence',
    'Transferir / liberar tickets de otros': 'Transfer / release other people’s tickets', 'Resolver': 'Resolve', 'Confirmar duplicado': 'Confirm duplicate',
    'Descartar incidencia': 'Discard incident', 'Restaurar descartada / reabrir resueltos de otros': 'Restore discarded / reopen others’ resolved tickets',
    'Administrar usuarios': 'Manage users',

    // Avisos
    'Escribe al menos 4 caracteres del código o la guía.': 'Type at least 4 characters of the code or tracking.', 'No se pudo leer la foto.': 'Couldn’t read the photo.',
    'Rack actualizado': 'Rack updated', 'Asignación guardada': 'Assignment saved', 'Desenlace guardado': 'Outcome saved', 'queda en Resueltos': 'stays in Resolved',
    'Ticket tomado': 'Ticket taken', 'Ticket liberado': 'Ticket released', 'Ticket transferido': 'Ticket transferred', 'Ubicación guardada': 'Location saved',
    'Duplicado confirmado: inicia el plazo de 10 días': 'Duplicate confirmed: the 10-day deadline starts', 'Ticket resuelto': 'Ticket resolved',
    'Escribe un mensaje o adjunta una foto.': 'Write a message or attach a photo.', 'En cola: el agente buscará en unos minutos': 'Queued: the agent will search in a few minutes',
    'La justificación es obligatoria (mínimo 10 caracteres).': 'A justification is required (at least 10 characters).', 'Pasó al archivo de descartes': 'Moved to the discard archive',
    'Ticket restaurado': 'Ticket restored', 'Elige la foto de la disposición.': 'Choose the disposal photo.', 'Disposición confirmada con evidencia': 'Disposal confirmed with evidence',

    // Retornos
    'Abrir Site original': 'Open original Site', 'PRUEBA': 'TEST', 'datos ficticios': 'mock data', 'Consulta privada del Site': 'Private Site query',
    'hasta 2,000 retornos recientes': 'up to 2,000 recent returns', 'Los estados se reinician al detener el servidor. Los tickets son locales.': 'Statuses reset when the server stops. Tickets are local.',
    'Sheets alimenta Sites miércoles y sábados a las 19:30, hora México. Los estados reales se gestionan en el Site original.': 'Sheets feeds Sites on Wednesdays and Saturdays at 19:30 Mexico time. Real statuses are managed in the original Site.',
    'Buscar retornos': 'Search returns', 'Guía, paquetería, rack o estado': 'Tracking, carrier, rack or status', 'Buscar / actualizar': 'Search / refresh',
    'Guía': 'Tracking', 'Paquetería': 'Carrier', 'Acciones': 'Actions', 'Consulta': 'View only', 'Nuevo estado': 'New status', 'Guardar estado': 'Save status',
    'recibido': 'received', 'acomodado': 'shelved', 'cerrado': 'closed', 'Sin resultados.': 'No results.',
    'Solo en esta PC': 'Only on this PC', 'En la hoja': 'In the sheet', 'Reintentando': 'Retrying', 'Ya estaba en la hoja': 'Already in the sheet',
    'La hoja "Escaneo de Retornos" no está conectada (npm run retornos:setup). Los escaneos se guardan aquí.': 'The "Escaneo de Retornos" sheet isn’t connected (npm run retornos:setup). Scans are saved here.',
    'La hoja no respondió': 'The sheet didn’t respond', 'No se registró': 'Not recorded', 'Anulado': 'Voided', 'Acomodar en': 'Put away in', 'Sin rack': 'No rack',
    'Cambiar rack': 'Change rack', 'Elige la paquetería (se aprende para la próxima)': 'Choose the carrier (it’s learned for next time)', '¿No es correcta? Corrígela': 'Not right? Correct it',
    'Anular escaneo': 'Void scan', 'Racks por paquetería': 'Racks by carrier',
    'Cada paquetería va a un rack. "Por identificar" es el rack de espera. Lo cambia quien administra usuarios.': 'Each carrier goes to one rack. "Por identificar" (to be identified) is the holding rack. Whoever manages users can change it.',
    'Escanea la guía del retorno (el lector termina con Enter)': 'Scan the return’s tracking (the scanner ends with Enter)', 'Guía / RMA': 'Tracking / RMA',
    'Registrar': 'Record', 'Escaneados hoy': 'Scanned today', 'Buscar escaneos': 'Search scans', 'Guía, paquetería o rack': 'Tracking, carrier or rack',
    'Hora': 'Time', 'Hoja': 'Sheet', 'Aún no hay escaneos hoy.': 'No scans yet today.', 'Puedes seguir escaneando.': 'You can keep scanning.',

    // Mensajes del servidor (texto fijo)
    'Asignación inválida.': 'Invalid assignment.', 'Departamento no válido.': 'Invalid department.', 'Describe el producto (no tiene código).': 'Describe the product (it has no code).',
    'Desenlace no válido.': 'Invalid outcome.', 'El archivo pasa de 8 MB.': 'The file is over 8 MB.',
    'El código debe ser MX-0000000, ES-0000000 o solo el número (ej. 4748635).': 'The code must be MX-0000000, ES-0000000 or just the number (e.g. 4748635).',
    'El escaneo de retornos está desactivado.': 'Return scanning is turned off.', 'El módulo de retornos está desactivado.': 'The returns module is turned off.',
    'El ticket cambió hace un instante; vuelve a intentarlo.': 'The ticket changed a moment ago; try again.', 'El ticket no está descartado.': 'The ticket isn’t discarded.',
    'El ticket no está en Dispose programado.': 'The ticket isn’t in Dispose scheduled.', 'El ticket no tiene responsable.': 'The ticket has no owner.',
    'Elige a una persona de Procesamiento o Customer Service.': 'Choose someone from Processing or Customer Service.', 'Elige un motivo válido.': 'Choose a valid reason.',
    'Elige un perfil válido.': 'Choose a valid profile.', 'Escanea una guía o teclea el código MX/ES.': 'Scan a tracking label or type the MX/ES code.',
    'Escribe el nombre (de 2 a 40 caracteres).': 'Type the name (2 to 40 characters).', 'Escribe la resolución final (qué se hizo y dónde quedó el paquete).': 'Write the final resolution (what was done and where the package is).',
    'Escribe por qué se anula (mínimo 5 caracteres).': 'Write why it is voided (at least 5 characters).', 'Escribe un MX/ES o una guía.': 'Type an MX/ES or a tracking number.',
    'Escribe un mensaje.': 'Write a message.', 'Ese escaneo está anulado.': 'That scan is voided.', 'Especifica el motivo.': 'Specify the reason.', 'Estado inválido.': 'Invalid status.',
    'Este ticket está en Dispose programado; confirma la disposición con evidencia.': 'This ticket is in Dispose scheduled; confirm the disposal with evidence.',
    'Falta la segunda confirmación.': 'The second confirmation is missing.', 'La guía es muy corta o no se leyó bien. Vuelve a escanear.': 'The tracking is too short or didn’t read well. Scan again.',
    'La guía es muy corta.': 'The tracking is too short.', 'No es un envío dañado.': 'It isn’t a damaged shipment.', 'No existe ese escaneo.': 'That scan doesn’t exist.',
    'No existe ese ticket.': 'That ticket doesn’t exist.', 'No existe ese usuario.': 'That user doesn’t exist.', 'No puedes darte de baja a ti mismo.': 'You can’t deactivate yourself.',
    'Paquetería no válida.': 'Invalid carrier.', 'Rack no válido.': 'Invalid rack.', 'Solo Victor y Customer Service pueden ver tickets.': 'Only Victor and Customer Service can see tickets.',
    'Solo aplica a tickets de duplicado.': 'Only applies to duplicate tickets.', 'Solo el responsable o alguien con permiso de transferir puede hacer esto.': 'Only the owner or someone allowed to transfer can do this.',
    'Solo quien lo resolvió o alguien con permiso de restaurar puede reabrirlo.': 'Only whoever resolved it or someone allowed to restore can reopen it.',
    'Solo se pueden reabrir tickets resueltos.': 'Only resolved tickets can be reopened.', 'Sube la evidencia de la disposición antes de confirmarla.': 'Upload the disposal evidence before confirming it.',
    'Sube una foto (JPG, PNG, WEBP) o PDF.': 'Upload a photo (JPG, PNG, WEBP) or a PDF.', 'Un paquete sin etiqueta solo puede ser "Sin etiqueta" u "Otro".': 'A package without a label can only be "No label" or "Other".',
    'Ya estaba confirmado como duplicado.': 'It was already confirmed as a duplicate.', 'Ya está descartado.': 'It’s already discarded.', 'No se pudo tomar el ticket.': 'Couldn’t take the ticket.',
    'Indica si la persona queda activa (true o false).': 'Say whether the person stays active (true or false).',

    // Diálogos del navegador (prompt / confirm)
    '¿Por qué se anula este escaneo? (queda en el historial y en Observaciones de la hoja)': 'Why is this scan voided? (it stays in the history and in the sheet’s Observaciones column)',
  };

  // ---------- Patrones: textos con datos ----------
  const P = [
    [/^Vencido hace (.+)$/, 'Overdue by $1'], [/^Vence en (.+)$/, 'Due in $1'], [/^Vence (.+)$/, 'Due $1'],
    [/^“(.*)” no tiene formato de código MX o ES \(ej\. MX-3015532 o solo 4748635\)\.$/, '“$1” isn’t an MX or ES code (e.g. MX-3015532 or just 4748635).'],
    [/^Sin MX\/ES: el agente lo busca como MX-(\d+) en Bringgo y como ES-\d+ en EasyShip y completa el código\.$/, 'No MX/ES: the agent looks it up as MX-$1 in Bringgo and as ES-$1 in EasyShip and completes the code.'],
    [/^Registrado (\S+)$/, 'Registered $1'], [/^Agregado a (\S+)$/, 'Added to $1'],
    [/^Ya hay un ticket abierto para (.+)$/, 'There is already an open ticket for $1'], [/^Ya hay (\d+) tickets abiertos para (.+)$/, 'There are already $1 open tickets for $2'],
    [/^Marcar (\S+) como resuelto$/, 'Mark $1 as resolved'], [/^Reabrir (\S+)$/, 'Reopen $1'],
    [/^(\d+) resultados? para$/, (m, n) => `${n} result${n === '1' ? '' : 's'} for`], [/^(\d+) resultados$/, '$1 results'],
    [/^Se buscó en: (.*)$/, 'Searched in: $1'], [/^Chat interno \((\d+)\)$/, 'Internal chat ($1)'], [/^Historial \((\d+)\)$/, 'History ($1)'],
    [/^Foto: (.*)$/, 'Photo: $1'], [/^Descartado por (.+)$/, 'Discarded by $1'], [/^Revisión inicial: (.+)$/, 'Initial review: $1'],
    [/^Descartar (\S+)$/, 'Discard $1'], [/^¿Descartar (\S+) a nombre de (.+)\?$/, 'Discard $1 under the name of $2?'],
    [/^(\d+) sin responsable$/, '$1 unassigned'], [/^Último proceso de plazos: (.*)$/, 'Last deadline run: $1'], [/^(\d+) cambio\(s\)$/, '$1 change(s)'],
    [/^Copia en Google Sheets: al día \((.*)\)$/, 'Google Sheets copy: up to date ($1)'],
    [/^Desenlace de (\S+)$/, 'Outcome of $1'], [/^Usuario creado\. PIN de (.+):$/, 'User created. PIN for $1:'], [/^Nuevo PIN de (.+):$/, 'New PIN for $1:'],
    [/^Ya había un ticket abierto: (.+)$/, 'There was already an open ticket: $1'], [/^Ticket creado: (.+)$/, 'Ticket created: $1'],
    [/^(\S+) reabierto$/, '$1 reopened'], [/^(\S+) resuelto$/, '$1 resolved'], [/^(.+) dado de baja$/, '$1 deactivated'], [/^(\d+) ticket\(s\) liberados$/, '$1 ticket(s) released'],
    [/^(.+) reactivado$/, '$1 reactivated'], [/^sin conexión desde (.+)$/, 'offline since $1'], [/^sin conexión$/, 'offline'], [/^(\d+) en cola$/, '$1 queued'],
    [/^Consultado: (.*)$/, 'Queried: $1'], [/^Rack para (.+)$/, 'Rack for $1'], [/^Ocupación: (.*)$/, 'Occupancy: $1'],
    [/^Guías confirmadas para aprender: (\d+)$/, 'Confirmed tracking numbers for learning: $1'], [/^(\d+) pendientes; se reintenta solo\.$/, '$1 pending; it retries on its own.'],
    [/^(Guía repetida: ya la escaneó )(.+) el (.+?)( \(anulado\))?\. No se registró otra vez\.$/, (m, a, who, when, v) => `Duplicate tracking: ${who} already scanned it on ${when}${v ? ' (voided)' : ''}. It wasn’t recorded again.`],
    [/^Guía repetida: ya está en la hoja "Escaneo de Retornos"( \(fila (\d+)\))?\. No se registró otra vez\.$/, (m, f, n) => `Duplicate tracking: it’s already in the "Escaneo de Retornos" sheet${n ? ' (row ' + n + ')' : ''}. It wasn’t recorded again.`],
    [/^Lo tiene (.+); solo el responsable puede resolverlo\.$/, '$1 has it; only the owner can resolve it.'], [/^(.+) tomó este ticket un instante antes\.$/, '$1 took this ticket a moment earlier.'],
    [/^Tu usuario no tiene permiso para: (.+)\.$/, (m, p) => `Your user isn’t allowed to: ${tr(p)}.`], [/^Ya existe (.+)\.$/, '$1 already exists.'],
    [/^(.+) ya existe pero está dado de baja\. Usa "Reactivar"\.$/, '$1 already exists but is deactivated. Use "Reactivate".'],
    [/^Paquetería no válida: (.+)$/, 'Invalid carrier: $1'], [/^Rack no válido para (.+)$/, 'Invalid rack for $1'], [/^El ticket está (.+)\.$/, (m, s) => `The ticket is ${tr(s.charAt(0).toUpperCase() + s.slice(1)).toLowerCase()}.`],
    [/^¿Dar de baja a (.+)\? Ya no podrá entrar\. Sus tickets abiertos quedan sin responsable\. Su historial se conserva y se puede reactivar\.$/, 'Deactivate $1? They won’t be able to sign in. Their open tickets become unassigned. Their history is kept and they can be reactivated.'],
    [/^Error (\d+)$/, 'Error $1'],
  ];

  const MONTHS = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  let lang = store.get(KEY) === 'en' ? 'en' : 'es';

  function exact(s) {
    if (Object.prototype.hasOwnProperty.call(EN, s)) return EN[s];
    for (const [re, rep] of P) if (re.test(s)) return s.replace(re, rep);
    return null;
  }
  // Traduce una cadena en español; devuelve la misma si no hay traducción.
  function tr(s) {
    if (lang !== 'en' || !s) return s;
    const m = String(s).match(/^(\s*)([\s\S]*?)(\s*)$/), core = m[2];
    if (!core) return s;
    let out = exact(core);
    if (out == null) {
      // Separadores al final ("Panel administrativo ›", "Guía no reconocida ·", "Confirmó:")
      const e = core.match(/^([\s\S]*?)(\s*[·›:]\s*)$/);
      if (e && e[1]) { const x = exact(e[1]); if (x != null) out = x + e[2]; }
    }
    if (out == null && core.includes(' · ')) {
      // Textos compuestos: "Guía no reconocida · MX-123", "Agente de búsqueda · en línea · 2 en cola"
      const parts = core.split(' · '), tp = parts.map(p => { const x = exact(p); return x == null ? p : x; });
      if (tp.some((x, i) => x !== parts[i])) out = tp.join(' · ');
    }
    return out == null ? s : m[1] + out + m[3];
  }

  // ---------- Traducción del DOM ----------
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const ORIG = new WeakMap(); // nodo de texto → texto original en español
  const ORIG_ATTR = new WeakMap(); // elemento → { atributo: original }
  const skip = el => !el || el.closest('script,style,textarea,[translate="no"],[contenteditable]');

  function doText(n) {
    const el = n.parentElement; if (skip(el)) return;
    // Si app.js cambió el texto del nodo, el texto nuevo es el original.
    const rec = ORIG.get(n), src = rec && (n.data === rec.src || n.data === rec.out) ? rec.src : n.data;
    if (el.tagName === 'OPTION' && !el.hasAttribute('value')) el.setAttribute('value', src.trim()); // el servidor recibe el valor en español
    const out = tr(src);
    ORIG.set(n, { src, out });
    if (n.data !== out) n.data = out;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    let o = ORIG_ATTR.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a), rec = o && o[a], src = rec && (cur === rec.src || cur === rec.out) ? rec.src : cur, out = tr(src);
      if (!o) ORIG_ATTR.set(el, o = {});
      o[a] = { src, out };
      if (cur !== out) el.setAttribute(a, out);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === 3 ? doText(n) : doAttrs(n);
  }
  let busy = false;
  const mo = new MutationObserver(list => {
    if (busy) return; busy = true;
    try {
      for (const r of list) {
        if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttrs(r.target);
        else r.addedNodes.forEach(walk);
      }
    } finally { mo.takeRecords(); busy = false; }
  });

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-lang-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.langBtn === lang)));
    busy = true; try { walk(document.body); } finally { mo.takeRecords(); busy = false; }
  }
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'es'; store.set(KEY, lang); applyLang();
    document.dispatchEvent(new CustomEvent('mxw:lang', { detail: lang })); // app.js vuelve a pintar (fechas con meses del idioma)
  }

  function start() {
    applyLang();
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  window.MXW_I18N = { tr, setLang, get lang() { return lang; }, months: () => MONTHS[lang] };
})();
