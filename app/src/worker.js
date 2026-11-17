// Agente de búsqueda: atiende la cola enrichment_jobs y escribe la información de la orden en el ticket.
//   npm run agent:login   Abre el navegador con ventana para que inicies sesión en Bringgo y EasyShip (una vez).
//   npm run agent         Corre el agente sin ventana. Déjalo abierto durante el turno.
// Variables opcionales: AGENT_FAKE=1 (datos de prueba, no abre navegador), HEADLESS=false, AGENT_PAUSE_MS=6000
const path = require('path');
const { open, DATA_DIR } = require('./db');
const dm = require('./domain');

const PROFILE = process.env.AGENT_PROFILE || path.join(__dirname, '..', 'perfil-agente');
const CAPTURES = path.join(DATA_DIR, 'capturas-agente');
const PAUSE = Number(process.env.AGENT_PAUSE_MS || 6000);
const FAKE = process.env.AGENT_FAKE === '1';

function heartbeat(db, note) {
  db.prepare('INSERT INTO agent_heartbeat (id, at, note) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at, note=excluded.note').run(Date.now(), note || null);
}

function claim(db, now = Date.now()) {
  // Recupera trabajos que quedaron "running" por un cierre inesperado.
  db.prepare("UPDATE enrichment_jobs SET status='pending', locked_at=NULL WHERE status='running' AND locked_at < ?").run(now - 5 * 60e3);
  return db.prepare(`UPDATE enrichment_jobs SET status='running', locked_at=?, attempts=attempts+1, updated_at=?
    WHERE id=(SELECT id FROM enrichment_jobs WHERE status='pending' AND next_at<=? ORDER BY id LIMIT 1) RETURNING *`).get(now, now, now);
}

