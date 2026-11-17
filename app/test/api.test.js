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

test('código tecleado sin MX/ES: se acepta, se agrupa y el agente completa el prefijo', async () => {
  const fat = await login('Fatima'), fra = await login('Francisco R.');
  const a = await fat('POST', '/api/incidents', { type: 'producto', code: '4748635' });
  assert.strictEqual(a.status, 200); assert.strictEqual(a.body.appended, false);
  const chk = await fat('GET', '/api/incidents/check?code=ES-4748635');
  assert.strictEqual(chk.body.length, 1, 'ES-4748635 encuentra el ticket del número solo');
  const b = await fat('POST', '/api/incidents', { type: 'producto', code: 'ES-4748635' });
  assert.strictEqual(b.body.appended, true); assert.strictEqual(b.body.id, a.body.id);
  const n = await fat('POST', '/api/incidents', { type: 'inbound', code: '3999998' });
  db.prepare('UPDATE enrichment_jobs SET next_at=0').run();
  while (await worker.processOne(db, null, worker.fakeLookup)) { /* procesa toda la cola */ }
  const ta = await fra('GET', '/api/tickets/' + a.body.id);
  assert.strictEqual(ta.body.code, 'ES-4748635'); assert.strictEqual(ta.body.plat, 'ES');
  const tn = await fra('GET', '/api/tickets/' + n.body.id);
  assert.strictEqual(tn.body.enr_status, 'sin'); assert.strictEqual(tn.body.code, '3999998', 'sin coincidencias conserva el número');
  assert.strictEqual(tn.body.plat, null);
  const again = await fat('POST', '/api/incidents', { type: 'producto', code: '4748635' });
  assert.strictEqual(again.body.id, a.body.id, 'después de completarse, el número solo sigue agrupando');
});

test('solo quien administra usuarios restablece PIN', async () => {
  const vic = await login('Victor'), fra = await login('Francisco R.');
  assert.strictEqual((await vic('POST', '/api/users/1/pin')).status, 403);
  const r = await fra('POST', '/api/users/1/pin');
  assert.strictEqual(r.status, 200); assert.match(r.body.pin, /^\d{4}$/);
});

test('chat: texto, foto o ambos en un envío; la foto queda como evidencia y no hay tipo de mensaje', async () => {
  const fra = await login('Francisco R.'), fat = await login('Aracely');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const t = await fat('POST', '/api/incidents', { type: 'producto', code: 'MX-3017755' });
  const id = t.body.id;
  assert.strictEqual((await fra('POST', `/api/tickets/${id}/messages`, {})).status, 400, 'vacío se rechaza');
  assert.strictEqual((await fat('POST', `/api/tickets/${id}/messages`, { body: 'hola' })).status, 403, 'operador no usa el chat');
  const a = await fra('POST', `/api/tickets/${id}/messages`, { body: 'Caja abierta, adjunto foto', photo: { name: 'caja.png', data: png }, tag: 'Instrucción del equipo turco' });
  assert.strictEqual(a.status, 200); assert.ok(a.body.evidence_id);
  const b = await fra('POST', `/api/tickets/${id}/messages`, { photo: { name: 'etiqueta.png', data: png } });
  assert.strictEqual(b.status, 200);
  const c = await fra('POST', `/api/tickets/${id}/messages`, { photo: { name: 'x.gif', data: 'data:image/gif;base64,R0lGOD' } });
  assert.strictEqual(c.status, 400, 'formato no permitido');
  const d = await fra('GET', '/api/tickets/' + id);
  assert.strictEqual(d.body.messages.length, 1);
  assert.strictEqual(d.body.messages[0].tag, 'Mensaje', 'el tipo enviado se ignora');
  assert.strictEqual(d.body.evidence.length, 2);
  const img = await fetch(base + '/api/evidence/' + a.body.evidence_id, { headers: { Cookie: '' } });
  assert.strictEqual(img.status, 401, 'la foto no se ve sin sesión');
});

test('equipo de retornos registra incidencias pero no ve tickets', async () => {
  for (const n of ['Adrian', 'Josué']) assert.ok(pins[n], n + ' debe existir');
  const isa = await login('Josué');
  const me = await isa('GET', '/api/me');
  assert.strictEqual(me.body.role, 'op'); assert.strictEqual(me.body.dept, 'Retornos'); assert.deepStrictEqual(me.body.perms, []);
  const r = await isa('POST', '/api/incidents', { type: 'producto', code: 'MX-4100001' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await isa('GET', '/api/tickets')).status, 403);
  assert.strictEqual((await isa('POST', '/api/users', { name: 'Otro', profile: 'operacion' })).status, 403);
});

