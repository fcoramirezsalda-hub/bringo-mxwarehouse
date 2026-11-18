// Escaneo de retornos en MX Wharehouse (ADR-002). La base local es la principal; la hoja "Escaneo de Retornos" es el espejo.
// - Detección de paquetería con guias.js (port del Apps Script actual).
// - Acomodo: 10 racks; cada paquetería se asigna a un rack (lo configura un admin).
// - Copia a la hoja: Apps Script NUEVO e independiente (integraciones/google-sheets/Retornos.gs). No toca el script actual.
//   Escribe solo A, B, C, E, F, H y J (Rack) de Registro: D, G e I son fórmulas que se extienden y no se tocan.
// - De la hoja se leen catálogo, referencias, reglas y las guías ya registradas (para no duplicar).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DATA_DIR, tx } = require('./db');
const dm = require('./domain');
const G = require('./guias');

const CFG_FILE = path.join(DATA_DIR, 'retornos.json');
const RACKS = 10;
// Propuesta inicial por volumen (Modelo ML de la hoja, 2026-11-17). Se cambia en la pantalla de racks.
const DEFAULT_ASSIGN = { 'PaqueteExpress': 1, 'FedEx': 2, 'Estafeta': 3, 'DHL': 4, 'J&T': 5, 'iMile': 6, 'UPS': 7,
  'Correos de Mexico': 8, 'Castores': 8, 'Afimex': 8, 'Cliente / RMA': 9, [G.UNKNOWN]: 10 };

