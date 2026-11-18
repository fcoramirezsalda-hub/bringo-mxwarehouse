// Base de datos SQLite (módulo integrado de Node, sin dependencias nativas).
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const os = require('os');

// Los datos viven FUERA de la carpeta del programa, para que actualizar o reemplazar el código
// (git pull, bajar un ZIP nuevo, reinstalar) nunca los borre.
//   Windows: C:\ProgramData\MX Wharehouse\{data, respaldos, perfil-agente}
//   Otros:   ~/.mx-wharehouse/{data, respaldos, perfil-agente}
// DATA_DIR (variable de entorno) sigue mandando si está definida.
const BASE_DIR = process.env.DATA_DIR ? path.dirname(path.resolve(process.env.DATA_DIR))
  : process.platform === 'win32' ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'MX Wharehouse')
  : path.join(os.homedir(), '.mx-wharehouse');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(BASE_DIR, 'data');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(BASE_DIR, 'respaldos');
const LEGACY_DATA = path.join(__dirname, '..', 'data'); // ubicación anterior (dentro del programa, hasta v0.8.0)
const LEGACY_PROFILE = path.join(__dirname, '..', 'perfil-agente');
const H = 3600e3, D = 24 * H;

// Copia (no mueve ni borra) los datos de la ubicación anterior la primera vez que corre esta versión.
function migrateLegacy(from = LEGACY_DATA, to = DATA_DIR) {
  try {
    if (!fs.existsSync(path.join(from, 'incidencias.db')) || fs.existsSync(path.join(to, 'incidencias.db'))) return false;
    fs.mkdirSync(to, { recursive: true });
    fs.cpSync(from, to, { recursive: true, force: false });
    fs.writeFileSync(path.join(from, 'LEEME-DATOS-MOVIDOS.txt'),
      `Desde la v0.9.0 los datos se usan en:\r\n  ${to}\r\nEsta carpeta es la copia anterior; ya no se actualiza. No la borres hasta comprobar que todo está en la nueva ubicación.\r\n`);
    console.error('Datos copiados de ' + from + ' a ' + to);
    return true;
  } catch (e) { console.error('No se pudieron copiar los datos anteriores: ' + e.message); return false; }
}
if (!process.env.DATA_DIR) migrateLegacy();

// Perfil del navegador del agente (sesión de Bringgo/EasyShip): también fuera del programa.
function agentProfile() {
  if (process.env.AGENT_PROFILE) return process.env.AGENT_PROFILE;
  const p = path.join(BASE_DIR, 'perfil-agente');
  if (!fs.existsSync(p) && fs.existsSync(LEGACY_PROFILE)) {
    try { fs.cpSync(LEGACY_PROFILE, p, { recursive: true }); }
    catch (e) { console.error('No se pudo copiar el perfil del agente; se usa el anterior: ' + e.message); return LEGACY_PROFILE; }
  }
  return p;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('op','admin')),
  dept TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  perms TEXT NOT NULL DEFAULT '[]',
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_failures (name TEXT PRIMARY KEY, count INTEGER NOT NULL, last_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  code TEXT,                 -- MX-/ES- (NULL si aún no se conoce)
  trk TEXT,                  -- guía escaneada
  plat TEXT,                 -- MX | ES | NULL
  nolabel INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  other_text TEXT,
  description TEXT,
  status TEXT NOT NULL,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  reporter_dept TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id),
  waiting_dept TEXT,
  location TEXT,
  created_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  dup_confirmed_by INTEGER REFERENCES users(id),
  dup_confirmed_at INTEGER,
  dup_due_at INTEGER,
  resolution TEXT,
  resolved_at INTEGER,
  discarded_by INTEGER REFERENCES users(id),
  discarded_at INTEGER,
  discard_reason TEXT,
  status_before_discard TEXT,
  late_flagged_at INTEGER,
  dispose_scheduled_at INTEGER,
  dispose_done_at INTEGER,
  damage_outcome TEXT,
  enr_status TEXT NOT NULL DEFAULT 'na',   -- na | buscando | lista | sin | error
  enr_source TEXT,
  enr_data TEXT,
  enr_at INTEGER,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tickets_code ON tickets(code);
CREATE INDEX IF NOT EXISTS tickets_trk ON tickets(trk);
CREATE INDEX IF NOT EXISTS tickets_status ON tickets(status);
CREATE TABLE IF NOT EXISTS ticket_events (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  actor_id INTEGER REFERENCES users(id),
  actor_label TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  tag TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_evidence (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  file_name TEXT NOT NULL,
  stored_as TEXT NOT NULL,
  mime TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'general',
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  query_code TEXT,
  query_trk TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed | cancelled
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  locked_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_heartbeat (id INTEGER PRIMARY KEY CHECK (id = 1), at INTEGER NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS job_runs (id INTEGER PRIMARY KEY, job TEXT NOT NULL, at INTEGER NOT NULL, changes INTEGER NOT NULL);
`;

function open(file) {
  if (!file) { fs.mkdirSync(DATA_DIR, { recursive: true }); file = path.join(DATA_DIR, 'incidencias.db'); }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

// Respaldo en caliente de la base (VACUUM INTO: copia consistente aunque el servidor esté trabajando).
// Guarda los últimos KEEP respaldos. Las evidencias (fotos) no entran: viven en data\\evidencias.
function backup(db, { dir = BACKUP_DIR, keep = 30, now = new Date() } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const p2 = n => String(n).padStart(2, '0');
  const name = `incidencias-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}_${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}.db`;
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return file;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = fs.readdirSync(dir).filter(f => /^incidencias-.*\.db$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) fs.unlinkSync(path.join(dir, f)); // solo copias de respaldo viejas, nunca la base
  return file;
}

// Transacción simple (node:sqlite no trae helper).
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { open, tx, backup, agentProfile, migrateLegacy, DATA_DIR, BASE_DIR, BACKUP_DIR, H, D };
