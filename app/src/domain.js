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
  restore: 'Restaurar descartada',
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
    if (body.code) { code = normCode(body.code); if (!code) fail(400, 'El código debe ser MX-0000000 o ES-000000.'); }
    if (body.trk) { trk = String(body.trk).replace(/\s+/g, '').slice(0, 60); if (trk.length < 6) fail(400, 'La guía es muy corta.'); }
    if (!code && !trk) fail(400, 'Escanea una guía o teclea el código MX/ES.');
  } else if (type !== 'sinetiqueta' && type !== 'otro') fail(400, 'Un paquete sin etiqueta solo puede ser "Sin etiqueta" u "Otro".');
  const other = String(body.other_text || '').trim().slice(0, 300);
  const desc = String(body.description || '').trim().slice(0, 300);
  if (type === 'otro' && !other) fail(400, 'Especifica el motivo.');
  if (nolabel && !desc) fail(400, 'Describe el producto (no tiene código).');
  const plat = code ? code.slice(0, 2) : null;
  const damaged = type === 'danado';

  return tx(db, () => {
    // Anti-duplicado: mismo motivo y mismo código o guía con ticket abierto → se agrega al expediente.
    if (!nolabel) {
      const ex = db.prepare(`SELECT * FROM tickets WHERE type=? AND ${isOpenSql} AND ((? IS NOT NULL AND code=?) OR (? IS NOT NULL AND trk=?)) ORDER BY id LIMIT 1`)
        .get(type, code, code, trk, trk);
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

function release(db, user, id) {
  return tx(db, () => {
    const t = getOpen(db, id); if (!t.owner_id) fail(409, 'El ticket no tiene responsable.');
    needManage(db, user, t);
    const prev = db.prepare('SELECT name FROM users WHERE id=?').get(t.owner_id).name;
    db.prepare(`UPDATE tickets SET owner_id=NULL, status=CASE WHEN status='En gestión' THEN 'Abierto' ELSE status END, version=version+1 WHERE id=?`).run(id);
    event(db, id, user, 'asignacion', `Liberó el ticket (responsable anterior: ${prev})`);
  });
}
function transfer(db, user, id, toId) {
  return tx(db, () => {
    const t = getOpen(db, id); needManage(db, user, t);
    const to = db.prepare("SELECT * FROM users WHERE id=? AND role='admin' AND active=1").get(toId);
    if (!to) fail(400, 'Elige a una persona de Procesamiento o Customer Service.');
    const prev = t.owner_id ? db.prepare('SELECT name FROM users WHERE id=?').get(t.owner_id).name : 'sin responsable';
    db.prepare(`UPDATE tickets SET owner_id=?, status=CASE WHEN status='Abierto' THEN 'En gestión' ELSE status END, version=version+1 WHERE id=?`).run(to.id, id);
    event(db, id, user, 'asignacion', `Transfirió de ${prev} a ${to.name}`);
  });
}
function setWaiting(db, user, id, dept) {
  return tx(db, () => {
    const t = getOpen(db, id); needManage(db, user, t);
    const d = dept ? String(dept) : null;
    if (d && !DEPTS.includes(d)) fail(400, 'Departamento no válido.');
    const st = d ? 'Esperando respuesta' : (t.owner_id ? 'En gestión' : 'Abierto');
    db.prepare('UPDATE tickets SET waiting_dept=?, status=CASE WHEN status=\'Dispose programado\' THEN status ELSE ? END, version=version+1 WHERE id=?').run(d, st, id);
    event(db, id, user, 'espera', d ? `Esperando respuesta de ${d}` : 'Ya no se espera respuesta de otro departamento');
  });
}
function setLocation(db, user, id, loc) {
  return tx(db, () => {
    const t = getOpen(db, id); needManage(db, user, t);
    const v = String(loc || '').trim().slice(0, 120);
    db.prepare('UPDATE tickets SET location=?, version=version+1 WHERE id=?').run(v || null, id);
    event(db, id, user, 'ubicacion', 'Ubicación física: ' + (v || 'sin registrar'));
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
function restore(db, user, id) {
  need(user, 'restore');
  return tx(db, () => {
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
    if (!t || t.status !== 'Descartado') fail(409, 'El ticket no está descartado.');
    db.prepare('UPDATE tickets SET status=COALESCE(status_before_discard,\'Abierto\'), version=version+1 WHERE id=?').run(id);
    event(db, id, user, 'descarte', 'Restauró la incidencia descartada');
  });
}
function setDamageOutcome(db, user, id, outcome, by = null) {
  if (user) needAdmin(user);
  if (!DAMAGE_OUTCOMES.includes(outcome)) fail(400, 'Desenlace no válido.');
  const t = db.prepare("SELECT * FROM tickets WHERE id=? AND type='danado'").get(id);
  if (!t) fail(404, 'No es un envío dañado.');
  db.prepare('UPDATE tickets SET damage_outcome=?, version=version+1 WHERE id=?').run(outcome, id);
  event(db, id, user, 'danado', 'Desenlace del envío dañado: ' + outcome + (by ? ' · ' + by : ''));
}
function research(db, user, id, value) {
  needAdmin(user);
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if (!t) fail(404, 'No existe ese ticket.');
  const v = String(value || '').trim(); if (!v) fail(400, 'Escribe un MX/ES o una guía.');
  const c = normCode(v);
  if (c) db.prepare('UPDATE tickets SET code=?, plat=? WHERE id=?').run(c, c.slice(0, 2), id);
  else db.prepare('UPDATE tickets SET trk=? WHERE id=?').run(v.replace(/\s+/g, '').slice(0, 60), id);
  event(db, id, user, 'agente', 'Pidió nueva búsqueda con ' + v);
  enqueue(db, db.prepare('SELECT * FROM tickets WHERE id=?').get(id));
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

module.exports = { TYPES, PERMS, DEPTS, MSG_TAGS, DAMAGE_OUTCOMES, CLOSED, RETRY_MIN, HttpError, fail, normCode, folio, isOpenSql,
  permsOf, can, need, needAdmin, event, enqueue, createIncident, take, release, transfer, setWaiting, setLocation, addMessage,
  confirmDup, resolve, disposeDone, discard, restore, setDamageOutcome, research, runDeadlines, H, D };