function ensureTables(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS racks (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS rack_assign (carrier TEXT PRIMARY KEY, rack_id INTEGER NOT NULL REFERENCES racks(id));
CREATE TABLE IF NOT EXISTS return_scans (
  id INTEGER PRIMARY KEY,
  guide_raw TEXT NOT NULL,
  guide TEXT NOT NULL,
  dup_key TEXT NOT NULL UNIQUE,
  carrier TEXT NOT NULL,
  method TEXT NOT NULL,
  rack_id INTEGER REFERENCES racks(id),
  notes TEXT,
  operator_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'registrado',      -- registrado | anulado
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sheet_status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | enviado | duplicado | error
  sheet_update INTEGER NOT NULL DEFAULT 0,        -- 1 = ya existe en la hoja y hay que actualizar C/H/J
  sheet_row INTEGER,
  sheet_error TEXT,
  sheet_at INTEGER
);
CREATE INDEX IF NOT EXISTS return_scans_sheet ON return_scans(sheet_status);
CREATE INDEX IF NOT EXISTS return_scans_created ON return_scans(created_at);
CREATE TABLE IF NOT EXISTS return_events (id INTEGER PRIMARY KEY, scan_id INTEGER NOT NULL REFERENCES return_scans(id), actor_id INTEGER REFERENCES users(id),
  actor_label TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guide_refs (kind TEXT NOT NULL, guide TEXT NOT NULL, carrier TEXT NOT NULL, source TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, guide, carrier));                -- kind: catalog | ref
CREATE TABLE IF NOT EXISTS guide_rules (ord INTEGER PRIMARY KEY, carrier TEXT NOT NULL, pattern TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sheet_registro (dup_key TEXT PRIMARY KEY, guide TEXT NOT NULL, carrier TEXT, row INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS returns_state (k TEXT PRIMARY KEY, v TEXT);
`);
  if (!db.prepare('SELECT COUNT(*) n FROM racks').get().n) tx(db, () => {
    const ins = db.prepare('INSERT INTO racks (code, name) VALUES (?,?)');
    for (let i = 1; i <= RACKS; i++) ins.run('R' + String(i).padStart(2, '0'), 'Rack ' + i);
    const asg = db.prepare('INSERT INTO rack_assign (carrier, rack_id) VALUES (?, (SELECT id FROM racks WHERE code=?))');
    for (const [c, n] of Object.entries(DEFAULT_ASSIGN)) asg.run(c, 'R' + String(n).padStart(2, '0'));
  });
}

const getState = (db, k) => (db.prepare('SELECT v FROM returns_state WHERE k=?').get(k) || {}).v;
const setState = (db, k, v) => db.prepare('INSERT INTO returns_state (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, v == null ? null : String(v));

function loadConfig() {
  if (process.env.RETORNOS_SHEET_URL && process.env.RETORNOS_SHEET_TOKEN) return { url: process.env.RETORNOS_SHEET_URL, token: process.env.RETORNOS_SHEET_TOKEN };
  try { const c = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); return c.url && c.token ? c : null; } catch { return null; }
}
function enabled(opts = {}) {
  if (opts.returnsScan !== undefined) return !!opts.returnsScan;
  if (process.env.RETURNS_SCAN) return process.env.RETURNS_SCAN === 'on';
  try { return !!JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')).enabled; } catch { return false; }
}

// ---------- Detector con caché (se reconstruye cuando cambian catálogo, referencias o reglas) ----------
function detector(db) {
  const ver = getState(db, 'refs_version') || '0';
  if (detector.cache && detector.cache.db === db && detector.cache.ver === ver) return detector.cache.d;
  const rows = kind => db.prepare('SELECT guide, carrier FROM guide_refs WHERE kind=?').all(kind).map(r => [r.guide, r.carrier]);
  const rules = db.prepare('SELECT carrier, pattern FROM guide_rules ORDER BY ord').all().map(r => [r.carrier, r.pattern]);
  const d = G.build({ catalog: rows('catalog'), refs: rows('ref'), rules: rules.length ? rules : G.DEFAULT_RULES });
  detector.cache = { db, ver, d };
  return d;
}
const bumpRefs = db => setState(db, 'refs_version', Date.now() + '-' + crypto.randomBytes(3).toString('hex'));

function rackFor(db, carrier) {
  const r = db.prepare('SELECT r.id FROM rack_assign a JOIN racks r ON r.id=a.rack_id WHERE a.carrier=? AND r.active=1').get(carrier)
    || db.prepare('SELECT r.id FROM rack_assign a JOIN racks r ON r.id=a.rack_id WHERE a.carrier=? AND r.active=1').get(G.UNKNOWN);
  return r ? r.id : null;
}

function event(db, scanId, user, kind, text, at) {
  db.prepare('INSERT INTO return_events (scan_id, actor_id, actor_label, kind, text, created_at) VALUES (?,?,?,?,?,?)').run(scanId, user ? user.id : null, user ? user.name : 'Sistema', kind, text, at);
}

function scan(db, user, body, now) {
  const raw = String((body && body.guide) || '').trim().slice(0, 80);
  const guide = G.normalize(raw);
  if (guide.length < 6) dm.fail(400, 'La guía es muy corta o no se leyó bien. Vuelve a escanear.');
  const key = G.dupKey(guide);
  const notes = String((body && body.notes) || '').trim().slice(0, 300) || null;
  return tx(db, () => {
    const mine = db.prepare('SELECT s.*, u.name op FROM return_scans s JOIN users u ON u.id=s.operator_id WHERE s.dup_key=?').get(key);
    if (mine && mine.status !== 'anulado') dm.fail(409, `Guía repetida: ya la escaneó ${mine.op} el ${fmt(mine.created_at)}. No se registró otra vez.`);
    const inSheet = !mine && db.prepare('SELECT * FROM sheet_registro WHERE dup_key=?').get(key);
    if (inSheet) dm.fail(409, `Guía repetida: ya está en la hoja "Escaneo de Retornos"${inSheet.row ? ' (fila ' + inSheet.row + ')' : ''}. No se registró otra vez.`);
    const r = G.identify(guide, detector(db));
    const rack = rackFor(db, r.carrier);
    // Escaneo anulado: se vuelve a registrar en la MISMA fila (dup_key es único; no se borra nada y el historial lo conserva).
    if (mine) {
      db.prepare(`UPDATE return_scans SET guide_raw=?, guide=?, carrier=?, method=?, rack_id=?, notes=?, operator_id=?, status='registrado', created_at=?, updated_at=?,
        sheet_update=MAX(sheet_update, ?), sheet_status=CASE WHEN sheet_status='duplicado' THEN sheet_status ELSE 'pendiente' END WHERE id=?`)
        .run(raw, guide, r.carrier, r.method, rack, notes, user.id, now, now, dirty(mine), mine.id);
      event(db, mine.id, user, 'escaneo', `Escaneó de nuevo ${guide} (estaba anulado: ${mine.notes || 'sin nota'}) · ${r.carrier} (${r.method})`, now);
      return getScan(db, mine.id);
    }
    const id = Number(db.prepare(`INSERT INTO return_scans (guide_raw, guide, dup_key, carrier, method, rack_id, notes, operator_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(raw, guide, key, r.carrier, r.method, rack, notes, user.id, now, now).lastInsertRowid);
    event(db, id, user, 'escaneo', `Escaneó ${guide} · ${r.carrier} (${r.method})`, now);
    return getScan(db, id);
  });
}

function getScan(db, id) {
  const s = db.prepare(`SELECT s.*, u.name operator, r.code rack_code, r.name rack_name FROM return_scans s JOIN users u ON u.id=s.operator_id
    LEFT JOIN racks r ON r.id=s.rack_id WHERE s.id=?`).get(id);
  if (!s) dm.fail(404, 'No existe ese escaneo.');
  return s;
}
const live = (db, id) => { const s = getScan(db, id); if (s.status === 'anulado') dm.fail(409, 'Ese escaneo está anulado.'); return s; };
const dirty = s => s.sheet_status === 'pendiente' ? 0 : 1; // si ya se envió, la hoja debe actualizar esa fila

// El operador corrige la paquetería (como hoy en la columna C): se aprende en el catálogo y se reasigna el rack.
function setCarrier(db, user, id, carrier, now) {
  if (!G.OPTIONS.includes(carrier)) dm.fail(400, 'Paquetería no válida.');
  return tx(db, () => {
    const s = live(db, id);
    if (s.carrier === carrier) return s;
    const rack = rackFor(db, carrier);
    const method = carrier === G.UNKNOWN ? 'Pendiente de selección en C' : 'Selección manual';
    db.prepare(`UPDATE return_scans SET carrier=?, method=?, rack_id=?, updated_at=?, sheet_update=MAX(sheet_update, ?), sheet_status=CASE WHEN sheet_status='duplicado' THEN sheet_status ELSE 'pendiente' END WHERE id=?`)
      .run(carrier, method, rack, now, dirty(s), id);
    if (carrier !== G.UNKNOWN) {
      db.prepare('DELETE FROM guide_refs WHERE kind=? AND guide=?').run('catalog', s.guide);
      db.prepare('INSERT INTO guide_refs (kind, guide, carrier, source, updated_at) VALUES (?,?,?,?,?)').run('catalog', s.guide, carrier, 'mx', now);
      bumpRefs(db);
    }
    event(db, id, user, 'paqueteria', `Paquetería: ${s.carrier} → ${carrier}`, now);
    return getScan(db, id);
  });
}

function setRack(db, user, id, rackId, now) {
  return tx(db, () => {
    const s = live(db, id);
    const r = db.prepare('SELECT * FROM racks WHERE id=? AND active=1').get(Number(rackId));
    if (!r) dm.fail(400, 'Rack no válido.');
    if (s.rack_id === r.id) return s;
    db.prepare(`UPDATE return_scans SET rack_id=?, updated_at=?, sheet_update=MAX(sheet_update, ?), sheet_status=CASE WHEN sheet_status='duplicado' THEN sheet_status ELSE 'pendiente' END WHERE id=?`)
      .run(r.id, now, dirty(s), id);
    event(db, id, user, 'rack', `Rack: ${s.rack_code || 'sin rack'} → ${r.code}`, now);
    return getScan(db, id);
  });
}

// Anular (no se borra): solo admins con permiso de resolver. En la hoja la fila se queda; se marca en Observaciones.
function voidScan(db, user, id, reason, now) {
  dm.need(user, 'resolve');
  reason = String(reason || '').trim().slice(0, 200);
  if (reason.length < 5) dm.fail(400, 'Escribe por qué se anula (mínimo 5 caracteres).');
  return tx(db, () => {
    const s = live(db, id);
    db.prepare(`UPDATE return_scans SET status='anulado', notes=?, updated_at=?, sheet_update=MAX(sheet_update, ?), sheet_status=CASE WHEN sheet_status='duplicado' THEN sheet_status ELSE 'pendiente' END WHERE id=?`)
      .run(`ANULADO: ${reason}${s.notes ? ' · ' + s.notes : ''}`, now, dirty(s), id);
    event(db, id, user, 'anulado', 'Anulado: ' + reason, now);
    return getScan(db, id);
  });
}

function listScans(db, { q = '', days = 1, limit = 300 } = {}, now) {
  const since = now - Math.min(Math.max(Number(days) || 1, 1), 31) * 864e5;
  const like = '%' + String(q).trim().toUpperCase() + '%';
  return db.prepare(`SELECT s.*, u.name operator, r.code rack_code, r.name rack_name FROM return_scans s JOIN users u ON u.id=s.operator_id LEFT JOIN racks r ON r.id=s.rack_id
    WHERE s.created_at >= ? AND (? = '%%' OR s.guide LIKE ? OR UPPER(s.carrier) LIKE ? OR UPPER(IFNULL(r.code,'')) LIKE ?) ORDER BY s.id DESC LIMIT ?`)
    .all(since, like, like, like, like, Math.min(Number(limit) || 300, 1000));
}

function racks(db) {
  const rs = db.prepare('SELECT * FROM racks ORDER BY code').all();
  const asg = db.prepare('SELECT carrier, rack_id FROM rack_assign').all();
  const counts = Object.fromEntries(db.prepare(`SELECT rack_id, COUNT(*) n FROM return_scans WHERE status='registrado' GROUP BY rack_id`).all().map(r => [r.rack_id, r.n]));
  return { racks: rs.map(r => ({ ...r, count: counts[r.id] || 0 })), assign: Object.fromEntries(asg.map(a => [a.carrier, a.rack_id])), carriers: G.OPTIONS };
}

function setAssign(db, user, assign) {
  dm.need(user, 'users');
  if (!assign || typeof assign !== 'object') dm.fail(400, 'Asignación inválida.');
  return tx(db, () => {
    for (const [carrier, rackId] of Object.entries(assign)) {
      if (!G.OPTIONS.includes(carrier)) dm.fail(400, 'Paquetería no válida: ' + carrier);
      if (!db.prepare('SELECT id FROM racks WHERE id=? AND active=1').get(Number(rackId))) dm.fail(400, 'Rack no válido para ' + carrier);
      db.prepare('INSERT INTO rack_assign (carrier, rack_id) VALUES (?,?) ON CONFLICT(carrier) DO UPDATE SET rack_id=excluded.rack_id').run(carrier, Number(rackId));
    }
    return racks(db);
  });
}

// ---------- Sincronización con la hoja ----------
const pad = n => String(n).padStart(2, '0');
const fmt = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

async function call(cfg, body, fetchImpl) {
  let res;
  try {
    const r = await fetchImpl(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: cfg.token, ...body }), redirect: 'follow', signal: AbortSignal.timeout(60000) });
    res = await r.json().catch(() => ({ ok: false, error: `Respuesta no válida (HTTP ${r.status})` }));
  } catch (e) { res = { ok: false, error: e.message }; }
  if (!res.ok) throw new Error(res.error || 'No respondió la hoja');
  return res;
}

