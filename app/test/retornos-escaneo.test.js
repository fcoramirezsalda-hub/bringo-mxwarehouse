const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { open } = require('../src/db');
const { seed } = require('../src/setup');
const { createApp } = require('../src/server');
const RS = require('../src/retornos-escaneo');

// ---------- Hoja simulada en memoria para ejecutar Retornos.gs tal cual ----------
function fakeSheet(name, rows, maxRows = 60) {
  const s = { name, data: rows.map(r => r.slice()), fmt: {}, hidden: false, writes: [] };
  const cell = (r, c) => (s.data[r - 1] || [])[c - 1];
  const put = (r, c, v) => { while (s.data.length < r) s.data.push([]); s.data[r - 1][c - 1] = v; s.writes.push([r, c]); };
  const range = (r, c, nr = 1, nc = 1) => {
    const self = {
      getValue: () => cell(r, c) ?? '', getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j) ?? '')),
      getDisplayValues: () => self.getValues().map(row => row.map(v => Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : String(v ?? ''))),
      setValue: v => { put(r, c, v); return self; }, setValues: vs => { vs.forEach((row, i) => row.forEach((v, j) => put(r + i, c + j, v))); return self; },
      setNumberFormat: f => { s.fmt[r + ',' + c] = f; return self; },
    };
    return self;
  };
  s.api = {
    getRange: (a, b, c, d) => typeof a === 'string' ? range(Number(a.slice(1)), a.charCodeAt(0) - 64) : range(a, b, c, d),
    getMaxRows: () => Math.max(maxRows, s.data.length), getLastRow: () => s.data.length,
    appendRow: row => { s.data.push(row.slice()); }, hideSheet: () => { s.hidden = true; },
  };
  return s;
}
function loadGs(sheets, props) {
  const book = { sheets };
  const libro = { getSheetByName: n => sheets[n] ? sheets[n].api : null, insertSheet: n => { sheets[n] = fakeSheet(n, []); return sheets[n].api; } };
  const ctx = {
    SpreadsheetApp: { openById: id => { assert.equal(id, props.RETORNOS_ID); return libro; }, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => t }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../integraciones/google-sheets/Retornos.gs'), 'utf8'), ctx);
  // fetch simulado que llama a doPost.
  book.fetch = async (url, init) => ({ ok: true, status: 200, json: async () => JSON.parse(ctx.doPost({ postData: { contents: init.body } })) });
  return book;
}
const SPILL = 'FORMULA'; // D2, G2, I2 tienen fórmulas que se extienden: no se debe escribir nada debajo.
function registro() {
  return fakeSheet('Registro', [
    ['Fecha de Escaneo ', 'Guía / RMA', 'Paquetería / origen', 'Mes', 'Operador', 'Observaciones', 'Control', 'Método de identificación', 'Clave única'],
    [new Date('2026-10-05T20:30:37Z'), 'JJD014600012840116521', 'DHL', SPILL, '', '', SPILL, 'Formato de guía', SPILL],
    [new Date('2026-10-05T20:31:23Z'), '1013486154341139840400383922474018', 'FedEx', '', '', '', '', 'Código FedEx FDX1D; rastreo 383922474018', ''],
    [new Date('2026-10-05T20:31:50Z'), 'AB1234567XYZ', 'Por identificar', '', '', '', '', 'Selección manual', ''],
  ]);
}
function book() {
  return {
    Registro: registro(),
    'Catálogo de guías': fakeSheet('Catálogo de guías', [['Guía', 'Paquetería'], ['877390910027', 'FedEx']]),
    'Referencia BrinGO': fakeSheet('Referencia BrinGO', [['Guía', 'Origen', 'Reconocida'], ['581229391588', 'Paquetexpress', 'PaqueteExpress']]),
    'Referencia Process': fakeSheet('Referencia Process', [['Guía', 'Paquetería']]),
    Reglas: fakeSheet('Reglas', [['Paquetería', 'Patrón', 'Base'], ['J&T', '^JMX[0-9]+$', ''], ['DHL', '^J?JD[0-9]+$', ''], ['UPS', '^1Z[A-Z0-9]{16}$', ''], ['Castores', '', '']]),
  };
}
const PROPS = { TOKEN: 'tok', RETORNOS_ID: 'sheet-1' };

async function start(opts = { returnsScan: true }) {
  const db = open(':memory:'); const pins = seed(db, true);
  const server = createApp(db, opts).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const login = async name => (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pin: pins[name] }) })).headers.get('set-cookie').split(';')[0];
  const req = async (cookie, p, body) => { const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  return { db, login, req, stop: async () => { await new Promise(r => server.close(r)); db.close(); } };
}

test('escaneo desactivado por defecto: sin cambios para la bodega', async () => {
  const old = process.env.RETURNS_SCAN; delete process.env.RETURNS_SCAN;
  const s = await start({});
  try {
    const op = await s.login('Fatima');
    assert.equal((await s.req(op, '/api/me')).body.returns_scan, false);
    assert.equal((await s.req(op, '/api/rscan', { guide: 'JMX101796289307' })).status, 404);
  } finally { await s.stop(); if (old !== undefined) process.env.RETURNS_SCAN = old; }
});

