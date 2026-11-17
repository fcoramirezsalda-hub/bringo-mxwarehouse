/**
 * MX Wharehouse · conexión con la hoja "Escaneo de Retornos". PROYECTO NUEVO E INDEPENDIENTE.
 * No reemplaza ni modifica el script "Escaneo Retornos — Eyoyo": el escaneo directo en la hoja sigue funcionando igual.
 *
 * Instalación (una vez):
 *   1. script.google.com → Nuevo proyecto → pega este archivo.
 *   2. Configuración del proyecto → Propiedades de la secuencia de comandos:
 *        TOKEN       = el que muestra "npm run retornos:setup"
 *        RETORNOS_ID = ID de la hoja "Escaneo de Retornos"
 *   3. Implementar → Nueva implementación → Aplicación web → Ejecutar como: Yo · Acceso: Cualquier usuario.
 *   Sin el TOKEN correcto no lee ni escribe nada.
 *
 * Qué escribe en Registro: A Fecha, B Guía, C Paquetería, E Operador, F Observaciones, H Método, J Rack.
 * NO escribe D (Mes), G (Control) ni I (Clave única): son fórmulas que se extienden desde la fila 2.
 * Pestaña oculta "MX Wharehouse": bitácora de qué fila escribió cada escaneo (para reintentos sin duplicar).
 */
var OPCIONES_ = ['FedEx', 'Estafeta', 'PaqueteExpress', 'J&T', 'iMile', 'DHL', 'Correos de Mexico', 'Castores', 'Afimex', 'UPS', 'Cliente / RMA', 'Por identificar'];

function doPost(e) {
  var out = function (r) { return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON); };
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'JSON inválido' }); }
  var props = PropertiesService.getScriptProperties(), token = props.getProperty('TOKEN'), id = props.getProperty('RETORNOS_ID');
  if (!token || body.token !== token) return out({ ok: false, error: 'Token incorrecto' });
  if (!id) return out({ ok: false, error: 'Falta la propiedad RETORNOS_ID' });
  var libro = SpreadsheetApp.openById(id);
  if (body.action === 'export') return out(exportar_(libro));
  if (body.action !== 'append') return out({ ok: false, error: 'Acción desconocida' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out({ ok: false, error: 'Hoja ocupada, se reintenta' });
  try { return out(agregar_(libro, body.rows || [], body.learn || [])); }
  finally { lock.releaseLock(); }
}

function doGet() { return ContentService.createTextOutput('MX Wharehouse · conexión con Escaneo de Retornos activa'); }

// Igual que la columna I "Clave única" (sin "G:").
function clave_(raw) {
  var g = String(raw || '').replace(/^\]C1/i, '').replace(/[\s\x1d]/g, '').toUpperCase();
  if (/^JJD/.test(g)) return g.slice(1);
  if (/^(?:10\d{18}00\d{12}|96\d{32})$/.test(g)) { var t = g.slice(20); return t.indexOf('00') === 0 ? t.slice(2) : t; }
  return g;
}

// Última fila con guía en B (no usar getLastRow: D, G e I tienen fórmulas que se extienden).
function ultimaFila_(h) {
  var n = h.getMaxRows() - 1; if (n < 1) return 1;
  var b = h.getRange(2, 2, n, 1).getDisplayValues();
  for (var i = b.length - 1; i >= 0; i--) if (String(b[i][0]).trim()) return i + 2;
  return 1;
}

function exportar_(libro) {
  var h = libro.getSheetByName('Registro'), last = ultimaFila_(h), registro = [];
  if (last >= 2) {
    var v = h.getRange(2, 1, last - 1, 10).getDisplayValues();
    for (var i = 0; i < v.length; i++) if (String(v[i][1]).trim()) registro.push({ row: i + 2, at: v[i][0], guide: v[i][1], carrier: v[i][2], method: v[i][7], rack: v[i][9] });
  }
  var tabla = function (nombre, col) {
    var s = libro.getSheetByName(nombre); if (!s || s.getLastRow() < 2) return [];
    return s.getRange(2, 1, s.getLastRow() - 1, col + 1).getDisplayValues().filter(function (r) { return r[0] && r[col]; }).map(function (r) { return [r[0], r[col]]; });
  };
  return { ok: true, registro: registro, catalog: tabla('Catálogo de guías', 1),
    refs: tabla('Referencia BrinGO', 2).concat(tabla('Referencia Process', 1)), rules: tabla('Reglas', 1) };
}

