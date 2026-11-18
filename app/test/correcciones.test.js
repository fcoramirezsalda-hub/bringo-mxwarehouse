// Pruebas de las correcciones de la revisión de código (2026-11-18).
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
const { open } = require('../src/db');
const { seed } = require('../src/setup');
const { createApp, purgeSessions } = require('../src/server');
const dm = require('../src/domain');
const worker = require('../src/worker');
const RS = require('../src/retornos-escaneo');

const D = 24 * 3600e3;
function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mxw-fix-'));
  const db = open(path.join(dir, 'test.db'));
  const pins = seed(db, true);
  const U = n => db.prepare('SELECT * FROM users WHERE name=?').get(n);
  return { db, pins, U, dir };
}

test('agente: un trabajo cancelado por "nueva búsqueda" no revive ni escribe resultados viejos', () => {
  const { db, U } = fresh();
  const vic = U('Victor');
  const t = dm.createIncident(db, U('Fatima'), { type: 'inbound', code: 'MX-1234567' });
  const job = worker.claim(db);
  dm.research(db, vic, t.id, 'MX-7654321');
  worker.failJob(db, job, 'timeout');
  const jobs = db.prepare('SELECT query_code, status FROM enrichment_jobs ORDER BY id').all().map(j => [j.query_code, j.status]);
  assert.deepEqual(jobs, [['MX-1234567', 'cancelled'], ['MX-7654321', 'pending']]);

  // Igual si el trabajo viejo sí encuentra algo: no pisa el ticket.
  const job2 = worker.claim(db);
  dm.research(db, vic, t.id, 'MX-2900440');
  assert.equal(worker.finish(db, job2, { source: 'Bringgo', code: 'MX-7654321', fields: [], tried: [] }), false);
  const tk = db.prepare('SELECT code, enr_status, version FROM tickets WHERE id=?').get(t.id);
  assert.equal(tk.code, 'MX-2900440'); assert.equal(tk.enr_status, 'buscando');
  assert.ok(tk.version >= 2, 'research incrementa version');
});

test('reabrir: si el responsable fue dado de baja, el ticket vuelve sin responsable', () => {
  const { db, U } = fresh();
  const sam = U('Samantha M.'), fran = U('Francisco R.'), vic = U('Victor');
  const t = dm.createIncident(db, U('Fatima'), { type: 'producto', code: 'MX-3333333' });
  dm.take(db, sam, t.id); dm.resolve(db, sam, t.id, 'Se encontró en el anaquel B');
  dm.setUserActive(db, fran, sam.id, false);
  const r = dm.reopen(db, vic, t.id);
  assert.equal(r.status, 'Abierto');
  assert.equal(db.prepare('SELECT owner_id FROM tickets WHERE id=?').get(t.id).owner_id, null);
  dm.take(db, vic, t.id); // ya se puede tomar
});

test('retornos: una guía anulada se puede volver a escanear (misma fila, con historial)', () => {
  const { db, U } = fresh();
  RS.ensureTables(db);
  const now = Date.now();
  const s = RS.scan(db, U('Adrian'), { guide: 'JMX000123456789' }, now);
  RS.voidScan(db, U('Victor'), s.id, 'Se escaneó antes de recibirlo', now + 1);
  const again = RS.scan(db, U('Josué'), { guide: 'JMX000123456789' }, now + 2);
  assert.equal(again.id, s.id); assert.equal(again.status, 'registrado'); assert.equal(again.carrier, 'J&T');
  assert.throws(() => RS.scan(db, U('Adrian'), { guide: 'JMX000123456789' }, now + 3), /Guía repetida/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM return_events WHERE scan_id=?').get(s.id).n, 3);
});

test('servidor: cookie mal codificada no rompe la sesión; eventos usan el reloj del servidor; limpieza de sesiones', async () => {
  const { db, pins, dir } = fresh();
  let clock = Date.now() + 5 * D;
  const app = createApp(db, { now: () => clock, evidenceDir: path.join(dir, 'ev') });
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const lg = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Victor', pin: pins.Victor }) });
    const sid = lg.headers.get('set-cookie').match(/sid=([^;]+)/)[1];
    const call = (m, u, b) => fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: `otro=%E0%A4%A; sid=${sid}` }, body: b ? JSON.stringify(b) : undefined });
    assert.equal((await call('GET', '/api/me')).status, 200);

    const t = (await (await call('POST', '/api/incidents', { type: 'producto', code: 'MX-4444444' })).json());
    await call('POST', `/api/tickets/${t.id}/location`, { location: 'A-01' });
    const ev = db.prepare("SELECT created_at FROM ticket_events WHERE ticket_id=? AND kind='ubicacion'").get(t.id);
    assert.equal(ev.created_at, clock);

    // Nombres inventados no llenan la tabla de intentos fallidos.
    await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'nadie-' + Math.random(), pin: '0000' }) });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM login_failures').get().n, 0);
  } finally { server.close(); }
  purgeSessions(db, clock + 15 * 3600e3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
});

test('bandeja: "resolved_by_id" correcto con la consulta por lote', () => {
  const { db, U } = fresh();
  const sam = U('Samantha M.'), vic = U('Victor');
  const a = dm.createIncident(db, U('Fatima'), { type: 'producto', code: 'MX-5555551' });
  const b = dm.createIncident(db, U('Fatima'), { type: 'producto', code: 'MX-5555552' });
  dm.quickResolve(db, sam, a.id, 1000); dm.quickResolve(db, vic, b.id, 2000);
  dm.reopen(db, vic, a.id, 3000); dm.quickResolve(db, vic, a.id, 4000);
  assert.deepEqual(dm.resolversOf(db, [a.id, b.id]), { [a.id]: vic.id, [b.id]: vic.id });
  assert.equal(dm.resolverOf(db, a.id), vic.id);
});