test('operador escanea: detecta, asigna rack, rechaza repetidas y corrige paquetería', async () => {
  const s = await start();
  try {
    const op = await s.login('Fatima'), admin = await s.login('Francisco R.');
    assert.equal((await s.req(op, '/api/me')).body.returns_scan, true);
    assert.equal((await s.req(op, '/api/rscan', { guide: '123' })).status, 400);
    const a = await s.req(op, '/api/rscan', { guide: ']C1jmx101796289307' });
    assert.equal(a.status, 200); assert.equal(a.body.carrier, 'J&T'); assert.equal(a.body.rack_code, 'R05'); assert.equal(a.body.guide, 'JMX101796289307');
    // Repetida (también con otra forma de la misma guía DHL J/JJD).
    assert.equal((await s.req(op, '/api/rscan', { guide: 'JMX101796289307' })).status, 409);
    await s.req(op, '/api/rscan', { guide: 'JJD014600012840116000' });
    assert.equal((await s.req(op, '/api/rscan', { guide: 'JD014600012840116000' })).status, 409);
    // Desconocida → Por identificar → rack de cuarentena (R10); el operador la corrige y se aprende.
    const u = await s.req(op, '/api/rscan', { guide: 'QQ12345678ZZ' });
    assert.equal(u.body.carrier, 'Por identificar'); assert.equal(u.body.rack_code, 'R10');
    const c = await s.req(op, `/api/rscan/${u.body.id}/carrier`, { carrier: 'Castores' });
    assert.equal(c.status, 200); assert.equal(c.body.method, 'Selección manual'); assert.equal(c.body.rack_code, 'R08');
    assert.equal((await s.req(op, `/api/rscan/${u.body.id}/carrier`, { carrier: 'Inventada' })).status, 400);
    // Aprendido: otra guía igual en catálogo ya sale por catálogo (se anula la primera para poder reescanear).
    assert.equal((await s.req(op, `/api/rscan/${u.body.id}/void`, { reason: 'prueba' })).status, 403);
    assert.equal((await s.req(admin, `/api/rscan/${u.body.id}/void`, { reason: 'no' })).status, 400);
    assert.equal((await s.req(admin, `/api/rscan/${u.body.id}/void`, { reason: 'Escaneo de prueba' })).body.status, 'anulado');
    assert.equal((await s.req(op, `/api/rscan/${u.body.id}/rack`, { rack_id: 1 })).status, 409);
    // Rack manual.
    const r = await s.req(op, `/api/rscan/${a.body.id}/rack`, { rack_id: 1 });
    assert.equal(r.body.rack_code, 'R01');
    assert.equal((await s.req(op, `/api/rscan/${a.body.id}/rack`, { rack_id: 99 })).status, 400);
    // Historial y lista.
    const ev = await s.req(op, `/api/rscan/${a.body.id}/events`);
    assert.deepEqual(ev.body.map(e => e.kind), ['escaneo', 'rack']);
    const list = await s.req(op, '/api/rscan?q=jmx');
    assert.equal(list.body.rows.length, 1);
    // Racks: solo quien administra usuarios cambia la asignación.
    assert.equal((await s.req(op, '/api/racks/assign', { assign: { 'J&T': 2 } })).status, 403);
    const asg = await s.req(admin, '/api/racks/assign', { assign: { 'J&T': 2 } });
    assert.equal(asg.status, 200); assert.equal(asg.body.assign['J&T'], 2);
    assert.equal((await s.req(admin, '/api/racks/assign', { assign: { 'J&T': 77 } })).status, 400);
    assert.equal((await s.req(op, '/api/racks')).body.racks.length, 10);
  } finally { await s.stop(); }
});

