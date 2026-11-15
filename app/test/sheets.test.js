// Copia a Google Sheets con un receptor falso que imita al Apps Script (upsert por folio, eventos sin repetir).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os'), fs = require('fs'), path = require('path');
const { open } = require('../src/db');
const { seed } = require('../src/setup');
const dm = require('../src/domain');
const sync = require('../src/sheets-sync');

function fakeSheet(token) {
  const sheet = { tickets: new Map(), events: [], calls: 0, fail: false };
  sheet.fetch = async (url, opts) => {
    sheet.calls++;
    const b = JSON.parse(opts.body);
    if (sheet.fail) throw new Error('sin internet');
    if (b.token !== token) return { status: 200, json: async () => ({ ok: false, error: 'Token incorrecto' }) };
    assert.strictEqual(b.headers.length, b.tickets[0] ? b.tickets[0].length : b.headers.length, 'filas del mismo ancho que encabezados');
    for (const r of b.tickets) sheet.tickets.set(r[0], r);
    const last = sheet.events.length ? Number(sheet.events[sheet.events.length - 1][0]) : 0;
    sheet.events.push(...b.events.filter(e => Number(e[0]) > last));
    return { status: 200, json: async () => ({ ok: true }) };
  };
  return sheet;
}

test('copia tickets nuevos, solo reenvía los que cambian y no repite eventos', async () => {
  const db = open(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mxs-')), 't.db'));
  seed(db, true);
  const fat = db.prepare("SELECT * FROM users WHERE name='Fatima'").get();
  const vic = db.prepare("SELECT * FROM users WHERE name='Victor'").get();
  const cfg = { url: 'https://script.google.com/macros/s/x/exec', token: 'secreto' };
  const sheet = fakeSheet('secreto');

  const a = dm.createIncident(db, fat, { type: 'producto', trk: '9361289717370249512170' });
  dm.createIncident(db, fat, { type: 'otro', code: 'MX-2900440', other_text: 'Caja abierta' });
  let r = await sync.syncOnce(db, cfg, { fetchImpl: sheet.fetch });
  assert.deepStrictEqual([r.tickets, sheet.tickets.size], [2, 2]);
  const row = sheet.tickets.get('INC-0001');
  assert.strictEqual(row[2], '9361289717370249512170', 'la guía larga llega completa como texto');
  assert.strictEqual(row[6], 'Abierto');

  r = await sync.syncOnce(db, cfg, { fetchImpl: sheet.fetch });
  assert.deepStrictEqual([r.tickets, r.events], [0, 0], 'sin cambios no envía nada');

  dm.take(db, vic, a.id);
  r = await sync.syncOnce(db, cfg, { fetchImpl: sheet.fetch });
  assert.strictEqual(r.tickets, 1, 'solo el ticket que cambió');
  assert.strictEqual(sheet.tickets.get('INC-0001')[9], 'Victor');
  const evIds = sheet.events.map(e => e[0]);
  assert.strictEqual(new Set(evIds).size, evIds.length, 'eventos sin duplicar');

  // Error de red: no avanza el estado y se reintenta después.
  dm.setLocation(db, vic, a.id, 'Anaquel A-03');
  sheet.fail = true;
  await assert.rejects(sync.syncOnce(db, cfg, { fetchImpl: sheet.fetch }));
  assert.match(sync.status(db).last_error || '', /sin internet/);
  sheet.fail = false;
  r = await sync.syncOnce(db, cfg, { fetchImpl: sheet.fetch });
  assert.strictEqual(r.tickets, 1);
  assert.strictEqual(sheet.tickets.get('INC-0001')[11], 'Anaquel A-03');
  assert.strictEqual(sync.status(db).last_error, null);

  // Token incorrecto: error claro.
  dm.setLocation(db, vic, a.id, 'A-04');
  await assert.rejects(sync.syncOnce(db, { ...cfg, token: 'otro' }, { fetchImpl: sheet.fetch }), /Token incorrecto/);
});
