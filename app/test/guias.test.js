const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/guias');

// Guías reales de "Escaneo de Retornos" (Registro) con la paquetería y el método que asignó la hoja.
const CASES = [
  ['JJD014600012840116521', 'DHL', 'Formato de guía'],
  ['1013486154341139840400383922474018', 'FedEx', 'Código FedEx FDX1D; rastreo 383922474018'],
  ['MEX04WE2024071001001', 'PaqueteExpress', 'Formato de guía'],
  ['JMX101796289307', 'J&T', 'Formato de guía'],
  ['1ZV54B999029541310', 'UPS', 'Formato de guía'],
  ['RN068753335MX', 'Correos de Mexico', 'Formato de guía'],
  ['005870980061070999AHHF', 'Estafeta', 'Formato de guía'],
  ['5555912199464700073532', 'Estafeta', 'Formato de guía'],
  ['DsqY4SHbRRMA', 'Cliente / RMA', 'Formato de guía'],
];

test('detecta igual que la hoja en formatos conocidos', () => {
  const d = G.build();
  for (const [g, c, m] of CASES) assert.deepEqual(G.identify(g, d), { carrier: c, method: m }, g);
});

test('normaliza lector (]C1, espacios, minúsculas) y calcula la Clave única como la columna I', () => {
  assert.equal(G.normalize(']C1 jmx 1017 96289307\x1d'), 'JMX101796289307');
  assert.equal(G.dupKey('JJD014600012840116521'), 'JD014600012840116521');
  assert.equal(G.dupKey('1013486154341139840400383922474018'), '383922474018');
  assert.equal(G.dupKey('96' + '1'.repeat(18) + '12345678901234'), '12345678901234');
  assert.equal(G.dupKey('MEX04WE2024071001001'), 'MEX04WE2024071001001');
});

test('catálogo y referencias tienen prioridad; contradicciones quedan por identificar', () => {
  const d = G.build({ catalog: [['MEX04WE2024071001001', 'FedEx']], refs: [['111235987927', 'DHL'], ['111235987927', 'FedEx'], ['889172355297 - SHIPPING FACTORY', 'FedEx']] });
  assert.equal(G.identify('MEX04WE2024071001001', d).method, 'Catálogo / selección aprendida');
  assert.equal(G.identify('111235987927', d).carrier, G.UNKNOWN);
  assert.equal(G.identify('889172355297', d).carrier, 'FedEx');
  // JJD se resuelve por catálogo de la guía sin J.
  const d2 = G.build({ catalog: [['JD123456789', 'DHL']], rules: [] });
  assert.deepEqual(G.identify('JJD123456789', d2), { carrier: 'DHL', method: 'Guía DHL sin identificador J' });
  // FDX1D cuyo tracking está en catálogo como otra paquetería → discrepancia.
  const d3 = G.build({ catalog: [['383922474018', 'Estafeta']] });
  assert.equal(G.identify('1013486154341139840400383922474018', d3).carrier, G.UNKNOWN);
});

test('dígito verificador FedEx: cumple en guías FedEx reales y veta FedEx cuando no cumple', () => {
  for (const g of ['383922474018', '877015484764', '396987503048', '889172355297', '877390910027']) assert.equal(G.fedexCheck(g), true, g);
  assert.equal(G.fedexCheck('581229391588'), false);
  assert.equal(G.fedexCheck('ABC'), null);
  // Una regla que diría FedEx para 12 dígitos: si el verificador falla, queda por identificar.
  const d = G.build({ rules: [['FedEx', '^[0-9]{12}$']] });
  assert.equal(G.identify('396987503048', d).carrier, 'FedEx');
  assert.equal(G.identify('581229391588', d).carrier, G.UNKNOWN);
  // Confirmada a mano en el catálogo: se respeta.
  const d2 = G.build({ catalog: [['581229391588', 'FedEx']], rules: [] });
  assert.equal(G.identify('581229391588', d2).carrier, 'FedEx');
});

test('Naive Bayes solo asigna con evidencia suficiente y aprende de ejemplos confirmados', () => {
  const ex = [];
  for (let i = 0; i < 12; i++) ex.push(['MNI03' + String(26877001001 + i * 7919), 'PaqueteExpress']);
  for (let i = 0; i < 12; i++) ex.push(['6081' + String(226211872 + i * 104729).slice(0, 9), 'iMile']);
  const d = G.build({ catalog: ex, rules: [] });
  assert.ok(d.metrics.accepted >= 5 && d.metrics.precision >= 0.95, JSON.stringify(d.metrics));
  const r = G.identify('MNI0399999999001', d);
  assert.equal(r.carrier, 'PaqueteExpress'); assert.match(r.method, /^ML Naive Bayes; puntaje \d+\.\d%; \d+ ejemplos similares$/);
  // Sin ejemplos parecidos no se arriesga.
  assert.equal(G.identify('ZZZ9', d).carrier, G.UNKNOWN);
  // Sin datos: no hay modelo.
  assert.equal(G.identify('QQQ12345678', G.build({ rules: [] })).method, 'Sin coincidencia segura: seleccione en C');
});

test('reglas inválidas de la hoja se ignoran sin romper', () => {
  const d = G.build({ rules: [['DHL', '(['], ['UPS', '^1Z[A-Z0-9]{16}$'], ['Inventada', '.*']] });
  assert.equal(G.identify('1ZV54B999029541310', d).carrier, 'UPS');
});

test('backtest mide coincidencia con la hoja', () => {
  const bt = G.backtest([...CASES, ['ZZZ1', 'Por identificar', ''], ['MTY01WE6386116001001', 'FedEx', 'Selección manual']], G.build());
  assert.equal(bt.total, CASES.length + 1);
  assert.equal(bt.correct, CASES.length);
  assert.equal(bt.wrong.length, 1);
});