test('Isaac es operador de Operación y Janneth es de Customer Service', async () => {
  const isa = await (await login('Isaac'))('GET', '/api/me');
  assert.strictEqual(isa.body.role, 'op'); assert.strictEqual(isa.body.dept, 'Operación'); assert.deepStrictEqual(isa.body.perms, []);
  const jan = await login('Janneth'); const j = await jan('GET', '/api/me');
  assert.strictEqual(j.body.role, 'admin'); assert.strictEqual(j.body.dept, 'Customer Service');
  assert.deepStrictEqual(j.body.perms.sort(), ['confirmdup', 'resolve', 'take']);
  assert.strictEqual((await jan('GET', '/api/tickets')).status, 200);
  assert.strictEqual((await jan('POST', '/api/users', { name: 'X', profile: 'operacion' })).status, 403);
});

test('alta, baja y reactivación de usuarios (solo con permiso)', async () => {
  const fr = await login('Francisco R.'), vic = await login('Victor');
  assert.strictEqual((await vic('POST', '/api/users', { name: 'Luis', profile: 'retornos' })).status, 403, 'Victor no administra usuarios');
  const c = await fr('POST', '/api/users', { name: '  Luis  ', profile: 'retornos' });
  assert.strictEqual(c.status, 200); assert.match(c.body.pin, /^\d{4}$/);
  assert.strictEqual((await fr('POST', '/api/users', { name: 'luís', profile: 'operacion' })).status, 409, 'nombre repetido sin importar acentos');
  assert.strictEqual((await fr('POST', '/api/users', { name: 'Ana', profile: 'superadmin' })).status, 400);
  pins.Luis = c.body.pin;
  const luis = await login('Luis');
  assert.strictEqual((await luis('GET', '/api/me')).body.dept, 'Retornos');

  // Un ticket tomado por alguien que se da de baja vuelve a quedar sin responsable.
  const sam = await login('Samantha M.');
  const t = await luis('POST', '/api/incidents', { type: 'producto', code: 'MX-4100002' });
  assert.strictEqual((await sam('POST', `/api/tickets/${t.body.id}/take`)).status, 200);
  const samId = (await sam('GET', '/api/me')).body.id;
  const b = await fr('POST', `/api/users/${samId}/active`, { active: false });
  assert.strictEqual(b.status, 200); assert.strictEqual(b.body.released, 1);
  assert.strictEqual((await sam('GET', '/api/me')).status, 401, 'la sesión se cierra');
  const det = await fr('GET', `/api/tickets/${t.body.id}`);
  assert.strictEqual(det.body.ticket ? det.body.ticket.owner_id : det.body.owner_id, null);
  const names = (await (await fetch(base + '/api/login-users')).json()).map(u => u.name);
  assert.ok(!names.includes('Samantha M.'));

  assert.strictEqual((await fr('POST', `/api/users/${samId}/active`, { active: 'true' })).status, 400, 'active debe ser booleano');
  const frId = (await fr('GET', '/api/me')).body.id;
  assert.strictEqual((await fr('POST', `/api/users/${frId}/active`, { active: false })).status, 400, 'no se puede dar de baja a sí mismo');
  assert.strictEqual((await fr('POST', `/api/users/${samId}/active`, { active: true })).status, 200);
  await login('Samantha M.');
  const all = (await fr('GET', '/api/users')).body;
  assert.ok(all.find(u => u.name === 'Samantha M.').active);
});

test('setup agrega solo a quien falta y reconoce "Josue" como "Josué"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mxw-seed-'));
  const d2 = open(path.join(dir, 's.db'));
  const { hashPin } = require('../src/pin');
  d2.prepare("INSERT INTO users (name, role, dept, title, perms, pin_hash) VALUES ('Josue','op','Operación','Retornos y apoyo','[]',?)").run(hashPin('0000'));
  const p = seed(d2, true);
  assert.ok(p.Isaac && !p['Josué'] && !p.Josue);
  assert.strictEqual(seed(d2, true), null);
});

test('bandeja: búsqueda por código (con o sin prefijo) o guía, en todos los estados', async () => {
  const sam = await login('Samantha M.'), op = await login('Aracely');
  const a = await op('POST', '/api/incidents', { type: 'producto', code: 'ES-4791234' });
  const g = await op('POST', '/api/incidents', { type: 'inbound', trk: '1Z77AA10123499999' });
  const ids = r => r.body.map(t => t.id);
  assert.ok(ids(await sam('GET', '/api/tickets?q=4791234')).includes(a.body.id), 'número sin prefijo');
  assert.ok(ids(await sam('GET', '/api/tickets?q=es-4791234')).includes(a.body.id), 'con prefijo en minúsculas');
  assert.ok(ids(await sam('GET', '/api/tickets?q=10123499999')).includes(g.body.id), 'parte de la guía');
  assert.ok(ids(await sam('GET', '/api/tickets?q=4201000099991Z77AA10123499999')).includes(g.body.id), 'código de barras largo que contiene la guía');
  await sam('POST', `/api/tickets/${a.body.id}/quick-resolve`);
  assert.ok(ids(await sam('GET', '/api/tickets?q=4791234&status=abiertos')).includes(a.body.id), 'la búsqueda ignora el filtro de estado');
  assert.strictEqual((await sam('GET', '/api/tickets?q=47')).status, 400, 'mínimo 4 caracteres');
  assert.deepStrictEqual((await sam('GET', '/api/tickets?q=%25%25%25%25')).body, [], 'comodines escapados');
  assert.strictEqual((await op('GET', '/api/tickets?q=4791234')).status, 403, 'operador no ve la bandeja');
});

