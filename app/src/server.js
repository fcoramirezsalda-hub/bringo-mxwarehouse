// Servidor del MVP. Uso: npm start   (puerto 8080 por defecto, accesible en la red de la bodega)
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { open, backup, DATA_DIR, BACKUP_DIR, H, D } = require('./db');
const dm = require('./domain');

// Limpieza: sesiones vencidas e intentos fallidos viejos (más de un día).
function purgeSessions(db, t = Date.now()) {
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(t);
  db.prepare('DELETE FROM login_failures WHERE last_at<?').run(t - D);
}

function createApp(db, opts = {}) {
  const app = express();
  const now = opts.now || (() => Date.now());
  const EVID_DIR = opts.evidenceDir || path.join(DATA_DIR, 'evidencias');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12mb' }));
  app.use((err, req, res, next) => { if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) return res.status(err.type === 'entity.too.large' ? 413 : 400).json({ error: err.type === 'entity.too.large' ? 'El archivo es demasiado grande.' : 'Solicitud no válida.' }); next(err); });
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('X-Frame-Options', 'DENY'); next(); });

  // ---------- Sesión ----------
  const { hashPin, checkPin, newPin } = require('./pin');
  // Una cookie mal codificada (de otro programa en la misma PC o IP) no debe tumbar la sesión: se deja sin decodificar.
  const dec = v => { try { return decodeURIComponent(v); } catch { return v; } };
  const cookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, dec(v.join('='))]));

  function auth(req, res, next) {
    const tok = cookie(req).sid;
    const s = tok && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>? AND u.active=1').get(tok, now());
    if (!s) return res.status(401).json({ error: 'Inicia sesión.' });
    req.user = s; next();
  }
  const wrap = fn => (req, res) => {
    try { const r = fn(req, res); if (!res.headersSent) res.json(r === undefined ? { ok: true } : r); }
    catch (e) { if (e instanceof dm.HttpError) res.status(e.status).json({ error: e.message }); else { console.error(e); res.status(500).json({ error: 'Error interno. Revisa la consola del servidor.' }); } }
  };

  const VERSION = require('../package.json').version;
  app.get('/api/version', (req, res) => res.json({ version: VERSION }));
  app.get('/api/login-users', (req, res) => res.json(db.prepare('SELECT name, role FROM users WHERE active=1 ORDER BY role DESC, id').all()));
  app.post('/api/login', wrap((req, res) => {
    const name = String(req.body.name || ''), pin = String(req.body.pin || '');
    const f = db.prepare('SELECT * FROM login_failures WHERE name=?').get(name);
    if (f && f.count >= 5 && now() - f.last_at < 60e3) dm.fail(429, 'Demasiados intentos. Espera un minuto.');
    const u = db.prepare('SELECT * FROM users WHERE name=? AND active=1').get(name);
    if (!u || !checkPin(pin, u.pin_hash)) {
      // Solo se cuentan intentos de usuarios que existen: nombres inventados no llenan la tabla.
      if (u) db.prepare('INSERT INTO login_failures (name, count, last_at) VALUES (?,1,?) ON CONFLICT(name) DO UPDATE SET count=count+1, last_at=excluded.last_at').run(name, now());
      dm.fail(401, 'Usuario o PIN incorrecto.');
    }
    db.prepare('DELETE FROM login_failures WHERE name=?').run(name);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(token, u.id, now(), now() + 14 * H);
    res.set('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${14 * 3600}`);
    return me(u);
  }));
  app.post('/api/logout', (req, res) => { const t = cookie(req).sid; if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t); res.set('Set-Cookie', 'sid=; Path=/; Max-Age=0'); res.json({ ok: true }); });

  const me = u => ({ id: u.id, name: u.name, role: u.role, dept: u.dept, title: u.title, perms: dm.permsOf(u) });
  app.use('/api', auth);
  const returns = require('./returns').mountReturns(app, db, opts, now);
  const rscan = require('./retornos-escaneo').mount(app, db, opts, now);
  app.get('/api/me', wrap(req => ({ ...me(req.user), returns_mode: returns.mode, returns_scan: rscan.enabled, types: dm.TYPES, perms_catalog: dm.PERMS, depts: dm.DEPTS, tags: dm.MSG_TAGS, outcomes: dm.DAMAGE_OUTCOMES })));

  // ---------- Serialización ----------
  const names = () => Object.fromEntries(db.prepare('SELECT id, name FROM users').all().map(u => [u.id, u.name]));
  function row(t, N = names(), R = null) {
    const due = t.dup_due_at || t.due_at;
    return { id: t.id, folio: dm.folio(t.id), code: t.code, trk: t.trk, plat: t.plat, nolabel: !!t.nolabel, type: t.type, type_label: dm.TYPES[t.type],
      other_text: t.other_text, description: t.description, status: t.status, open: !dm.CLOSED.includes(t.status),
      reporter: N[t.reporter_id], reporter_dept: t.reporter_dept, owner: t.owner_id ? N[t.owner_id] : null, owner_id: t.owner_id,
      waiting_dept: t.waiting_dept, location: t.location, created_at: t.created_at, due_at: due, late: !!t.late_flagged_at,
      dup_confirmed_by: t.dup_confirmed_by ? N[t.dup_confirmed_by] : null, dup_confirmed_at: t.dup_confirmed_at, dup_due_at: t.dup_due_at,
      resolution: t.resolution, resolved_at: t.resolved_at, discarded_by: t.discarded_by ? N[t.discarded_by] : null, discarded_at: t.discarded_at,
      discard_reason: t.discard_reason, dispose_scheduled_at: t.dispose_scheduled_at, dispose_done_at: t.dispose_done_at,
      resolved_by_id: t.status === 'Resuelto' ? (R ? R[t.id] ?? null : dm.resolverOf(db, t.id)) : null,
      damage_outcome: t.damage_outcome, enr_status: t.enr_status, enr_source: t.enr_source, enr_data: t.enr_data ? JSON.parse(t.enr_data) : null, enr_at: t.enr_at, version: t.version };
  }

  // Lista de tickets: quién resolvió cada uno se trae en una sola consulta.
  const rows = (list, N = names()) => { const R = dm.resolversOf(db, list.filter(t => t.status === 'Resuelto').map(t => t.id)); return list.map(t => row(t, N, R)); };

  // ---------- Registro (operadores y admins) ----------
  app.post('/api/incidents', wrap(req => dm.createIncident(db, req.user, req.body, now())));
  app.get('/api/incidents/check', wrap(req => {
    const code = dm.parseCode(req.query.code), trk = req.query.trk ? String(req.query.trk).replace(/\s+/g, '') : null;
    if (!code && !trk) return [];
    return db.prepare(`SELECT id, type, owner_id FROM tickets WHERE ${dm.isOpenSql} AND (code IN (SELECT value FROM json_each(?)) OR (? IS NOT NULL AND trk=?))`).all(JSON.stringify(dm.codeKeys(code)), trk, trk)
      .map(t => ({ folio: dm.folio(t.id), type_label: dm.TYPES[t.type], has_owner: !!t.owner_id }));
  }));
  app.get('/api/my-reports', wrap(req => {
    const N = names();
    return db.prepare("SELECT * FROM tickets WHERE reporter_id=? AND status<>'Descartado' ORDER BY id DESC LIMIT 200").all(req.user.id)
      .map(t => { const r = row(t, N); return { folio: r.folio, code: r.code, trk: r.trk, type_label: r.type_label, created_at: r.created_at, owner: r.owner, status: r.status }; });
  }));

  // ---------- Panel administrativo ----------
  app.get('/api/tickets', wrap(req => {
    dm.needAdmin(req.user);
    const q = req.query, w = ["status<>'Descartado'"], p = [];
    // Búsqueda por código MX/ES (con o sin prefijo) o guía. Busca en todos los estados: ignora los filtros.
    const s = String(q.q || '').trim().replace(/\s+/g, '').slice(0, 80);
    if (s) {
      if (s.length < 4) dm.fail(400, 'Escribe al menos 4 caracteres del código o la guía.');
      const code = dm.parseCode(s), like = '%' + s.replace(/[\\%_]/g, c => '\\' + c) + '%';
      w.push(`(code IN (SELECT value FROM json_each(?)) OR code LIKE ? ESCAPE '\\' OR trk LIKE ? ESCAPE '\\' OR (length(trk)>=8 AND instr(?, trk)>0))`);
      p.push(JSON.stringify(code ? dm.codeKeys(code) : []), like, like, s);
      const N = names();
      const list = db.prepare(`SELECT * FROM tickets WHERE ${w.join(' AND ')} ORDER BY CASE WHEN ${dm.isOpenSql} THEN 0 ELSE 1 END, id DESC LIMIT 100`).all(...p);
      return rows(list, N);
    }
    if (q.status === 'abiertos') w.push(dm.isOpenSql);
    else if (q.status === 'sin') w.push(dm.isOpenSql, 'owner_id IS NULL');
    else if (q.status === 'mios') { w.push('owner_id=?'); p.push(req.user.id); }
    else if (q.status === 'espera') w.push("status='Esperando respuesta'");
    else if (q.status === 'dispose') w.push("status='Dispose programado'");
    else if (q.status === 'resueltos') w.push("status='Resuelto'");
    else if (q.status === 'cerrados') w.push('NOT ' + dm.isOpenSql);
    if (q.type && dm.TYPES[q.type]) { w.push('type=?'); p.push(q.type); }
    if (q.plat === 'MX' || q.plat === 'ES') { w.push('plat=?'); p.push(q.plat); }
    if (q.owner === 'sin') w.push('owner_id IS NULL'); else if (q.owner && /^\d+$/.test(q.owner)) { w.push('owner_id=?'); p.push(Number(q.owner)); }
    const t = now();
    if (q.due === 'late') { w.push(dm.isOpenSql, "status<>'Dispose programado'", 'COALESCE(dup_due_at,due_at)<?'); p.push(t); }
    if (q.due === 'soon') { w.push(dm.isOpenSql, 'COALESCE(dup_due_at,due_at) BETWEEN ? AND ?'); p.push(t, t + D); }
    if (q.enr && ['buscando', 'lista', 'sin', 'error', 'na'].includes(q.enr)) { w.push('enr_status=?'); p.push(q.enr); }
    const N = names();
    return rows(db.prepare(`SELECT * FROM tickets WHERE ${w.join(' AND ')} ORDER BY CASE WHEN ${dm.isOpenSql} THEN 0 ELSE 1 END, COALESCE(dup_due_at,due_at) LIMIT 500`).all(...p), N);
  }));
  app.get('/api/tickets/:id', wrap(req => {
    dm.needAdmin(req.user);
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id); if (!t) dm.fail(404, 'No existe ese ticket.');
    const N = names();
    return { ...row(t, N),
      events: db.prepare('SELECT actor_label AS who, kind, text, created_at FROM ticket_events WHERE ticket_id=? ORDER BY created_at DESC, id DESC').all(t.id),
      messages: db.prepare('SELECT m.id, u.name AS who, m.tag, m.body, m.created_at FROM ticket_messages m JOIN users u ON u.id=m.author_id WHERE ticket_id=? ORDER BY m.id').all(t.id),
      evidence: db.prepare('SELECT e.id, e.file_name, e.mime, e.purpose, u.name AS who, e.created_at FROM ticket_evidence e JOIN users u ON u.id=e.uploaded_by WHERE ticket_id=? ORDER BY e.id').all(t.id) };
  }));
  const act = (p, fn) => app.post('/api/tickets/:id/' + p, wrap(req => { fn(req, Number(req.params.id)); }));
  act('take', (req, id) => dm.take(db, req.user, id, now()));
  act('release', (req, id) => dm.release(db, req.user, id, now()));
  act('transfer', (req, id) => dm.transfer(db, req.user, id, Number(req.body.to), now()));
  act('waiting', (req, id) => dm.setWaiting(db, req.user, id, req.body.dept, now()));
  act('location', (req, id) => dm.setLocation(db, req.user, id, req.body.location, now()));
  act('confirm-dup', (req, id) => dm.confirmDup(db, req.user, id, now()));
  act('resolve', (req, id) => dm.resolve(db, req.user, id, req.body.resolution, now()));
  app.post('/api/tickets/:id/reopen', wrap(req => dm.reopen(db, req.user, Number(req.params.id), now())));
  app.post('/api/tickets/:id/quick-resolve', wrap(req => dm.quickResolve(db, req.user, Number(req.params.id), now())));
  act('dispose-done', (req, id) => dm.disposeDone(db, req.user, id, Number(req.body.evidence_id), now()));
  act('discard', (req, id) => dm.discard(db, req.user, id, req.body.reason, req.body.confirm === true, now()));
  act('restore', (req, id) => dm.restore(db, req.user, id, now()));
  act('damage-outcome', (req, id) => dm.setDamageOutcome(db, req.user, id, req.body.outcome, null, now()));
  act('research', (req, id) => dm.research(db, req.user, id, req.body.value, now()));

  // Evidencias: se guardan en disco, nunca se borran desde la aplicación.
  const MIMES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
  function saveEvidence(user, id, file, purpose, label) {
    const m = String((file && file.data) || '').match(/^data:([\w/+.-]+);base64,(.+)$/); if (!m || !MIMES[m[1]]) dm.fail(400, 'Sube una foto (JPG, PNG, WEBP) o PDF.');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 8e6) dm.fail(400, 'El archivo pasa de 8 MB.');
    const stored = crypto.randomBytes(12).toString('hex') + MIMES[m[1]];
    fs.mkdirSync(path.join(EVID_DIR, String(id)), { recursive: true });
    fs.writeFileSync(path.join(EVID_DIR, String(id), stored), buf, { flag: 'wx' });
    const name = String(file.name || 'foto').replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '').slice(0, 80) || 'foto';
    const r = db.prepare('INSERT INTO ticket_evidence (ticket_id, file_name, stored_as, mime, purpose, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, name, stored, m[1], purpose === 'dispose' ? 'dispose' : 'general', user.id, now());
    dm.event(db, id, user, 'evidencia', label + ': ' + name);
    return Number(r.lastInsertRowid);
  }
  const ticketOr404 = id => { const t = db.prepare('SELECT id FROM tickets WHERE id=?').get(id); if (!t) dm.fail(404, 'No existe ese ticket.'); return t; };
  // Chat: texto, foto o ambos en un solo envío. La foto queda como evidencia del expediente.
  app.post('/api/tickets/:id/messages', wrap(req => {
    dm.needAdmin(req.user);
    const id = Number(req.params.id); ticketOr404(id);
    const body = String(req.body.body || '').trim(), photo = req.body.photo;
    if (!body && !photo) dm.fail(400, 'Escribe un mensaje o adjunta una foto.');
    const evidence_id = photo ? saveEvidence(req.user, id, photo, 'general', 'Envió una foto en el chat') : null;
    if (body) dm.addMessage(db, req.user, id, body, now());
    return { ok: true, evidence_id };
  }));
  // Evidencia sin mensaje (la usa la confirmación de Dispose).
  app.post('/api/tickets/:id/evidence', wrap(req => {
    dm.needAdmin(req.user);
    const id = Number(req.params.id); ticketOr404(id);
    return { id: saveEvidence(req.user, id, { name: req.body.name, data: req.body.data }, req.body.purpose, req.body.purpose === 'dispose' ? 'Subió evidencia de disposición' : 'Agregó evidencia') };
  }));
  app.get('/api/evidence/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).end();
    const e = db.prepare('SELECT * FROM ticket_evidence WHERE id=?').get(req.params.id); if (!e) return res.status(404).end();
    res.type(e.mime); res.sendFile(path.join(EVID_DIR, String(e.ticket_id), e.stored_as));
  });

  // Vistas especiales
  app.get('/api/duplicates', wrap(req => { dm.needAdmin(req.user); const N = names();
    return rows(db.prepare("SELECT * FROM tickets WHERE type='duplicado' AND status<>'Descartado' ORDER BY COALESCE(dup_due_at, due_at)").all(), N); }));
  app.get('/api/damaged', wrap(req => { dm.needAdmin(req.user); const N = names();
    return db.prepare("SELECT * FROM tickets WHERE type='danado' AND status='Enviado dañado' ORDER BY id DESC LIMIT 500").all().map(t => row(t, N)); }));
  app.get('/api/discarded', wrap(req => { dm.needAdmin(req.user); const N = names();
    return rows(db.prepare("SELECT * FROM tickets WHERE status='Descartado' ORDER BY discarded_at DESC").all(), N); }));
  app.get('/api/stats', wrap(req => {
    dm.needAdmin(req.user);
    const t = now(), day = new Date(t); day.setHours(0, 0, 0, 0);
    const one = (sql, ...p) => db.prepare(sql).get(...p).n;
    return {
      today: db.prepare('SELECT type, COUNT(*) n FROM tickets WHERE created_at>=? GROUP BY type').all(day.getTime()),
      open: one(`SELECT COUNT(*) n FROM tickets WHERE ${dm.isOpenSql}`),
      unassigned: one(`SELECT COUNT(*) n FROM tickets WHERE ${dm.isOpenSql} AND owner_id IS NULL`),
      late: one(`SELECT COUNT(*) n FROM tickets WHERE ${dm.isOpenSql} AND status<>'Dispose programado' AND COALESCE(dup_due_at,due_at)<?`, t),
      soon: one(`SELECT COUNT(*) n FROM tickets WHERE ${dm.isOpenSql} AND COALESCE(dup_due_at,due_at) BETWEEN ? AND ?`, t, t + D),
      dispose: one("SELECT COUNT(*) n FROM tickets WHERE status='Dispose programado'"),
      by_reporter: db.prepare('SELECT u.name, COUNT(*) n FROM tickets t JOIN users u ON u.id=t.reporter_id WHERE t.created_at>=? GROUP BY u.name ORDER BY n DESC').all(day.getTime()),
      last_job: db.prepare('SELECT at, changes FROM job_runs ORDER BY id DESC LIMIT 1').get() || null };
  }));
  app.get('/api/agent-status', wrap(() => {
    const hb = db.prepare('SELECT * FROM agent_heartbeat WHERE id=1').get();
    const q = db.prepare("SELECT COUNT(*) n FROM enrichment_jobs WHERE status IN ('pending','running')").get().n;
    return { online: !!hb && now() - hb.at < 90e3, last_seen: hb ? hb.at : null, note: hb ? hb.note : null, queue: q };
  }));
  app.get('/api/sheets-status', wrap(req => { dm.needAdmin(req.user); return require('./sheets-sync').status(db); }));
  app.get('/api/users', wrap(req => { dm.needAdmin(req.user);
    return db.prepare('SELECT id, name, role, dept, title, perms, active FROM users ORDER BY role DESC, id').all().map(u => ({ ...u, perms: JSON.parse(u.perms) })); }));
  app.get('/api/user-profiles', wrap(req => { dm.need(req.user, 'users'); return Object.entries(dm.PROFILES).map(([id, p]) => ({ id, label: p.label })); }));
  app.post('/api/users', wrap(req => dm.createUser(db, req.user, req.body || {}, hashPin, newPin)));
  app.post('/api/users/:id/active', wrap(req => {
    const a = (req.body || {}).active; if (typeof a !== 'boolean') dm.fail(400, 'Indica si la persona queda activa (true o false).');
    return dm.setUserActive(db, req.user, Number(req.params.id), a);
  }));
  app.post('/api/users/:id/pin', wrap(req => {
    dm.need(req.user, 'users');
    const u = db.prepare('SELECT id, name FROM users WHERE id=?').get(req.params.id); if (!u) dm.fail(404, 'No existe ese usuario.');
    const pin = newPin();
    db.prepare('UPDATE users SET pin_hash=? WHERE id=?').run(hashPin(pin), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    return { name: u.name, pin };
  }));

  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', setHeaders: r => r.set('Cache-Control', 'no-cache') }));
  return app;
}