// Trae de la hoja: Registro (para anti-duplicado), Catálogo, Referencias BrinGO/Process y Reglas.
async function pull(db, cfg, { fetchImpl = fetch, now = Date.now() } = {}) {
  ensureTables(db);
  const r = await call(cfg, { action: 'export' }, fetchImpl);
  tx(db, () => {
    db.prepare('DELETE FROM sheet_registro').run();
    const ins = db.prepare('INSERT OR IGNORE INTO sheet_registro (dup_key, guide, carrier, row, at) VALUES (?,?,?,?,?)');
    // Las filas que MX Wharehouse escribió también están en la hoja; no cuentan como duplicado de sí mismas.
    const mine = new Set(db.prepare('SELECT dup_key FROM return_scans').all().map(x => x.dup_key));
    const fix = db.prepare(`UPDATE return_scans SET carrier=?, method='Selección manual (hoja)', rack_id=?, updated_at=? WHERE dup_key=? AND carrier=? AND status='registrado'`);
    for (const row of r.registro || []) {
      const g = G.normalize(row.guide); if (!g) continue; const k = G.dupKey(g);
      if (!mine.has(k)) { ins.run(k, g, row.carrier || null, row.row || null, row.at || null); continue; }
      // Guía de MX que quedó "Por identificar" y alguien eligió la paquetería en la columna C de la hoja: se toma esa.
      if (G.CARRIERS.includes(row.carrier) && /Selección manual/.test(row.method || '')) fix.run(row.carrier, rackFor(db, row.carrier), now, k, G.UNKNOWN);
    }
    db.prepare(`DELETE FROM guide_refs WHERE kind='ref' OR (kind='catalog' AND source='hoja')`).run();
    const add = db.prepare('INSERT OR IGNORE INTO guide_refs (kind, guide, carrier, source, updated_at) VALUES (?,?,?,?,?)');
    for (const [g, c] of r.catalog || []) if (g && c) add.run('catalog', String(g), String(c), 'hoja', now);
    for (const [g, c] of r.refs || []) if (g && c) add.run('ref', String(g), String(c), 'hoja', now);
    if (Array.isArray(r.rules) && r.rules.length) {
      db.prepare('DELETE FROM guide_rules').run();
      const ru = db.prepare('INSERT INTO guide_rules (ord, carrier, pattern) VALUES (?,?,?)');
      r.rules.forEach(([c, p], i) => { if (c && p) ru.run(i, String(c), String(p)); });
    }
    bumpRefs(db);
  });
  setState(db, 'last_pull_at', now);
  return { registro: (r.registro || []).length, catalog: (r.catalog || []).length, refs: (r.refs || []).length, rules: (r.rules || []).length };
}