test('Retornos.gs: exporta, agrega sin tocar D/G/I, reintentos sin duplicar y respeta escaneos directos', async () => {
  const sheets = book(), gs = loadGs(sheets, PROPS);
  const cfg = { url: 'https://script.google.com/macros/s/x/exec', token: 'tok' };
  const db = open(':memory:'); seed(db, true); RS.ensureTables(db);
  const user = db.prepare("SELECT * FROM users WHERE name='Fatima'").get();
  try {
    // Token incorrecto: no hace nada.
    await assert.rejects(RS.pull(db, { ...cfg, token: 'malo' }, { fetchImpl: gs.fetch }), /Token incorrecto/);
    const p = await RS.pull(db, cfg, { fetchImpl: gs.fetch });
    assert.deepEqual(p, { registro: 3, catalog: 1, refs: 1, rules: 3 });
    // Ya escaneada directo en la hoja → MX la rechaza.
    assert.throws(() => RS.scan(db, user, { guide: 'JD014600012840116521' }, Date.now()), /ya está en la hoja.*fila 2/);
    // Referencia BrinGO de la hoja se usa para detectar.
    const s1 = RS.scan(db, user, { guide: '581229391588' }, Date.now());
    assert.equal(s1.carrier, 'PaqueteExpress'); assert.equal(s1.method, 'Referencia BrinGO / Process');
    const s2 = RS.scan(db, user, { guide: 'QQ12345678ZZ', notes: 'caja rota' }, Date.now());
    RS.setCarrier(db, user, s2.id, 'Afimex', Date.now());

    const before = sheets.Registro.data.length;
    assert.deepEqual(await RS.push(db, cfg, { fetchImpl: gs.fetch }), { sent: 2 });
    const R = sheets.Registro.data;
    assert.equal(R.length, before + 2);
    assert.equal(R[0][9], 'Rack');
    const row = R[before + 1];
    assert.equal(row[1], 'QQ12345678ZZ'); assert.equal(row[2], 'Afimex'); assert.equal(row[4], 'Fatima'); assert.equal(row[5], 'caja rota');
    assert.equal(row[7], 'Selección manual'); assert.equal(row[9], 'Rack 8'); assert.equal(Object.prototype.toString.call(row[0]), '[object Date]');
    assert.equal(sheets.Registro.fmt[`${before + 1},2`], '@', 'la guía se guarda como texto');
    // Nunca escribe en D (4), G (7), I (9).
    assert.ok(!sheets.Registro.writes.some(([r, c]) => [4, 7, 9].includes(c)), 'no toca las columnas con fórmula');
    // Aprendizaje → Catálogo de guías.
    assert.deepEqual(sheets['Catálogo de guías'].data.at(-1), ['QQ12345678ZZ', 'Afimex']);
    assert.ok(sheets['MX Wharehouse'].hidden);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM return_scans WHERE sheet_status='enviado'").get().n, 2);

    // Reintento (p. ej. la respuesta se perdió): se marca error y se reenvía → misma fila, sin duplicar.
    db.prepare("UPDATE return_scans SET sheet_status='error'").run();
    await RS.push(db, cfg, { fetchImpl: gs.fetch });
    assert.equal(sheets.Registro.data.length, before + 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM return_scans WHERE sheet_status='enviado'").get().n, 2);

    // Corrección después de enviada: actualiza C, H y J de la misma fila.
    RS.setRack(db, user, s1.id, 3, Date.now());
    await RS.push(db, cfg, { fetchImpl: gs.fetch });
    assert.equal(sheets.Registro.data.length, before + 2);
    assert.equal(sheets.Registro.data[before][9], 'Rack 3');

    // Escaneada en la hoja antes de que MX enviara la suya → MX la marca "duplicado" y no escribe.
    const s3 = RS.scan(db, user, { guide: 'JMX555555555' }, Date.now());
    sheets.Registro.data.push([new Date(), 'JMX555555555', 'J&T']);
    await RS.push(db, cfg, { fetchImpl: gs.fetch });
    assert.equal(db.prepare('SELECT sheet_status FROM return_scans WHERE id=?').get(s3.id).sheet_status, 'duplicado');
    assert.equal(sheets.Registro.data.filter(r => r[1] === 'JMX555555555').length, 1);

    // Lectura posterior: las filas de MX no cuentan como duplicado de sí mismas.
    await RS.pull(db, cfg, { fetchImpl: gs.fetch });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sheet_registro WHERE guide=?').get('QQ12345678ZZ').n, 0);

    // Selección hecha en la columna C de la hoja para una guía de MX "Por identificar" → MX la toma.
    const s4 = RS.scan(db, user, { guide: 'ZZ99999999QQ' }, Date.now());
    assert.equal(s4.carrier, 'Por identificar');
    await RS.push(db, cfg, { fetchImpl: gs.fetch });
    const r4 = sheets.Registro.data.find(r => r[1] === 'ZZ99999999QQ'); r4[2] = 'DHL'; r4[7] = 'Selección manual';
    await RS.pull(db, cfg, { fetchImpl: gs.fetch });
    const after = db.prepare('SELECT carrier, rack_id FROM return_scans WHERE id=?').get(s4.id);
    assert.equal(after.carrier, 'DHL'); assert.equal(after.rack_id, 4);
  } finally { db.close(); }
});

test('si la hoja no responde, el escaneo queda guardado y pendiente', async () => {
  const db = open(':memory:'); seed(db, true); RS.ensureTables(db);
  const user = db.prepare("SELECT * FROM users WHERE name='Fatima'").get();
  try {
    RS.scan(db, user, { guide: 'JMX101796289307' }, Date.now());
    await assert.rejects(RS.push(db, { url: 'x', token: 't' }, { fetchImpl: async () => { throw new Error('sin internet'); } }), /sin internet/);
    const st = RS.syncStatus(db);
    assert.equal(st.pending, 1); assert.match(st.last_error, /sin internet/);
  } finally { db.close(); }
});
