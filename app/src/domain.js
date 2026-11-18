// Reglas de negocio. Todo lo que cambia datos pasa por aquí y valida permisos en el servidor.
const { tx, H, D } = require('./db');

const TYPES = {
  inbound: 'Guía no reconocida',
  producto: 'Sin producto o diferente',
  danado: 'Dañado o con escurrimiento',
  extradept: 'Extra Dept',
  sinetiqueta: 'Sin etiqueta',
  nouse: 'No use label',
  duplicado: 'Duplicado',
  otro: 'Otro',
};
const PERMS = {
  take: 'Tomar ticket',
  transfer: 'Transferir / liberar tickets de otros',
  resolve: 'Resolver',
  confirmdup: 'Confirmar duplicado',
  discard: 'Descartar incidencia',
  restore: 'Restaurar descartada / reabrir resueltos de otros',
  dispose: 'Confirmar Dispose realizado',
  users: 'Administrar usuarios',
};
const DEPTS = ['Bringgo', 'EasyShip', 'Equipo turco', 'Vendedor Amazon', 'Murat (Laredo)', 'Customer Service', 'Procesamiento'];
const MSG_TAGS = ['Mensaje', 'Instrucción del equipo turco', 'Instrucción del vendedor Amazon', 'Seguimiento'];
const DAMAGE_OUTCOMES = ['Pendiente', 'Regresó', 'Dispose de paquetería', 'Entregado'];
const CLOSED = ['Resuelto', 'Dispose realizado', 'Descartado', 'Enviado dañado'];
const RETRY_MIN = [1, 3, 10];

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

const codeRe = /^(MX|ES)[\s-]?(\d{5,})$/i;
const normCode = v => { const m = String(v || '').trim().match(codeRe); return m ? `${m[1].toUpperCase()}-${m[2]}` : null; };
// Código tecleado: acepta "ES-4748635", "es 4748635" o solo "4748635" (sin MX/ES). Solo el número queda tal cual
// (plataforma por identificar) y el agente lo busca como MX-… en Bringgo y como ES-… en EasyShip.
const bareRe = /^#?(\d{6,9})$/;
const parseCode = v => { const s = String(v || '').trim(); const m = s.match(bareRe); return normCode(s) || (m ? m[1] : null); };
const isBare = c => /^\d+$/.test(String(c || ''));
const platOf = c => (/^(MX|ES)-/.test(String(c || '')) ? c.slice(0, 2) : null);
// Variantes que identifican el mismo paquete: 4748635 ↔ MX-4748635 / ES-4748635.
const codeKeys = c => { if (!c) return []; if (isBare(c)) return [c, 'MX-' + c, 'ES-' + c]; return [c, c.slice(3)]; };
const folio = id => 'INC-' + String(id).padStart(4, '0');
const isOpenSql = `status NOT IN (${CLOSED.map(s => `'${s}'`).join(',')})`;

function permsOf(user) { return user.role === 'admin' ? JSON.parse(user.perms || '[]') : []; }
function can(user, p) { return permsOf(user).includes(p); }
function need(user, p) { if (!can(user, p)) fail(403, `Tu usuario no tiene permiso para: ${PERMS[p] || p}.`); }
function needAdmin(user) { if (user.role !== 'admin') fail(403, 'Solo Victor y Customer Service pueden ver tickets.'); }

function event(db, ticketId, actor, kind, text, at = Date.now()) {
  db.prepare('INSERT INTO ticket_events (ticket_id, actor_id, actor_label, kind, text, created_at) VALUES (?,?,?,?,?,?)')
    .run(ticketId, actor ? actor.id : null, actor ? actor.name : 'Proceso programado', kind, text, at);
}

