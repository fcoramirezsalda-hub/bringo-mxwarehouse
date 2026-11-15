// Pruebas del servidor: registro, anti-duplicado, permisos, toma atómica, plazos, descartes y agente (modo de prueba).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os'), fs = require('fs'), path = require('path');
const { open } = require('../src/db');
const { seed } = require('../src/setup');
const { createApp } = require('../src/server');
const dm = require('../src/domain');
const worker = require('../src/worker');

let db, server, base, pins, clock = Date.now();
const D = 24 * 3600e3;

async function login(name) {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pin: pins[name] }) });
  assert.strictEqual(r.status, 200, name + ' no pudo entrar');
  const sid = r.headers.get('set-cookie').match(/sid=([^;]+)/)[1];
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Cookie: 'sid=' + sid }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mxw-'));
  db = open(path.join(dir, 'test.db'));
  pins = seed(db, true);
  const app = createApp(db, { now: () => clock, evidenceDir: path.join(dir, 'ev') });
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('login rechaza PIN incorrecto y bloquea tras 5 intentos', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Adrian', pin: 'xxxx' }) });
    assert.strictEqual(r.status, 401);
  }
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Adrian', pin: pins.Adrian }) });
  assert.strictEqual(r.status, 429);
});

test('operador registra por código y por guía; anti-duplicado agrega al expediente', async () => {
  const fat = await login('Fatima');
  const a = await fat('POST', '/api/incidents', { type: 'producto', code: 'mx 3015532' });
  assert.strictEqual(a.status, 200); assert.strictEqual(a.body.appended, false);
  const b = await fat('POST', '/api/incidents', { type: 'producto', code: 'MX-3015532' });
  assert.strictEqual(b.body.appended, true); assert.strictEqual(b.body.id, a.body.id);
  const c = await fat('POST', '/api/incidents', { type: 'inbound', trk: '1Z999AA10123456784' });
  assert.strictEqual(c.body.appended, false);
  const bad = await fat('POST', '/api/incidents', { type: 'producto', code: '12345' });
  assert.strictEqual(bad.status, 400);
  const otro = await fat('POST', '/api/incidents', { type: 'otro', code: 'MX-3015599' });
  assert.strictEqual(otro.status, 400, '"Otro" exige especificar');
  const nl = await fat('POST', '/api/incidents', { type: 'sinetiqueta', nolabel: true, description: 'Lámpara LED negra' });
  assert.strictEqual(nl.status, 200);
  const dmg = await fat('POST', '/api/incidents', { type: 'danado', code: 'ES-118412' });
  assert.strictEqual(dmg.body.status, 'Enviado dañado');
});

test('operadores no ven ni gestionan tickets', async () => {
  const fat = await login('Fatima');
  assert.strictEqual((await fat('GET', '/api/tickets')).status, 403);
  assert.strictEqual((await fat('POST', '/api/tickets/1/take')).status, 403);
  assert.strictEqual((await fat('GET', '/api/tickets/1')).status, 403);
  const mine = await fat('GET', '/api/my-reports');
  assert.ok(mine.body.length >= 3);
});

test('tomar ticket es atómico: el segundo recibe 409', async () => {
  const vic = await login('Victor'), sam = await login('Samantha M.');
  const [r1, r2] = await Promise.all([vic('POST', '/api/tickets/1/take'), sam('POST', '/api/tickets/1/take')]);
  const codes = [r1.status, r2.status].sort();
  assert.deepStrictEqual(codes, [200, 409]);
  const t = await vic('GET', '/api/tickets/1');
  assert.ok(t.body.owner); assert.ok(t.body.events.some(e => e.text === 'Tomó el ticket'));
});

