const test = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('../src/db');
const { seed } = require('../src/setup');
const { createApp } = require('../src/server');
const { createReturns, normRow } = require('../src/returns');

async function start(opts) {
  const db = open(':memory:'); const pins = seed(db, true);
  const server = createApp(db, opts).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const login = async name => (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pin: pins[name] }) })).headers.get('set-cookie').split(';')[0];
  const req = async (cookie, path, body) => { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };
  const stop = async () => { await new Promise(r => server.close(r)); db.close(); };
  return { db, base, login, req, stop };
}

test('retornos desactivado por defecto: sin menú ni datos ficticios', async () => {
  const old = process.env.RETURNS_MODE; delete process.env.RETURNS_MODE;
  const s = await start();
  try {
    const admin = await s.login('Francisco R.');
    assert.equal((await s.req(admin, '/api/me')).body.returns_mode, 'off');
    assert.equal((await s.req(admin, '/api/returns')).status, 404);
    assert.equal((await s.req(admin, '/api/returns/demo-1/ticket', {})).status, 404);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM tickets').get().n, 0);
  } finally { await s.stop(); if (old !== undefined) process.env.RETURNS_MODE = old; }
});

test('retornos demo: sesión, permisos, estados y ticket idempotente', async () => {
  const s = await start({ returns: createReturns({ mode: 'demo' }) });
  try {
    assert.equal((await fetch(s.base + '/api/returns')).status, 401);
    const op = await s.login('Fatima'), admin = await s.login('Francisco R.');
    assert.equal((await s.req(op, '/api/me')).body.returns_mode, 'demo');
    assert.equal((await s.req(op, '/api/returns')).body.mode, 'demo');
    assert.equal((await s.req(op, '/api/returns/demo-1/status', { status: 'cerrado' })).status, 403);
    assert.equal((await s.req(op, '/api/returns/demo-1/ticket', {})).status, 403);
    assert.equal((await s.req(admin, '/api/returns/demo-1/status', { status: 'invalido' })).status, 400);
    assert.equal((await s.req(admin, '/api/returns/no-existe/ticket', {})).status, 404);
    assert.equal((await s.req(admin, '/api/returns/demo-1/status', { status: 'acomodado' })).status, 200);
    const a = await s.req(admin, '/api/returns/demo-1/ticket', {});
    const evs = s.db.prepare('SELECT COUNT(*) n FROM ticket_events').get().n;
    const b = await s.req(admin, '/api/returns/demo-1/ticket', {});
    assert.equal(a.status, 200); assert.equal(a.body.appended, false);
    assert.equal(a.body.id, b.body.id); assert.equal(b.body.appended, true);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM tickets').get().n, 1);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ticket_events').get().n, evs, 'repetir no agrega eventos');
    assert.equal(s.db.prepare("SELECT COUNT(*) n FROM ticket_events WHERE kind='retorno'").get().n, 1);
    // Otro retorno distinto crea su propio ticket.
    const c = await s.req(admin, '/api/returns/demo-2/ticket', {});
    assert.notEqual(c.body.id, a.body.id);
  } finally { await s.stop(); }
});

test('Site sin sesión falla explícitamente y no usa demo como sustituto', async () => {
  const old = process.env.RETURNS_SITE_COOKIE; delete process.env.RETURNS_SITE_COOKIE;
  try { await assert.rejects(createReturns({ mode: 'site' }).list(), /Falta configurar/); }
  finally { if (old !== undefined) process.env.RETURNS_SITE_COOKIE = old; }
});

test('Site: filas mal formadas se descartan y no se escribe en el Site', async () => {
  const old = process.env.RETURNS_SITE_COOKIE; process.env.RETURNS_SITE_COOKIE = 'prueba=1';
  const calls = [];
  const request = async (url, init) => { calls.push(init.method); return { ok: true, json: async () => ({ rows: [{ id: 'a', guide: ' 123 456 789 ', carrier: 'FedEx' }, { id: 'b' }, null, { guide: 'X' }] }) }; };
  try {
    const src = createReturns({ mode: 'site', request });
    const l = await src.list();
    assert.deepEqual(l.rows.map(r => [r.id, r.guide]), [['a', '123456789']]);
    await assert.rejects(src.status('a', 'cerrado'), /deshabilitadas/);
    assert.ok(calls.every(m => m === 'GET'));
  } finally { if (old !== undefined) process.env.RETURNS_SITE_COOKIE = old; else delete process.env.RETURNS_SITE_COOKIE; }
});

test('modo desconocido se trata como desactivado', () => {
  assert.equal(createReturns({ mode: 'produccion' }).mode, 'off');
  assert.equal(normRow({ id: 1, guide: 'ABC123' }).carrier, 'Sin paquetería');
});
