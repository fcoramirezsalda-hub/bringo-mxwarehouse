/**
 * MX Wharehouse · recibe la copia de tickets e historial desde la PC de la bodega.
 * Instalación: Extensiones → Apps Script → pega este archivo → Configuración del proyecto →
 * Propiedades de la secuencia de comandos: TOKEN = (el que muestra "npm run sheets:setup").
 * Implementar → Nueva implementación → Aplicación web → Ejecutar como: Yo · Acceso: Cualquier usuario.
 * Sin el TOKEN correcto no escribe nada.
 */
function doPost(e) {
  var out = function (r) { return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON); };
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'JSON inválido' }); }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || body.token !== token) return out({ ok: false, error: 'Token incorrecto' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return out({ ok: false, error: 'Hoja ocupada, se reintenta' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var t = hoja_(ss, 'Tickets', body.headers), h = hoja_(ss, 'Historial', body.event_headers);
    var updated = 0, added = 0, events = 0;

    var rows = body.tickets || [];
    if (rows.length) {
      var width = rows[0].length, last = t.getLastRow();
      espacio_(t, last + rows.length, width);
      var folios = last > 1 ? t.getRange(2, 1, last - 1, 1).getValues() : [];
      var idx = {};
      for (var i = 0; i < folios.length; i++) idx[String(folios[i][0])] = i + 2;
      rows.forEach(function (row) {
        var r = idx[row[0]];
        if (!r) { r = t.getLastRow() + 1; idx[row[0]] = r; added++; } else updated++;
        t.getRange(r, 1, 1, width).setNumberFormat('@').setValues([row]);
      });
    }

    var evs = body.events || [];
    if (evs.length) {
      var lastRow = h.getLastRow();
      var lastId = lastRow > 1 ? Number(h.getRange(lastRow, 1).getValue()) || 0 : 0;
      evs = evs.filter(function (ev) { return Number(ev[0]) > lastId; });
      if (evs.length) { espacio_(h, lastRow + evs.length, evs[0].length); h.getRange(lastRow + 1, 1, evs.length, evs[0].length).setNumberFormat('@').setValues(evs); events = evs.length; }
    }
    return out({ ok: true, updated: updated, added: added, events: events });
  } finally { lock.releaseLock(); }
}

function doGet() { return ContentService.createTextOutput('MX Wharehouse · copia a Google Sheets activa'); }

// Agrega filas o columnas antes de escribir: getRange falla si el rango sale de la hoja.
// Deja 500 filas de margen para no ampliar en cada envío.
function espacio_(s, filas, columnas) {
  var maxF = s.getMaxRows(), maxC = s.getMaxColumns();
  if (filas > maxF) s.insertRowsAfter(maxF, filas - maxF + 500);
  if (columnas > maxC) s.insertColumnsAfter(maxC, columnas - maxC);
}

function hoja_(ss, name, headers) {
  var s = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers && s.getLastRow() === 0) { s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold'); s.setFrozenRows(1); }
  return s;
}
