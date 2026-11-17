// Crea la base de datos y los usuarios del equipo. Imprime un PIN inicial para cada persona (solo esta vez).
// Uso: npm run setup        (si ya hay usuarios, solo agrega a las personas de TEAM que falten; no cambia a nadie más)
const { open } = require('./db');
const { hashPin, newPin } = require('./pin');
const { findByName } = require('./domain');

const ALL = ['take', 'transfer', 'resolve', 'confirmdup', 'discard', 'restore', 'dispose', 'users'];
const TEAM = [
  ['Fatima', 'op', 'Operación', 'Procesadora de paquetes', []],
  ['Mauricio', 'op', 'Operación', 'Procesador de paquetes', []],
  ['Aracely', 'op', 'Operación', 'Procesadora de paquetes', []],
  ['Michelle', 'op', 'Operación', 'Procesadora de paquetes', []],
  // Equipo de retornos: solo registra incidencias, sin permisos de CS ni de Victor.
  ['Isaac', 'op', 'Retornos', 'Equipo de retornos', []],
  ['Adrian', 'op', 'Retornos', 'Equipo de retornos', []],
  ['Josué', 'op', 'Retornos', 'Equipo de retornos', []],
  ['Victor', 'admin', 'Procesamiento', 'Resuelve incidencias', ALL.filter(p => p !== 'users')],
  ['Francisco R.', 'admin', 'Customer Service', 'Customer Service · administrador del sistema', ALL],
  ['Samantha M.', 'admin', 'Customer Service', 'Customer Service', ['take', 'resolve', 'confirmdup']],
  ['Pamela V.', 'admin', 'Customer Service', 'Customer Service', ['take', 'resolve', 'confirmdup']],
  ['Rachel', 'admin', 'Customer Service', 'Customer Service', ['take', 'resolve', 'confirmdup']],
];

function seed(db, quiet = false) {
  const pins = {};
  const ins = db.prepare('INSERT INTO users (name, role, dept, title, perms, pin_hash) VALUES (?,?,?,?,?,?)');
  // "Josue" ya existente cuenta como "Josué": se compara sin acentos ni mayúsculas. Los dados de baja no se reactivan.
  for (const [name, role, dept, title, perms] of TEAM) {
    if (findByName(db, name)) continue;
    const pin = newPin(); pins[name] = pin; ins.run(name, role, dept, title, JSON.stringify(perms), hashPin(pin));
  }
  if (!Object.keys(pins).length) { if (!quiet) console.log('Todo el equipo ya existe; no se cambió nada.'); return null; }
  if (!quiet) {
    console.log('Usuarios creados. Entrega a cada persona su PIN (no se vuelve a mostrar; Francisco R. puede restablecerlo):\n');
    for (const [n, p] of Object.entries(pins)) console.log(`  ${n.padEnd(14)} ${p}`);
  }
  return pins;
}

if (require.main === module) seed(open());
module.exports = { seed, TEAM };
