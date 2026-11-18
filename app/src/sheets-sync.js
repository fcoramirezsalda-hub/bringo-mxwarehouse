// Copia de tickets e historial a Google Sheets (respaldo y consulta mientras no haya nube autorizada).
// La base de datos local sigue siendo la principal; la hoja es un espejo que se actualiza cada minuto.
// Envío: POST JSON al Apps Script de la hoja (integraciones/google-sheets/Codigo.gs) con un token compartido.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DATA_DIR } = require('./db');
const dm = require('./domain');

const CFG_FILE = path.join(DATA_DIR, 'sheets.json');
const HEADERS = ['Folio', 'Código', 'Guía', 'Plataforma', 'Motivo', 'Detalle', 'Estado', 'Registró', 'Registrado', 'Responsable',
  'Respuesta pendiente de', 'Ubicación', 'Fecha límite', 'Orden', 'Producto', 'Fuente de la orden', 'Datos de la orden',
  'Duplicado confirmado', 'Desenlace dañado', 'Resolución', 'Descarte', 'Actualizado'];
const EVENT_HEADERS = ['ID', 'Folio', 'Fecha', 'Quién', 'Tipo', 'Detalle'];
const BATCH = 200;
const ENR = { na: 'Sin buscar', buscando: 'Buscando', lista: 'Lista', sin: 'Sin coincidencias', error: 'Error' };

function loadConfig() {
  if (process.env.SHEETS_URL && process.env.SHEETS_TOKEN) return { url: process.env.SHEETS_URL, token: process.env.SHEETS_TOKEN };
  try { const c = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); return c.url && c.token ? c : null; } catch { return null; }
}

