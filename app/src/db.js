// Base de datos SQLite (módulo integrado de Node, sin dependencias nativas).
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const H = 3600e3, D = 24 * H;

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

// Transacción simple (node:sqlite no trae helper).
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { open, tx, DATA_DIR, H, D };