if (require.main === module) {
  const db = open();
  if (!db.prepare('SELECT COUNT(*) n FROM users').get().n) { console.error('No hay usuarios. Corre primero: npm run setup'); process.exit(1); }
  const app = createApp(db);
  const port = Number(process.env.PORT || 8080);
  const server = app.listen(port, '0.0.0.0', () => {
    // Los procesos de fondo arrancan solo si este servidor quedó escuchando (evita dos copias trabajando a la vez).
    const plazos = () => { try { dm.runDeadlines(db); purgeSessions(db); } catch (e) { console.error('Plazos:', e.message); } };
    setInterval(plazos, 60e3); plazos();
    // Respaldo automático al arrancar y cada 6 horas (últimos 30) en la carpeta "respaldos".
    const respaldo = () => { try { backup(db); } catch (e) { console.error('Respaldo:', e.message); } };
    respaldo(); setInterval(respaldo, 6 * H);
    require('./sheets-sync').start(db);
    if (require('./retornos-escaneo').enabled()) require('./retornos-escaneo').start(db);
    const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`MX Wharehouse · incidencias en http://localhost:${port}`);
    console.log(`  Datos: ${DATA_DIR}  ·  Respaldos: ${BACKUP_DIR}`);
    ips.forEach(ip => console.log(`  En la red de la bodega: http://${ip}:${port}`));
  });
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\nYa hay un servidor de MX Wharehouse (u otro programa) usando el puerto ${port}.`);
      console.error('Si acabas de cambiar la configuración, detén el anterior:  netstat -ano | findstr :' + port + '   y luego   taskkill /PID <número> /F');
    } else console.error('No se pudo iniciar el servidor: ' + e.message);
    process.exit(1);
  });
}

module.exports = { createApp, purgeSessions };
