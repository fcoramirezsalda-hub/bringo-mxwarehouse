// Detección de paquetería por número de guía. Port del Apps Script "Escaneo Retornos — Eyoyo" (hoja "Escaneo de Retornos"),
// mismo orden de prioridad, mismos umbrales y mismos textos de método, más una mejora:
//   · dígito verificador de FedEx (12 dígitos): si NO cumple, la guía no puede ser FedEx (veto) y es un rasgo más del modelo.
// Prioridad: catálogo → referencias BrinGO/Process → DHL JJD → FedEx FDX1D (34) → FedEx ASTRA (32) → reglas → Naive Bayes → Por identificar.
// Sin dependencias. Funciones puras: no tocan la base de datos.

const CARRIERS = ['FedEx', 'Estafeta', 'PaqueteExpress', 'J&T', 'iMile', 'DHL', 'Correos de Mexico', 'Castores', 'Afimex', 'UPS', 'Cliente / RMA'];
const UNKNOWN = 'Por identificar';
const OPTIONS = [...CARRIERS, UNKNOWN];

// Reglas de la pestaña "Reglas" al 2026-11-17. Se reemplazan por las de la hoja cuando se sincroniza.
const DEFAULT_RULES = [
  ['J&T', '^JMX[0-9]+$'],
  ['DHL', '^J?JD[0-9]+$'],
  ['PaqueteExpress', '^(MTY|MEX|ZMM)[0-9]{2}WE[0-9]+$'],
  ['Correos de Mexico', '^[A-Z]{2}[0-9]{9}MX$'],
  ['Cliente / RMA', '^[0-9A-Z]+RMA$'],
  ['iMile', '^605[0-9]{10}$'],
  ['Afimex', '^[0-9]{8}$'],
  ['Estafeta', '^(?:[0-9]05870980061070[0-9A-Z]{7}|[0-9]{3}9999999[0-9A-Z]{12}|(?:20530029|30558953|55559121)[0-9]{14})$'],
  ['UPS', '^1Z[A-Z0-9]{16}$'],
];

const FDX1D = /^(?:10\d{18}00\d{12}|96\d{32})$/;
const ML_THRESHOLD = 0.98, ML_SUPPORT = 3;

function normalize(v) { return String(v ?? '').replace(/^\]C1/i, '').replace(/[\s\x1d]/g, '').toUpperCase(); }

// Clave anti-duplicado: igual que la columna I "Clave única" de Registro (sin el prefijo "G:").
function dupKey(raw) {
  const g = normalize(raw);
  if (/^JJD/.test(g)) return g.slice(1);
  if (FDX1D.test(g)) { const t = g.slice(20); return t.startsWith('00') ? t.slice(2) : t; }
  return g;
}

// FedEx Express 12 dígitos: pesos 1,3,7 de derecha a izquierda sobre los 11 primeros; (suma mód 11) mód 10 = último dígito.
function fedexCheck(g) {
  if (!/^\d{12}$/.test(g)) return null;
  const w = [1, 3, 7]; let s = 0;
  for (let i = 10, j = 0; i >= 0; i--, j++) s += Number(g[i]) * w[j % 3];
  return (s % 11) % 10 === Number(g[11]);
}

function add(idx, guide, carrier, stripFactory) {
  let k = String(guide ?? ''); if (stripFactory) k = k.replace(/\s*-\s*SHIPPING FACTORY\s*$/i, '');
  k = normalize(k);
  if (!k || !CARRIERS.includes(carrier)) return;
  (idx[k] ||= []); if (!idx[k].includes(carrier)) idx[k].push(carrier);
}

function compileRules(rules) {
  const out = [];
  for (const [carrier, pattern] of rules || []) {
    if (!pattern || !CARRIERS.includes(carrier)) continue;
    try { out.push([carrier, new RegExp(pattern, 'i')]); } catch { /* regla inválida en la hoja: se ignora */ }
  }
  return out;
}

// ---------- Naive Bayes categórico (mismos rasgos que la hoja + verificador FedEx) ----------
function features(g) {
  const ck = fedexCheck(g);
  return [String(g.length), g.replace(/[0-9]/g, '#').replace(/[A-Z]/g, 'A'), g.slice(0, 2), g.slice(0, 3), g.slice(0, 4),
    (g.match(/^[A-Z]+/) || [''])[0], (g.match(/[A-Z]+$/) || [''])[0], ck === null ? '' : ck ? 'ck1' : 'ck0'];
}

function train(examples) {
  const m = { classes: {}, vocab: [], examples: examples.map(([g, c]) => ({ g, c, f: features(g) })) };
  for (const { c, f } of m.examples) {
    const k = (m.classes[c] ||= { n: 0, f: [] }); k.n++;
    f.forEach((v, i) => { (k.f[i] ||= {}); k.f[i][v] = (k.f[i][v] || 0) + 1; (m.vocab[i] ||= {}); m.vocab[i][v] = (m.vocab[i][v] || 0) + 1; });
  }
  return m;
}