function finish(db, job, result, now = Date.now()) {
  const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(job.ticket_id);
  if (!t) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (result.none) {
      db.prepare("UPDATE tickets SET enr_status='sin', enr_source=NULL, enr_data=?, enr_at=? WHERE id=?").run(JSON.stringify({ tried: result.tried }), now, t.id);
      dm.event(db, t.id, null, 'agente', 'Agente de búsqueda: sin coincidencias en ' + result.tried.join(', '), now);
    } else {
      const code = dm.normCode(result.code);
      const data = { product: result.product || null, fields: result.fields, candidates: result.candidates || [], tried: result.tried };
      // Un número tecleado sin MX/ES se completa con el prefijo de la plataforma donde se encontró.
      db.prepare("UPDATE tickets SET enr_status='lista', enr_source=?, enr_data=?, enr_at=?, code=CASE WHEN code IS NULL OR (? IS NOT NULL AND code NOT LIKE '__-%') THEN COALESCE(?, code) ELSE code END, plat=COALESCE(plat, ?) WHERE id=?")
        .run(result.source, JSON.stringify(data), now, code, code, code ? code.slice(0, 2) : null, t.id);
      if (code && dm.isBare(t.code) && t.code !== code) dm.event(db, t.id, null, 'agente', `Agente de búsqueda: el número ${t.code} es ${code}`, now);
      dm.event(db, t.id, null, 'agente', `Agente de búsqueda: información obtenida de ${result.source}${data.candidates.length ? ` (${data.candidates.length} resultados; confirmar cuál)` : ''}`, now);
    }
    db.prepare("UPDATE enrichment_jobs SET status='done', error=NULL, updated_at=? WHERE id=?").run(now, job.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function failJob(db, job, err, now = Date.now()) {
  const wait = dm.RETRY_MIN[job.attempts - 1];
  if (wait !== undefined && job.attempts < 3) {
    db.prepare("UPDATE enrichment_jobs SET status='pending', next_at=?, locked_at=NULL, error=?, updated_at=? WHERE id=?").run(now + wait * 60e3, String(err).slice(0, 500), now, job.id);
  } else {
    db.prepare("UPDATE enrichment_jobs SET status='failed', error=?, updated_at=? WHERE id=?").run(String(err).slice(0, 500), now, job.id);
    db.prepare("UPDATE tickets SET enr_status='error', enr_at=? WHERE id=?").run(now, job.ticket_id);
    dm.event(db, job.ticket_id, null, 'agente', 'Agente de búsqueda: no se pudo consultar después de 3 intentos', now);
  }
}

// Datos de prueba para correr sin Bringgo/EasyShip (pruebas automáticas y demo).
const FAKE_DATA = {
  'MX-2900440': { source: 'Bringgo · Accept goods', code: 'MX-2900440', product: 'EVER ADVANCED Rolling Ball Storage Cart', fields: [['Product Name', 'EVER ADVANCED Rolling Ball Storage Cart'], ['W.T No', 'MX-2900440'], ['ASIN', 'B0BPYBDTC6'], ['Quantity', '1']] },
  'ES-4748635': { source: 'EasyShip · Orden', code: 'ES-4748635', product: null, fields: [['Orden EasyShip', '#4748635 · PRE_LABEL_CREATED'], ['Usuario', '#15589'], ['Paquetería', 'PAQUETEXPRESS > STANDARD']] },
  '191255213580': { source: 'Bringgo · Item Look Up · Outbound Tracking Number', code: 'MX-2900440', product: 'EVER ADVANCED Rolling Ball Storage Cart', fields: [['W.H CODE', 'MX-2900440'], ['PRODUCT NAME', 'EVER ADVANCED Rolling Ball Storage Cart'], ['ASIN', 'B0BPYBDTC6'], ['SELLER ACCOUNT ORDER NO', '701-9461183-8702647'], ['OUTBOUND TRACKING', '191255213580 | Delivered']] },
};
async function fakeLookup(_page, { code, trk }) {
  if (dm.isBare(code)) {
    const hits = ['MX-' + code, 'ES-' + code].map(k => FAKE_DATA[k]).filter(Boolean);
    if (hits.length === 1) return { ...hits[0], tried: ['Bringgo · Accept goods', 'EasyShip · Orden'] };
    if (!hits.length) return { none: true, tried: ['Bringgo · Accept goods (MX-' + code + ')', 'EasyShip · Orden (ES-' + code + ')'] };
  }
  const r = FAKE_DATA[code] || FAKE_DATA[trk];
  return r ? { ...r, tried: [r.source] } : { none: true, tried: [code ? (code.startsWith('MX') ? 'Bringgo · Accept goods' : 'EasyShip · Item lookup') : 'Bringgo · Item Look Up', 'EasyShip · Item lookup'] };
}

async function processOne(db, page, lookupFn) {
  const job = claim(db); if (!job) return false;
  const t0 = Date.now();
  try {
    const r = await lookupFn(page, { code: job.query_code, trk: job.query_trk });
    finish(db, job, r);
    console.log(`[${new Date().toLocaleTimeString()}] ${dm.folio(job.ticket_id)} ${r.none ? 'sin coincidencias' : r.source} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    console.error(`[${new Date().toLocaleTimeString()}] ${dm.folio(job.ticket_id)} error: ${e.message}`);
    if (page && !FAKE) { const c = require('./connectors'); const f = await c.evidence(page, CAPTURES, dm.folio(job.ticket_id)); if (f) console.error('  Captura para revisar: ' + f + '.png (contiene datos de clientes)'); }
    failJob(db, job, e.message);
    if (e.name === 'SessionExpired' || /sesión venció/.test(e.message)) { heartbeat(db, 'Sesión vencida en Bringgo/EasyShip'); throw e; }
  }
  return true;
}

// Navegador del agente: en Windows usa Microsoft Edge (ya viene instalado) para no depender
// de descargar Chromium. AGENT_BROWSER=chromium fuerza el Chromium de Playwright.
async function launchBrowser(opts) {
  const { chromium } = require('playwright');
  const pref = process.env.AGENT_BROWSER || (process.platform === 'win32' ? 'msedge' : 'chromium');
  if (pref !== 'chromium') {
    try { return await chromium.launchPersistentContext(PROFILE, { ...opts, channel: pref }); }
    catch (e) { console.error(`No se pudo abrir ${pref} (${e.message.split('\n')[0]}); se intenta con Chromium.`); }
  }
  return chromium.launchPersistentContext(PROFILE, opts);
}

async function main() {
  const db = open();
  if (process.argv.includes('--login')) {
    const c = require('./connectors');
    const ctx = await launchBrowser({ headless: false, viewport: { width: 1400, height: 900 } });
    (ctx.pages()[0] || await ctx.newPage()).goto(c.URLS.bringgoAccept);
    (await ctx.newPage()).goto(c.URLS.easyLookup);
    console.log('Inicia sesión en Bringgo y en EasyShip. Cuando veas las pantallas de búsqueda, cierra la ventana.');
    await new Promise(r => ctx.on('close', r));
    console.log('Sesión guardada. Ahora corre: npm run agent');
    return;
  }
  let page = null, lookupFn = fakeLookup;
  if (!FAKE) {
    const c = require('./connectors');
    const ctx = await launchBrowser({ headless: process.env.HEADLESS !== 'false', viewport: { width: 1400, height: 900 } });
    page = ctx.pages()[0] || await ctx.newPage(); lookupFn = c.lookup;
  }
  console.log(`Agente de búsqueda ${FAKE ? '(modo de prueba, sin navegador)' : ''} en marcha. Ctrl+C para detener.`);
  heartbeat(db, FAKE ? 'Modo de prueba' : 'En línea');
  setInterval(() => heartbeat(db, FAKE ? 'Modo de prueba' : 'En línea'), 15e3);
  for (;;) {
    let did = false;
    try { did = await processOne(db, page, lookupFn); }
    catch (e) { console.error('Detenido: ' + e.message); process.exit(2); }
    await new Promise(r => setTimeout(r, did ? PAUSE : 3000));
  }
}

if (require.main === module) main();
module.exports = { claim, finish, failJob, processOne, fakeLookup };