// Envía escaneos pendientes (máx. 100 por pasada). Idempotente: la hoja busca la Clave única antes de agregar.
async function push(db, cfg, { fetchImpl = fetch, now = Date.now() } = {}) {
  ensureTables(db);
  const rows = db.prepare(`SELECT s.*, u.name operator, r.name rack_name FROM return_scans s JOIN users u ON u.id=s.operator_id LEFT JOIN racks r ON r.id=s.rack_id
    WHERE s.sheet_status IN ('pendiente','error') ORDER BY s.id LIMIT 100`).all();
  if (!rows.length) return { sent: 0 };
  const learn = rows.filter(s => s.method === 'Selección manual').map(s => [s.guide, s.carrier]);
  let r;
  try {
    r = await call(cfg, { action: 'append', learn, rows: rows.map(s => ({ id: s.id, at: s.created_at, guide: s.guide, carrier: s.carrier, operator: s.operator,
      notes: s.notes || '', method: s.method, rack: s.rack_name || '', key: s.dup_key, update: !!s.sheet_update })) }, fetchImpl);
  } catch (e) {
    const mark = db.prepare(`UPDATE return_scans SET sheet_status='error', sheet_error=? WHERE id=? AND updated_at=?`);
    tx(db, () => rows.forEach(s => mark.run(`${fmt(now)} · ${e.message}`.slice(0, 300), s.id, s.updated_at)));
    setState(db, 'last_error', `${fmt(now)} · ${e.message}`);
    throw e;
  }
  const byId = Object.fromEntries((r.results || []).map(x => [x.id, x]));
  // Solo se marca enviado si no cambió mientras se enviaba (updated_at igual); si cambió, se reenvía en la siguiente pasada.
  const ok = db.prepare(`UPDATE return_scans SET sheet_status=?, sheet_row=?, sheet_error=NULL, sheet_at=?, sheet_update=0 WHERE id=? AND updated_at=?`);
  const keep = db.prepare(`UPDATE return_scans SET sheet_row=?, sheet_update=1 WHERE id=? AND updated_at<>?`);
  tx(db, () => rows.forEach(s => {
    const x = byId[s.id]; if (!x) return;
    ok.run(x.dup ? 'duplicado' : 'enviado', x.row || null, now, s.id, s.updated_at);
    keep.run(x.row || null, s.id, s.updated_at);
  }));
  setState(db, 'last_ok_at', now); setState(db, 'last_error', null);
  return { sent: rows.length };
}