function bitacora_(libro) {
  var s = libro.getSheetByName('MX Wharehouse');
  if (!s) { s = libro.insertSheet('MX Wharehouse'); s.getRange(1, 1, 1, 4).setValues([['Clave', 'Escaneo MX', 'Fila', 'Actualizado']]); s.hideSheet(); }
  var m = {}, n = s.getLastRow();
  if (n > 1) s.getRange(2, 1, n - 1, 3).getValues().forEach(function (r, i) { m[String(r[0])] = { mx: String(r[1]), row: Number(r[2]), at: i + 2 }; });
  return { s: s, m: m };
}

function agregar_(libro, rows, learn) {
  var h = libro.getSheetByName('Registro');
  if (!h.getRange('J1').getValue()) h.getRange('J1').setValue('Rack');
  var last = ultimaFila_(h), idx = {};
  if (last >= 2) h.getRange(2, 2, last - 1, 1).getDisplayValues().forEach(function (r, i) { var k = clave_(r[0]); if (k && !idx[k]) idx[k] = i + 2; });
  var bit = bitacora_(libro), results = [];

  rows.forEach(function (r) {
    var k = clave_(r.key || r.guide), carrier = OPCIONES_.indexOf(r.carrier) >= 0 ? r.carrier : 'Por identificar';
    var mio = bit.m[k] && bit.m[k].mx === String(r.id) ? bit.m[k] : null;
    var fila = idx[k];
    if (fila && !mio) { results.push({ id: r.id, row: fila, dup: true }); return; }   // escaneada directo en la hoja
    if (!fila && mio && mio.row) fila = mio.row;                                       // la guía cambió de fila: se usa la bitácora
    var nueva = !fila;
    if (nueva) { last++; fila = last; }
    if (nueva) {
      h.getRange(fila, 1).setValue(new Date(Number(r.at))).setNumberFormat('dd/MM/yyyy HH:mm:ss');
      h.getRange(fila, 2).setNumberFormat('@').setValue(String(r.guide));
    }
    h.getRange(fila, 3).setValue(carrier);
    h.getRange(fila, 5, 1, 2).setValues([[r.operator || '', r.notes || '']]);
    h.getRange(fila, 8).setValue(r.method || '');
    h.getRange(fila, 10).setValue(r.rack || '');
    var reg = [k, String(r.id), fila, new Date()];
    if (mio) bit.s.getRange(mio.at, 1, 1, 4).setValues([reg]);
    else { bit.s.appendRow(reg); bit.m[k] = { mx: String(r.id), row: fila, at: bit.s.getLastRow() }; }
    idx[k] = fila;
    results.push({ id: r.id, row: fila, dup: false });
  });

  // Correcciones del operador → "Catálogo de guías" (lo mismo que hace el script actual al elegir en C).
  if (learn.length) {
    var c = libro.getSheetByName('Catálogo de guías'), n = c.getLastRow();
    var cat = n > 1 ? c.getRange(2, 1, n - 1, 1).getDisplayValues() : [], pos = {};
    cat.forEach(function (r, i) { pos[clave0_(r[0])] = i + 2; });
    learn.forEach(function (l) {
      var k = clave0_(l[0]), carrier = l[1];
      if (!k || OPCIONES_.slice(0, -1).indexOf(carrier) < 0) return;
      if (pos[k]) c.getRange(pos[k], 2).setValue(carrier);
      else { var f = c.getLastRow() + 1; c.getRange(f, 1, 1, 2).setNumberFormat('@').setValues([[k, carrier]]); pos[k] = f; }
    });
  }
  SpreadsheetApp.flush();
  return { ok: true, results: results };
}

// Normalización del catálogo (como "normalizar" del script actual, sin quitar la J ni recortar FedEx).
function clave0_(v) { return String(v || '').replace(/^\]C1/i, '').replace(/[\s\x1d]/g, '').toUpperCase(); }