test('resolver exige ser responsable; descartar exige permiso y justificación', async () => {
  const vic = await login('Victor'), rac = await login('Rachel');
  const t = await vic('GET', '/api/tickets/1'); const ownerIsVictor = t.body.owner === 'Victor';
  const other = ownerIsVictor ? rac : vic;
  assert.strictEqual((await other('POST', '/api/tickets/1/resolve', { resolution: 'Se recibió el producto correcto' })).status, 403);
  assert.strictEqual((await rac('POST', '/api/tickets/2/discard', { reason: 'Reportado por error en piso', confirm: true })).status, 403);
  assert.strictEqual((await vic('POST', '/api/tickets/2/discard', { reason: 'corto', confirm: true })).status, 400);
  assert.strictEqual((await vic('POST', '/api/tickets/2/discard', { reason: 'Reportado por error en piso', confirm: false })).status, 400);
  assert.strictEqual((await vic('POST', '/api/tickets/2/discard', { reason: 'Reportado por error en piso', confirm: true })).status, 200);
  assert.strictEqual((await vic('GET', '/api/discarded')).body.length, 1);
  assert.strictEqual((await rac('POST', '/api/tickets/2/restore')).status, 403);
  assert.strictEqual((await vic('POST', '/api/tickets/2/restore')).status, 200);
});

test('plazos: retraso a 3 días y duplicado a Dispose programado a 10 días, sin repetir', async () => {
  const mau = await login('Mauricio'); let vic = await login('Victor');
  const d = await mau('POST', '/api/incidents', { type: 'duplicado', code: 'MX-3011450' });
  await vic('POST', `/api/tickets/${d.body.id}/confirm-dup`);
  clock += 4 * D;
  const n1 = dm.runDeadlines(db, clock);
  assert.ok(n1 >= 1, 'marca retrasos');
  assert.strictEqual(dm.runDeadlines(db, clock), 0, 'no repite');
  clock += 7 * D;
  dm.runDeadlines(db, clock);
  assert.strictEqual((await vic('GET', '/api/me')).status, 401, 'la sesión vence a las 14 h');
  vic = await login('Victor');
  const t = await vic('GET', '/api/tickets/' + d.body.id);
  assert.strictEqual(t.body.status, 'Dispose programado');
  assert.strictEqual((await vic('POST', `/api/tickets/${d.body.id}/dispose-done`, { evidence_id: 999 })).status, 400, 'exige evidencia');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ev = await vic('POST', `/api/tickets/${d.body.id}/evidence`, { name: 'dispose.png', data: png, purpose: 'dispose' });
  assert.strictEqual(ev.status, 200);
  assert.strictEqual((await vic('POST', `/api/tickets/${d.body.id}/dispose-done`, { evidence_id: ev.body.id })).status, 200);
});

test('agente (modo de prueba) llena la información de la orden o marca sin coincidencias', async () => {
  const mic = await login('Michelle'), fra = await login('Francisco R.');
  const a = await mic('POST', '/api/incidents', { type: 'producto', trk: '191255213580' });
  const b = await mic('POST', '/api/incidents', { type: 'producto', code: 'MX-3999999' });
  db.prepare('UPDATE enrichment_jobs SET next_at=0').run();
  while (await worker.processOne(db, null, worker.fakeLookup)) { /* procesa toda la cola */ }
  const ta = await fra('GET', '/api/tickets/' + a.body.id);
  assert.strictEqual(ta.body.enr_status, 'lista');
  assert.strictEqual(ta.body.code, 'MX-2900440', 'completa el MX desde la guía');
  const tb = await fra('GET', '/api/tickets/' + b.body.id);
  assert.strictEqual(tb.body.enr_status, 'sin');
  const st = await fra('GET', '/api/agent-status');
  assert.strictEqual(st.status, 200);
});

test('solo quien administra usuarios restablece PIN', async () => {
  const vic = await login('Victor'), fra = await login('Francisco R.');
  assert.strictEqual((await vic('POST', '/api/users/1/pin')).status, 403);
  const r = await fra('POST', '/api/users/1/pin');
  assert.strictEqual(r.status, 200); assert.match(r.body.pin, /^\d{4}$/);
});