function syncStatus(db) {
  const n = st => db.prepare('SELECT COUNT(*) n FROM return_scans WHERE sheet_status=?').get(st).n;
  return { configured: !!loadConfig(), last_ok_at: Number(getState(db, 'last_ok_at')) || null, last_pull_at: Number(getState(db, 'last_pull_at')) || null,
    last_error: getState(db, 'last_error') || null, pending: n('pendiente') + n('error'), duplicated: n('duplicado'), metrics: detector(db).metrics };
}

function start(db, log = console) {
  ensureTables(db);
  const cfg = loadConfig();
  if (!cfg) { log.log('Retornos: sin hoja configurada (npm run retornos:setup). Los escaneos se guardan solo en esta PC.'); return null; }
  log.log('Retornos: copia a "Escaneo de Retornos" cada 30 s; lectura de la hoja cada 5 min.');
  let busy = false, lastPull = 0;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      if (Date.now() - lastPull > 5 * 60e3) { try { await pull(db, cfg); } catch (e) { log.error('Retornos (lectura): ' + e.message); } lastPull = Date.now(); }
      for (let i = 0; i < 5; i++) { const r = await push(db, cfg); if (r.sent < 100) break; }
    } catch (e) { log.error('Retornos (copia): ' + e.message); }
    finally { busy = false; }
  };
  tick();
  return setInterval(tick, 30e3);
}