// `skip` = ejemplo excluido (validación "deja uno fuera" sin reentrenar: se restan sus conteos).
function predict(g, m, skip = null) {
  const f = features(g);
  const scores = [];
  for (const [c, k] of Object.entries(m.classes)) {
    const n = k.n - (skip && skip.c === c ? 1 : 0); if (n <= 0) continue;
    let s = 0;
    f.forEach((v, i) => {
      const cnt = ((k.f[i] || {})[v] || 0) - (skip && skip.c === c && skip.f[i] === v ? 1 : 0);
      let V = Object.keys(m.vocab[i] || {}).length;
      if (skip && (m.vocab[i] || {})[skip.f[i]] === 1) V--;
      s += Math.log(cnt + 1) - Math.log(n + V + 1);
    });
    scores.push({ carrier: c, score: s });
  }
  if (!scores.length) return { carrier: UNKNOWN, accept: false, score: 0, support: 0 };
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0], sum = scores.reduce((s, r) => s + Math.exp(r.score - best.score), 0);
  const near = m.examples.filter(x => x !== skip && x.g.length === g.length && x.g.slice(0, 3) === g.slice(0, 3) && x.f[1] === f[1]);
  const support = near.filter(x => x.c === best.carrier).length, conflict = near.some(x => x.c !== best.carrier);
  const score = 1 / sum;
  return { carrier: best.carrier, score, support, accept: score >= ML_THRESHOLD && support >= ML_SUPPORT && !conflict };
}

function evaluate(m) {
  let accepted = 0, correct = 0;
  for (const x of m.examples) { const r = predict(x.g, m, x); if (r.accept) { accepted++; if (r.carrier === x.c) correct++; } }
  return { total: m.examples.length, accepted, correct, precision: accepted ? correct / accepted : 0 };
}

// datos = { catalog: [[guía, paquetería]], refs: [[guía, paquetería]], rules: [[paquetería, patrón]] }
function build({ catalog = [], refs = [], rules = DEFAULT_RULES } = {}) {
  const d = { local: {}, ref: {}, rules: compileRules(rules) };
  for (const [g, c] of catalog) add(d.local, g, c, false);
  for (const [g, c] of refs) add(d.ref, g, c, true);
  const examples = [];
  for (const g of new Set([...Object.keys(d.ref), ...Object.keys(d.local)])) { const a = d.local[g] || d.ref[g]; if (a.length === 1) examples.push([g, a[0]]); }
  d.model = train(examples); d.metrics = evaluate(d.model);
  return d;
}

const one = (a, method) => a.length === 1 ? { carrier: a[0], method } : { carrier: UNKNOWN, method: 'Coincidencias contradictorias: seleccione en C' };

function identify(raw, d) {
  const g = normalize(raw);
  if (!g) return { carrier: '', method: '' };
  const r = identifyCore(g, d);
  // Veto por dígito verificador: una guía de 12 dígitos que no lo cumple no es FedEx (salvo confirmación humana en catálogo).
  if (r.carrier === 'FedEx' && fedexCheck(g) === false && !d.local[g])
    return { carrier: UNKNOWN, method: 'Dígito verificador FedEx no coincide: seleccione en C' };
  return r;
}

function identifyCore(g, d) {
  if (d.local[g]) return one(d.local[g], 'Catálogo / selección aprendida');
  if (d.ref[g]) return one(d.ref[g], 'Referencia BrinGO / Process');
  if (/^JJD/.test(g)) { const a = d.local[g.slice(1)] || d.ref[g.slice(1)]; if (a) return one(a, 'Guía DHL sin identificador J'); }
  if (FDX1D.test(g)) {
    const t = g.slice(20), alias = t.startsWith('00') ? t.slice(2) : t, a = d.local[alias] || d.ref[alias];
    if (a && (a.length !== 1 || a[0] !== 'FedEx')) return { carrier: UNKNOWN, method: 'Código y catálogo discrepan: seleccione en C' };
    return { carrier: 'FedEx', method: 'Código FedEx FDX1D; rastreo ' + alias };
  }
  if (/^\d{32}$/.test(g)) { const a = d.local[g.slice(16, 28)] || d.ref[g.slice(16, 28)]; if (a && a.length === 1 && a[0] === 'FedEx') return { carrier: 'FedEx', method: 'Tracking ASTRA en catálogo' }; }
  const byRule = [...new Set(d.rules.filter(([, re]) => re.test(g)).map(([c]) => c))];
  if (byRule.length) return one(byRule, 'Formato de guía');
  const ml = d.model.examples.length ? predict(g, d.model) : null;
  if (ml && ml.accept && d.metrics.accepted >= 5 && d.metrics.precision >= 0.95)
    return { carrier: ml.carrier, method: `ML Naive Bayes; puntaje ${(ml.score * 100).toFixed(1)}%; ${ml.support} ejemplos similares` };
  return { carrier: UNKNOWN, method: ml ? 'ML sin evidencia suficiente; seleccione en C' : 'Sin coincidencia segura: seleccione en C' };
}

// Prueba retrospectiva: ¿MX Wharehouse asigna lo mismo que quedó en Registro? filas = [[guía, paquetería, método]].
// Mide coincidencia con la hoja (incluye las corregidas a mano); la precisión del modelo por sí solo está en d.metrics.
function backtest(rows, d) {
  const res = { total: 0, auto: 0, correct: 0, unknown: 0, wrong: [] };
  for (const [guide, carrier] of rows) {
    if (!guide || !CARRIERS.includes(carrier)) continue;
    res.total++;
    const r = identify(guide, d);
    if (r.carrier === UNKNOWN) { res.unknown++; continue; }
    res.auto++;
    if (r.carrier === carrier) res.correct++; else res.wrong.push({ guide, expected: carrier, got: r.carrier, method: r.method });
  }
  res.precision = res.auto ? res.correct / res.auto : 0;
  res.coverage = res.total ? res.auto / res.total : 0;
  return res;
}

module.exports = { CARRIERS, UNKNOWN, OPTIONS, DEFAULT_RULES, normalize, dupKey, fedexCheck, features, train, predict, evaluate, build, identify, backtest };