const pad = n => String(n).padStart(2, '0');
const fmt = ms => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function ensureTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS sheet_sync (ticket_id INTEGER PRIMARY KEY, hash TEXT NOT NULL);
           CREATE TABLE IF NOT EXISTS sync_state (k TEXT PRIMARY KEY, v TEXT);`);
}
const getState = (db, k) => (db.prepare('SELECT v FROM sync_state WHERE k=?').get(k) || {}).v;
const setState = (db, k, v) => db.prepare('INSERT INTO sync_state (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, v == null ? null : String(v));

function ticketRow(t, N) {
  const d = t.enr_data ? JSON.parse(t.enr_data) : {};
  const data = (d.fields || []).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return [dm.folio(t.id), t.code || '', t.trk || '', t.plat || '', dm.TYPES[t.type] || t.type,
    [t.other_text, t.description].filter(Boolean).join(' · '), t.status, N[t.reporter_id] || '', fmt(t.created_at), t.owner_id ? N[t.owner_id] : '',
    t.waiting_dept || '', t.location || '', fmt(t.dup_due_at || t.due_at), ENR[t.enr_status] || t.enr_status, d.product || '', t.enr_source || '', data.slice(0, 3000),
    t.dup_confirmed_at ? `${N[t.dup_confirmed_by] || ''} · ${fmt(t.dup_confirmed_at)}` : '', t.damage_outcome || '', t.resolution || '',
    t.discarded_at ? `${N[t.discarded_by] || ''} · ${fmt(t.discarded_at)} · ${t.discard_reason || ''}` : ''];
}

// Una pasada: manda los tickets que cambiaron y los eventos nuevos. Devuelve un resumen.
async function syncOnce(db, cfg, { fetchImpl = fetch, now = Date.now() } = {}) {
  ensureTables(db);
  const N = Object.fromEntries(db.prepare('SELECT id, name FROM users').all().map(u => [u.id, u.name]));
  const known = Object.fromEntries(db.prepare('SELECT ticket_id, hash FROM sheet_sync').all().map(r => [r.ticket_id, r.hash]));
  const changed = [];
  for (const t of db.prepare('SELECT * FROM tickets ORDER BY id').iterate()) {
    const row = ticketRow(t, N), hash = crypto.createHash('sha1').update(JSON.stringify(row)).digest('hex');
    if (known[t.id] !== hash) changed.push({ id: t.id, row, hash });
    if (changed.length >= BATCH) break;
  }
  const lastEv = Number(getState(db, 'last_event_id') || 0);
  const evs = db.prepare('SELECT * FROM ticket_events WHERE id>? ORDER BY id LIMIT ?').all(lastEv, BATCH * 5);
  if (!changed.length && !evs.length) { setState(db, 'last_ok_at', now); setState(db, 'last_error', null); return { tickets: 0, events: 0 }; }

  const stamp = fmt(now);
  const body = { token: cfg.token, headers: HEADERS, event_headers: EVENT_HEADERS,
    tickets: changed.map(c => [...c.row, stamp]),
    events: evs.map(e => [String(e.id), dm.folio(e.ticket_id), fmt(e.created_at), e.actor_label, e.kind, e.text]) };
  let res;
  try {
    const r = await fetchImpl(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow', signal: AbortSignal.timeout(60000) });
    res = await r.json().catch(() => ({ ok: false, error: `Respuesta no válida (HTTP ${r.status})` }));
  } catch (e) { res = { ok: false, error: e.message }; }
  if (!res.ok) { setState(db, 'last_error', `${fmt(now)} · ${res.error || 'error desconocido'}`); throw new Error(res.error || 'No se pudo copiar a Google Sheets'); }

  const up = db.prepare('INSERT INTO sheet_sync (ticket_id, hash) VALUES (?,?) ON CONFLICT(ticket_id) DO UPDATE SET hash=excluded.hash');
  db.exec('BEGIN'); try { for (const c of changed) up.run(c.id, c.hash); if (evs.length) setState(db, 'last_event_id', evs[evs.length - 1].id); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  setState(db, 'last_ok_at', now); setState(db, 'last_error', null);
  return { tickets: changed.length, events: evs.length };
}

function status(db) {
  ensureTables(db);
  const cfg = loadConfig();
  return { configured: !!cfg, last_ok_at: Number(getState(db, 'last_ok_at')) || null, last_error: getState(db, 'last_error') || null };
}

function start(db, log = console) {
  const cfg = loadConfig();
  if (!cfg) { log.log('Google Sheets: sin configurar (npm run sheets:setup). Los tickets solo se guardan en esta PC.'); return null; }
  log.log('Google Sheets: copia activa cada minuto.');
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try { for (let i = 0; i < 10; i++) { const r = await syncOnce(db, cfg); if (r.tickets < BATCH && r.events < BATCH * 5) break; } }
    catch (e) { log.error('Google Sheets: ' + e.message); }
    finally { busy = false; }
  };
  tick();
  return setInterval(tick, 60e3);
}

// npm run sheets:setup → genera el token y guarda la URL del Apps Script (nada pasa por el chat).
async function setup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));
  const prev = loadConfig();
  const token = prev?.token || crypto.randomBytes(24).toString('base64url');
  console.log('\n1) En la hoja de Google: Extensiones → Apps Script → Configuración del proyecto → Propiedades de la secuencia de comandos.');
  console.log('   Agrega la propiedad  TOKEN  con este valor:\n\n   ' + token + '\n');
  const url = (await ask('2) Pega la URL de la implementación (termina en /exec): ')).trim();
  rl.close();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { console.error('Esa URL no parece de Apps Script (https://script.google.com/macros/s/.../exec).'); process.exit(1); }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CFG_FILE, JSON.stringify({ url, token }, null, 2), { mode: 0o600 });
  console.log('\nProbando conexión…');
  const { open } = require('./db');
  try { const r = await syncOnce(open(), { url, token }); console.log(`Listo: ${r.tickets} tickets y ${r.events} eventos copiados. Reinicia "npm start".`); }
  catch (e) { console.error('No se pudo copiar: ' + e.message + '\nRevisa el TOKEN en Apps Script y que la implementación sea "Cualquier usuario".'); process.exit(1); }
}

if (require.main === module) setup();
module.exports = { HEADERS, EVENT_HEADERS, syncOnce, status, start, loadConfig, ticketRow };