function mount(app, db, opts, now) {
  ensureTables(db);
  const on = enabled(opts);
  const guard = () => { if (!on) dm.fail(404, 'El escaneo de retornos está desactivado.'); };
  const wrap = fn => (req, res) => {
    try { guard(); res.json(fn(req)); }
    catch (e) { if (!(e instanceof dm.HttpError)) console.error('[retornos]', e); res.status(e instanceof dm.HttpError ? e.status : 500).json({ error: e instanceof dm.HttpError ? e.message : 'Error interno.' }); }
  };
  app.post('/api/rscan', wrap(req => scan(db, req.user, req.body, now())));
  app.get('/api/rscan', wrap(req => ({ rows: listScans(db, req.query, now()), sync: syncStatus(db) })));
  app.post('/api/rscan/:id/carrier', wrap(req => setCarrier(db, req.user, Number(req.params.id), req.body && req.body.carrier, now())));
  app.post('/api/rscan/:id/rack', wrap(req => setRack(db, req.user, Number(req.params.id), req.body && req.body.rack_id, now())));
  app.post('/api/rscan/:id/void', wrap(req => voidScan(db, req.user, Number(req.params.id), req.body && req.body.reason, now())));
  app.get('/api/rscan/:id/events', wrap(req => { getScan(db, Number(req.params.id)); return db.prepare('SELECT * FROM return_events WHERE scan_id=? ORDER BY id').all(Number(req.params.id)); }));
  app.get('/api/racks', wrap(() => racks(db)));
  app.post('/api/racks/assign', wrap(req => setAssign(db, req.user, req.body && req.body.assign)));
  return { enabled: on };
}

// npm run retornos:setup → activa el escaneo y guarda la URL del Apps Script nuevo (el token no pasa por el chat).
async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch {}
  const token = prev.token || crypto.randomBytes(24).toString('base64url');
  console.log('\nEscaneo de retornos · conexión con la hoja "Escaneo de Retornos"');
  console.log('1) Crea un proyecto NUEVO en script.google.com (no edites "Escaneo Retornos — Eyoyo") y pega app/integraciones/google-sheets/Retornos.gs.');
  console.log('2) Configuración del proyecto → Propiedades de la secuencia de comandos:');
  console.log('     TOKEN        = ' + token);
  console.log('     RETORNOS_ID  = 1v-YFaNsZ4bZ4uCAnd32RuSVT7ZiJIHSBHSa78MIgYOA');
  console.log('3) Implementar → Nueva implementación → Aplicación web → Ejecutar como: Yo · Acceso: Cualquier usuario.\n');
  const url = (await ask('Pega la URL de la implementación (termina en /exec), o deja vacío para usar solo esta PC: ')).trim();
  rl.close();
  if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { console.error('Esa URL no parece de Apps Script.'); process.exit(1); }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CFG_FILE, JSON.stringify({ enabled: true, url: url || null, token }, null, 2), { mode: 0o600 });
  if (!url) { console.log('Escaneo activado sin hoja. Reinicia "npm start".'); return; }
  console.log('\nProbando lectura de la hoja…');
  const { open } = require('./db');
  const db = open();
  try {
    const r = await pull(db, { url, token });
    console.log(`Listo: ${r.registro} filas de Registro, ${r.catalog} del catálogo, ${r.refs} referencias y ${r.rules} reglas.`);
    const rows = await call({ url, token }, { action: 'export' }, fetch);
    const bt = G.backtest((rows.registro || []).map(x => [x.guide, x.carrier, x.method]), detector(db));
    console.log(`Coincidencia con la hoja: ${bt.correct}/${bt.auto} asignadas iguales (${(bt.precision * 100).toFixed(1)}%), ${bt.unknown} quedarían "Por identificar" de ${bt.total}.`);
    console.log('Reinicia "npm start".');
  } catch (e) { console.error('No se pudo leer la hoja: ' + e.message + '\nRevisa TOKEN, RETORNOS_ID y que la implementación sea "Cualquier usuario".'); process.exit(1); }
}

if (require.main === module) setup();
module.exports = { ensureTables, mount, start, pull, push, scan, setCarrier, setRack, voidScan, listScans, racks, setAssign, syncStatus, detector, loadConfig, enabled };