function enqueue(db, ticket, now = Date.now()) {
  if (!ticket.code && !ticket.trk) {
    db.prepare("UPDATE tickets SET enr_status='na' WHERE id=?").run(ticket.id);
    return false;
  }
  db.prepare("UPDATE enrichment_jobs SET status='cancelled', updated_at=? WHERE ticket_id=? AND status IN ('pending','running')").run(now, ticket.id);
  db.prepare('INSERT INTO enrichment_jobs (ticket_id, query_code, query_trk, next_at, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(ticket.id, ticket.code || null, ticket.trk || null, now, now, now);
  db.prepare("UPDATE tickets SET enr_status='buscando' WHERE id=?").run(ticket.id);
  return true;
}

// Registro de incidencia (operadores y administradores).
function createIncident(db, user, body, now = Date.now()) {
  const type = String(body.type || '');
  if (!TYPES[type]) fail(400, 'Elige un motivo válido.');
  const nolabel = !!body.nolabel;
  let code = null, trk = null;
  if (!nolabel) {
    if (body.code) { code = parseCode(body.code); if (!code) fail(400, 'El código debe ser MX-0000000, ES-0000000 o solo el número (ej. 4748635).'); }
    if (body.trk) { trk = String(body.trk).replace(/\s+/g, '').slice(0, 60); if (trk.length < 6) fail(400, 'La guía es muy corta.'); }
    if (!code && !trk) fail(400, 'Escanea una guía o teclea el código MX/ES.');
  } else if (type !== 'sinetiqueta' && type !== 'otro') fail(400, 'Un paquete sin etiqueta solo puede ser "Sin etiqueta" u "Otro".');
  const other = String(body.other_text || '').trim().slice(0, 300);
  const desc = String(body.description || '').trim().slice(0, 300);
  if (type === 'otro' && !other) fail(400, 'Especifica el motivo.');
  if (nolabel && !desc) fail(400, 'Describe el producto (no tiene código).');
  const plat = platOf(code);
  const damaged = type === 'danado';

  return tx(db, () => {
    // Anti-duplicado: mismo motivo y mismo código o guía con ticket abierto → se agrega al expediente.
    if (!nolabel) {
      const ex = db.prepare(`SELECT * FROM tickets WHERE type=? AND ${isOpenSql} AND (code IN (SELECT value FROM json_each(?)) OR (? IS NOT NULL AND trk=?)) ORDER BY id LIMIT 1`)
        .get(type, JSON.stringify(codeKeys(code)), trk, trk);
      if (ex) {
        event(db, ex.id, user, 'evento', `Evento adicional registrado${other ? ': ' + other : ''}${trk && trk !== ex.trk ? ' · guía ' + trk : ''}`, now);
        return { id: ex.id, folio: folio(ex.id), appended: true, status: ex.status };
      }
    }
    const status = damaged ? 'Enviado dañado' : 'Abierto';
    const r = db.prepare(`INSERT INTO tickets (code, trk, plat, nolabel, type, other_text, description, status, reporter_id, reporter_dept, location, created_at, due_at, damage_outcome)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, trk, plat, nolabel ? 1 : 0, type, other || null, desc || null, status, user.id,
      user.role === 'admin' ? user.dept : 'Operación', damaged ? 'Enviado con paquetería' : 'Mesa de incidencias', now, now + 3 * D, damaged ? 'Pendiente' : null);
    const id = Number(r.lastInsertRowid);
    event(db, id, user, 'registro', `Registró: ${TYPES[type]}${other ? ' · ' + other : ''}${desc ? ' · ' + desc : ''}`, now);
    if (damaged) event(db, id, user, 'estado', 'Re-empacado y enviado dañado; queda en seguimiento', now);
    enqueue(db, { id, code, trk }, now);
    return { id, folio: folio(id), appended: false, status };
  });
}

// Toma atómica: solo gana quien encuentra owner_id vacío.
function take(db, user, id, now = Date.now()) {
  need(user, 'take');
  return tx(db, () => {
    const t = getOpen(db, id);
    const r = db.prepare(`UPDATE tickets SET owner_id=?, status=CASE WHEN status='Abierto' THEN (CASE WHEN waiting_dept IS NULL THEN 'En gestión' ELSE 'Esperando respuesta' END) ELSE status END, version=version+1
      WHERE id=? AND owner_id IS NULL AND ${isOpenSql}`).run(user.id, id);
    if (r.changes === 0) {
      const owner = db.prepare('SELECT u.name FROM tickets t JOIN users u ON u.id=t.owner_id WHERE t.id=?').get(id);
      fail(409, owner ? `${owner.name} tomó este ticket un instante antes.` : 'No se pudo tomar el ticket.');
    }
    event(db, id, user, 'asignacion', 'Tomó el ticket', now);
    return t;
  });
}

function getOpen(db, id) {
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  if (!t) fail(404, 'No existe ese ticket.');
  if (CLOSED.includes(t.status)) fail(409, `El ticket está ${t.status.toLowerCase()}.`);
  return t;
}
function needManage(db, user, t) {
  if (t.owner_id === user.id) return;
  if (can(user, 'transfer')) return;
  fail(403, 'Solo el responsable o alguien con permiso de transferir puede hacer esto.');
}

function release(db, user, id, now = Date.now()) {
  return tx(db, () => {
    const t = getOpen(db, id); if (!t.owner_id) fail(409, 'El ticket no tiene responsable.');
    needManage(db, user, t);
    const prev = db.prepare('SELECT name FROM users WHERE id=?').get(t.owner_id).name;
    db.prepare(`UPDATE tickets SET owner_id=NULL, status=CASE WHEN status='En gestión' THEN 'Abierto' ELSE status END, version=version+1 WHERE id=?`).run(id);
    event(db, id, user, 'asignacion', `Liberó el ticket (responsable anterior: ${prev})`, now);
  });
}
function transfer(db, user, id, toId, now = Date.now()) {
  return tx(db, () => {
    const t = getOpen(db, id); needManage(db, user, t);
    const to = db.prepare("SELECT * FROM users WHERE id=? AND role='admin' AND active=1").get(toId);
    if (!to) fail(400, 'Elige a una persona de Procesamiento o Customer Service.');
    const prev = t.owner_id ? db.prepare('SELECT name FROM users WHERE id=?').get(t.owner_id).name : 'sin responsable';
    db.prepare(`UPDATE tickets SET owner_id=?, status=CASE WHEN status='Abierto' THEN 'En gestión' ELSE status END, version=version+1 WHERE id=?`).run(to.id, id);
    event(db, id, user, 'asignacion', `Transfirió de ${prev} a ${to.name}`, now);
  });
}
function setWaiting(db, user, id, dept, now = Date.now()) {
  return tx(db, () => {
    const t = getOpen(db, id); needManage(db, user, t);
    const d = dept ? String(dept) : null;
    if (d && !DEPTS.includes(d)) fail(400, 'Departamento no válido.');
    const st = d ? 'Esperando respuesta' : (t.owner_id ? 'En gestión' : 'Abierto');
    db.prepare('UPDATE tickets SET waiting_dept=?, status=CASE WHEN status=\'Dispose programado\' THEN status ELSE ? END, version=version+1 WHERE id=?').run(d, st, id);
    event(db, id, user, 'espera', d ? `Esperando respuesta de ${d}` : 'Ya no se espera respuesta de otro departamento', now);
  });
}
function setLocation(db, user, id, loc, now = Date.now()) {
  return tx(db, () => {
    const t = getOpen(db, id); needManage(db, user, t);
    const v = String(loc || '').trim().slice(0, 120);
    db.prepare('UPDATE tickets SET location=?, version=version+1 WHERE id=?').run(v || null, id);
    event(db, id, user, 'ubicacion', 'Ubicación física: ' + (v || 'sin registrar'), now);
  });
}
function addMessage(db, user, id, body, now = Date.now()) {
  needAdmin(user);
  const t = db.prepare('SELECT id FROM tickets WHERE id=?').get(id); if (!t) fail(404, 'No existe ese ticket.');
  const b = String(body || '').trim().slice(0, 4000); if (!b) fail(400, 'Escribe un mensaje.');
  // El campo "tag" se conserva para mensajes anteriores; los nuevos ya no llevan tipo.
  db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, tag, body, created_at) VALUES (?,?,?,?,?)').run(id, user.id, 'Mensaje', b, now);
  event(db, id, user, 'chat', 'Escribió en el chat', now);
}
function confirmDup(db, user, id, now = Date.now()) {
  need(user, 'confirmdup');
  return tx(db, () => {
    const t = getOpen(db, id);
    if (t.type !== 'duplicado') fail(400, 'Solo aplica a tickets de duplicado.');
    const r = db.prepare('UPDATE tickets SET dup_confirmed_by=?, dup_confirmed_at=?, dup_due_at=?, version=version+1 WHERE id=? AND dup_confirmed_at IS NULL')
      .run(user.id, now, now + 10 * D, id);
    if (!r.changes) fail(409, 'Ya estaba confirmado como duplicado.');
    event(db, id, user, 'duplicado', 'Confirmó mercancía duplicada · inicia plazo de 10 días', now);
  });
}
function resolve(db, user, id, text, now = Date.now()) {
  need(user, 'resolve');
  return tx(db, () => {
    const t = getOpen(db, id);
    if (t.owner_id !== user.id) fail(403, 'Toma el ticket para resolverlo.');
    if (t.status === 'Dispose programado') fail(409, 'Este ticket está en Dispose programado; confirma la disposición con evidencia.');
    const r = String(text || '').trim();
    if (r.length < 8) fail(400, 'Escribe la resolución final (qué se hizo y dónde quedó el paquete).');
    db.prepare("UPDATE tickets SET status='Resuelto', resolution=?, resolved_at=?, version=version+1 WHERE id=?").run(r.slice(0, 2000), now, id);
    event(db, id, user, 'resolucion', 'Resolvió: ' + r, now);
  });
}
// Resolución rápida desde la bandeja (un clic, sin texto). Si el ticket no tiene responsable, quien resuelve lo toma
// en la misma transacción. No pisa a otro responsable salvo con permiso de transferir. Queda en el historial.
const QUICK_TEXT = 'Resuelto desde la bandeja (resolución rápida)';
function quickResolve(db, user, id, now = Date.now()) {
  need(user, 'resolve');
  return tx(db, () => {
    const t = getOpen(db, id);
    if (t.status === 'Dispose programado') fail(409, 'Este ticket está en Dispose programado; confirma la disposición con evidencia.');
    if (t.owner_id && t.owner_id !== user.id && !can(user, 'transfer')) {
      const o = db.prepare('SELECT name FROM users WHERE id=?').get(t.owner_id);
      fail(403, `Lo tiene ${o ? o.name : 'otra persona'}; solo el responsable puede resolverlo.`);
    }
    // Condicionado al estado leído: si alguien lo tomó o cerró un instante antes, no se resuelve.
    const r = db.prepare(`UPDATE tickets SET status='Resuelto', owner_id=?, resolution=?, resolved_at=?, version=version+1
      WHERE id=? AND version=? AND ${isOpenSql}`).run(t.owner_id || user.id, QUICK_TEXT, now, id, t.version);
    if (!r.changes) fail(409, 'El ticket cambió hace un instante; vuelve a intentarlo.');
    if (!t.owner_id) event(db, id, user, 'asignacion', 'Tomó el ticket', now);
    else if (t.owner_id !== user.id) {
      const o = db.prepare('SELECT name FROM users WHERE id=?').get(t.owner_id);
      event(db, id, user, 'asignacion', `Resolvió un ticket de ${o ? o.name : 'otra persona'}`, now);
    }
    event(db, id, user, 'resolucion', 'Resolvió: ' + QUICK_TEXT, now);
    return { id, folio: folio(id), status: 'Resuelto' };
  });
}
// Quién resolvió: el último evento de resolución (no hay columna; se evita una migración).
function resolverOf(db, id) {
  const e = db.prepare("SELECT actor_id FROM ticket_events WHERE ticket_id=? AND kind='resolucion' ORDER BY created_at DESC, id DESC LIMIT 1").get(id);
  return e ? e.actor_id : null;
}
// Quién resolvió cada ticket de una lista, en una sola consulta (evita una consulta por fila en la bandeja).
function resolversOf(db, ids) {
  if (!ids.length) return {};
  const rows = db.prepare(`SELECT e.ticket_id, e.actor_id FROM ticket_events e WHERE e.kind='resolucion' AND e.ticket_id IN (SELECT value FROM json_each(?))
    AND e.id = (SELECT x.id FROM ticket_events x WHERE x.ticket_id=e.ticket_id AND x.kind='resolucion' ORDER BY x.created_at DESC, x.id DESC LIMIT 1)`).all(JSON.stringify(ids));
  return Object.fromEntries(rows.map(r => [r.ticket_id, r.actor_id]));
}
// Reabrir un ticket resuelto (p. ej. "Resuelto" pulsado por error). Puede quien lo resolvió o quien tiene permiso de restaurar.
// No borra nada: la resolución anterior queda en el historial.
function reopen(db, user, id, now = Date.now()) {
  needAdmin(user);
  return tx(db, () => {
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if (!t) fail(404, 'No existe ese ticket.');
    if (t.status !== 'Resuelto') fail(409, 'Solo se pueden reabrir tickets resueltos.');
    if (resolverOf(db, id) !== user.id && !can(user, 'restore')) fail(403, 'Solo quien lo resolvió o alguien con permiso de restaurar puede reabrirlo.');
    // Si el responsable fue dado de baja mientras estaba resuelto, el ticket vuelve sin responsable (nadie podría tomarlo).
    const owner = t.owner_id ? db.prepare('SELECT name, active FROM users WHERE id=?').get(t.owner_id) : null;
    const ownerId = owner && owner.active ? t.owner_id : null;
    const st = t.waiting_dept ? 'Esperando respuesta' : ownerId ? 'En gestión' : 'Abierto';
    const r = db.prepare("UPDATE tickets SET status=?, owner_id=?, resolution=NULL, resolved_at=NULL, version=version+1 WHERE id=? AND version=? AND status='Resuelto'").run(st, ownerId, id, t.version);
    if (!r.changes) fail(409, 'El ticket cambió hace un instante; vuelve a intentarlo.');
    if (owner && !ownerId) event(db, id, user, 'asignacion', `Ticket liberado: ${owner.name} está dado de baja`, now);
    event(db, id, user, 'resolucion', `Reabrió el ticket (resolución anterior: ${t.resolution || '—'})`, now);
    return { id, folio: folio(id), status: st };
  });
}
function disposeDone(db, user, id, evidenceId, now = Date.now()) {
  need(user, 'dispose');
  return tx(db, () => {
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if (!t || t.status !== 'Dispose programado') fail(409, 'El ticket no está en Dispose programado.');
    const ev = db.prepare('SELECT * FROM ticket_evidence WHERE id=? AND ticket_id=? AND created_at>=?').get(evidenceId, id, t.dispose_scheduled_at);
    if (!ev) fail(400, 'Sube la evidencia de la disposición antes de confirmarla.');
    db.prepare("UPDATE tickets SET status='Dispose realizado', dispose_done_at=?, version=version+1 WHERE id=?").run(now, id);
    event(db, id, user, 'dispose', 'Confirmó Dispose realizado con evidencia: ' + ev.file_name, now);
  });
}
function discard(db, user, id, reason, confirmed, now = Date.now()) {
  need(user, 'discard');
  if (!confirmed) fail(400, 'Falta la segunda confirmación.');
  const r = String(reason || '').trim(); if (r.length < 10) fail(400, 'La justificación es obligatoria (mínimo 10 caracteres).');
  return tx(db, () => {
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if (!t) fail(404, 'No existe ese ticket.');
    if (t.status === 'Descartado') fail(409, 'Ya está descartado.');
    db.prepare("UPDATE tickets SET status_before_discard=status, status='Descartado', discarded_by=?, discarded_at=?, discard_reason=?, version=version+1 WHERE id=?")
      .run(user.id, now, r.slice(0, 1000), id);
    event(db, id, user, 'descarte', 'Descartó la incidencia: ' + r, now);
  });
}
function restore(db, user, id, now = Date.now()) {
  need(user, 'restore');
  return tx(db, () => {
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if (!t || t.status !== 'Descartado') fail(409, 'El ticket no está descartado.');
    db.prepare('UPDATE tickets SET status=COALESCE(status_before_discard,\'Abierto\'), version=version+1 WHERE id=?').run(id);
    event(db, id, user, 'descarte', 'Restauró la incidencia descartada', now);
  });
}
function setDamageOutcome(db, user, id, outcome, by = null, now = Date.now()) {
  if (user) needAdmin(user);
  if (!DAMAGE_OUTCOMES.includes(outcome)) fail(400, 'Desenlace no válido.');
  const t = db.prepare("SELECT * FROM tickets WHERE id=? AND type='danado'").get(id);
  if (!t) fail(404, 'No es un envío dañado.');
  db.prepare('UPDATE tickets SET damage_outcome=?, version=version+1 WHERE id=?').run(outcome, id);
  event(db, id, user, 'danado', 'Desenlace del envío dañado: ' + outcome + (by ? ' · ' + by : ''), now);
}
function research(db, user, id, value, now = Date.now()) {
  needAdmin(user);
  const v = String(value || '').trim(); if (!v) fail(400, 'Escribe un MX/ES o una guía.');
  const c = parseCode(v);
  // En una sola transacción y con version+1: quien tenga el ticket abierto en otra pantalla detecta el cambio.
  return tx(db, () => {
    const t = db.prepare('SELECT id FROM tickets WHERE id=?').get(id); if (!t) fail(404, 'No existe ese ticket.');
    if (c) db.prepare('UPDATE tickets SET code=?, plat=?, version=version+1 WHERE id=?').run(c, platOf(c), id);
    else db.prepare('UPDATE tickets SET trk=?, version=version+1 WHERE id=?').run(v.replace(/\s+/g, '').slice(0, 60), id);
    event(db, id, user, 'agente', 'Pidió nueva búsqueda con ' + v, now);
    enqueue(db, db.prepare('SELECT * FROM tickets WHERE id=?').get(id), now);
  });
}

// ---------- Usuarios ----------
// Perfiles fijos para dar de alta sin tener que elegir permisos uno por uno.
const ALL_PERMS = Object.keys(PERMS);
const PROFILES = {
  operacion: { label: 'Operación (registra incidencias)', role: 'op', dept: 'Operación', title: 'Procesador(a) de paquetes', perms: [] },
  retornos: { label: 'Equipo de retornos (registra incidencias)', role: 'op', dept: 'Retornos', title: 'Equipo de retornos', perms: [] },
  cs: { label: 'Customer Service (panel: tomar, resolver, confirmar duplicado)', role: 'admin', dept: 'Customer Service', title: 'Customer Service', perms: ['take', 'resolve', 'confirmdup'] },
  procesamiento: { label: 'Procesamiento (panel: todo menos administrar usuarios)', role: 'admin', dept: 'Procesamiento', title: 'Resuelve incidencias', perms: ALL_PERMS.filter(p => p !== 'users') },
};
// Nombre comparable: sin acentos, sin mayúsculas ni espacios de más ("Josue" = "Josué").
const normName = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function findByName(db, name) { const k = normName(name); return db.prepare('SELECT * FROM users').all().find(u => normName(u.name) === k) || null; }

function createUser(db, actor, body, hashPin, newPin) {
  need(actor, 'users');
  const name = String(body.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 40) fail(400, 'Escribe el nombre (de 2 a 40 caracteres).');
  const pr = PROFILES[body.profile]; if (!pr) fail(400, 'Elige un perfil válido.');
  const ex = findByName(db, name);
  if (ex) fail(409, ex.active ? `Ya existe ${ex.name}.` : `${ex.name} ya existe pero está dado de baja. Usa "Reactivar".`);
  const pin = newPin();
  const r = db.prepare('INSERT INTO users (name, role, dept, title, perms, pin_hash) VALUES (?,?,?,?,?,?)')
    .run(name, pr.role, pr.dept, pr.title, JSON.stringify(pr.perms), hashPin(pin));
  return { id: Number(r.lastInsertRowid), name, pin };
}
// Baja lógica: el usuario no se borra (sus tickets e historial lo siguen nombrando), solo deja de poder entrar.
function setUserActive(db, actor, id, active) {
  need(actor, 'users');
  return tx(db, () => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!u) fail(404, 'No existe ese usuario.');
    if (!active && u.id === actor.id) fail(400, 'No puedes darte de baja a ti mismo.');
    db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, u.id);
    let released = 0;
    if (!active) {
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
      const owned = db.prepare(`SELECT id FROM tickets WHERE owner_id=? AND ${isOpenSql}`).all(u.id);
      for (const t of owned) {
        db.prepare(`UPDATE tickets SET owner_id=NULL, status=CASE WHEN status='En gestión' THEN 'Abierto' ELSE status END, version=version+1 WHERE id=?`).run(t.id);
        event(db, t.id, actor, 'asignacion', `Ticket liberado: ${u.name} fue dado de baja`);
        released++;
      }
    }
    return { name: u.name, active: !!active, released };
  });
}

// Proceso programado de plazos. Idempotente: cada cambio está condicionado a que no se haya hecho antes.
function runDeadlines(db, now = Date.now()) {
  let changes = 0;
  tx(db, () => {
    const late = db.prepare(`SELECT id, due_at FROM tickets WHERE ${isOpenSql} AND dup_confirmed_at IS NULL AND status<>'Dispose programado' AND late_flagged_at IS NULL AND due_at < ?`).all(now);
    for (const t of late) {
      const r = db.prepare('UPDATE tickets SET late_flagged_at=? WHERE id=? AND late_flagged_at IS NULL').run(now, t.id);
      if (r.changes) { event(db, t.id, null, 'plazo', 'Plazo de 3 días vencido · el ticket sigue abierto y se registra el retraso', t.due_at); changes++; }
    }
    const dups = db.prepare(`SELECT id, dup_due_at FROM tickets WHERE ${isOpenSql} AND dup_due_at IS NOT NULL AND dup_due_at <= ? AND dispose_scheduled_at IS NULL`).all(now);
    for (const t of dups) {
      const r = db.prepare("UPDATE tickets SET status='Dispose programado', dispose_scheduled_at=?, version=version+1 WHERE id=? AND dispose_scheduled_at IS NULL").run(t.dup_due_at, t.id);
      if (r.changes) { event(db, t.id, null, 'plazo', '10 días sin resolución → Dispose programado', t.dup_due_at); changes++; }
    }
    db.prepare('INSERT INTO job_runs (job, at, changes) VALUES (?,?,?)').run('plazos', now, changes);
  });
  return changes;
}

module.exports = { TYPES, PERMS, DEPTS, MSG_TAGS, DAMAGE_OUTCOMES, CLOSED, RETRY_MIN, HttpError, fail, normCode, parseCode, isBare, platOf, codeKeys, folio, isOpenSql,
  permsOf, can, need, needAdmin, event, enqueue, createIncident, take, release, transfer, setWaiting, setLocation, addMessage,
  confirmDup, resolve, quickResolve, QUICK_TEXT, reopen, resolverOf, resolversOf, disposeDone, discard, restore, setDamageOutcome, research, runDeadlines,
  PROFILES, normName, findByName, createUser, setUserActive, H, D };
