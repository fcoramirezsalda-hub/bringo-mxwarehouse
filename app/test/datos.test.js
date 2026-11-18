// Los datos no deben perderse al actualizar o reemplazar la carpeta del programa.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { open, backup, migrateLegacy } = require('../src/db');

const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('por defecto los datos viven fuera de la carpeta del programa', () => {
  const env = { ...process.env }; delete env.DATA_DIR;
  const out = execFileSync(process.execPath, ['--no-warnings', '-e', "const d=require('./src/db');console.log(JSON.stringify([d.DATA_DIR,d.BACKUP_DIR]))"],
    { cwd: path.join(__dirname, '..'), env: { ...env, HOME: tmp('mxw-home-'), ProgramData: tmp('mxw-pd-') } }).toString();
  const app = path.resolve(__dirname, '..');
  for (const d of JSON.parse(out)) assert.ok(!path.resolve(d).startsWith(app + path.sep), d + ' está dentro de ' + app);
});

test('copia los datos de la ubicación anterior sin borrarlos y no pisa datos existentes', () => {
  const from = tmp('mxw-old-'), to = path.join(tmp('mxw-new-'), 'data');
  const db = open(path.join(from, 'incidencias.db'));
  db.exec("INSERT INTO users (name, role, dept, title, perms, pin_hash) VALUES ('Prueba','op','Operación','x','[]','h')"); db.close();
  fs.mkdirSync(path.join(from, 'evidencias', '1'), { recursive: true }); fs.writeFileSync(path.join(from, 'evidencias', '1', 'f.jpg'), 'x');
  assert.strictEqual(migrateLegacy(from, to), true);
  assert.ok(fs.existsSync(path.join(from, 'incidencias.db')), 'el original sigue ahí');
  assert.ok(fs.existsSync(path.join(to, 'evidencias', '1', 'f.jpg')));
  const n = open(path.join(to, 'incidencias.db'));
  assert.strictEqual(n.prepare('SELECT name FROM users').get().name, 'Prueba');
  n.exec("INSERT INTO users (name, role, dept, title, perms, pin_hash) VALUES ('Nueva','op','Operación','x','[]','h')"); n.close();
  assert.strictEqual(migrateLegacy(from, to), false, 'segunda vez no hace nada');
  assert.strictEqual(open(path.join(to, 'incidencias.db')).prepare('SELECT COUNT(*) n FROM users').get().n, 2);
});

test('respaldo legible y solo guarda los últimos N', () => {
  const dir = tmp('mxw-bk-'), db = open(path.join(tmp('mxw-db-'), 'incidencias.db'));
  db.exec("INSERT INTO users (name, role, dept, title, perms, pin_hash) VALUES ('Prueba','op','Operación','x','[]','h')");
  let last;
  for (let i = 0; i < 5; i++) last = backup(db, { dir, keep: 3, now: new Date(2026, 10, 18, 10, i) });
  const files = fs.readdirSync(dir).sort();
  assert.strictEqual(files.length, 3);
  assert.strictEqual(path.basename(last), files[2]);
  assert.strictEqual(open(last).prepare('SELECT name FROM users').get().name, 'Prueba');
});