test('resolución rápida: un clic, toma si no tiene responsable, respeta al responsable y queda en Resueltos', async () => {
  const sam = await login('Samantha M.'), pam = await login('Pamela V.'), vic = await login('Victor'), op = await login('Aracely');
  const mk = async c => (await op('POST', '/api/incidents', { type: 'producto', code: c })).body.id;
  const a = await mk('MX-3021001'), b = await mk('MX-3021002'), c = await mk('MX-3021003');
  assert.strictEqual((await op('POST', `/api/tickets/${a}/quick-resolve`)).status, 403, 'operador no resuelve');
  const r = await sam('POST', `/api/tickets/${a}/quick-resolve`);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.status, 'Resuelto');
  const d = (await sam('GET', '/api/tickets/' + a)).body;
  assert.strictEqual(d.owner, 'Samantha M.'); assert.strictEqual(d.resolution, dm.QUICK_TEXT); assert.ok(d.resolved_at);
  assert.ok(d.events.some(e => e.kind === 'resolucion' && e.who === 'Samantha M.'));
  assert.ok(d.events.some(e => e.kind === 'asignacion' && e.text === 'Tomó el ticket'));
  assert.ok((await sam('GET', '/api/tickets?status=resueltos')).body.some(t => t.id === a), 'aparece en Resueltos');
  assert.strictEqual((await sam('POST', `/api/tickets/${a}/quick-resolve`)).status, 409, 'no se resuelve dos veces');
  await sam('POST', `/api/tickets/${b}/take`);
  assert.strictEqual((await pam('POST', `/api/tickets/${b}/quick-resolve`)).status, 403, 'CS no pisa el ticket de otra persona');
  assert.strictEqual((await vic('POST', `/api/tickets/${b}/quick-resolve`)).status, 200, 'Victor (transferir) sí puede');
  assert.strictEqual((await sam('GET', '/api/tickets/' + b)).body.owner, 'Samantha M.', 'el responsable no cambia');
  await pam('POST', `/api/tickets/${c}/take`);
  assert.strictEqual((await pam('POST', `/api/tickets/${c}/quick-resolve`)).status, 200, 'el responsable resuelve el suyo');
});

test('reabrir: quien resolvió o quien tiene permiso de restaurar; la resolución anterior queda en el historial', async () => {
  const sam = await login('Samantha M.'), pam = await login('Pamela V.'), vic = await login('Victor'), op = await login('Aracely');
  const id = (await op('POST', '/api/incidents', { type: 'producto', code: 'MX-3022001' })).body.id;
  assert.strictEqual((await sam('POST', `/api/tickets/${id}/reopen`)).status, 409, 'abierto no se reabre');
  await sam('POST', `/api/tickets/${id}/quick-resolve`);
  assert.strictEqual((await sam('GET', '/api/tickets/' + id)).body.resolved_by_id > 0, true);
  assert.strictEqual((await op('POST', `/api/tickets/${id}/reopen`)).status, 403, 'operador no');
  assert.strictEqual((await pam('POST', `/api/tickets/${id}/reopen`)).status, 403, 'otra persona de CS no');
  const r = await sam('POST', `/api/tickets/${id}/reopen`);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.status, 'En gestión', 'vuelve con su responsable');
  const d = (await sam('GET', '/api/tickets/' + id)).body;
  assert.strictEqual(d.resolution, null); assert.strictEqual(d.owner, 'Samantha M.');
  assert.ok(d.events.some(e => e.text.startsWith('Reabrió el ticket (resolución anterior: ' + dm.QUICK_TEXT)));
  await sam('POST', `/api/tickets/${id}/quick-resolve`);
  assert.strictEqual((await vic('POST', `/api/tickets/${id}/reopen`)).status, 200, 'Victor (restaurar) sí');
  assert.ok((await sam('GET', '/api/tickets?status=abiertos')).body.some(t => t.id === id), 'vuelve a Abiertos');
});
