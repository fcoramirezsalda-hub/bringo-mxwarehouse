// Módulo de retornos (solo consulta + abrir ticket local). No escribe en Google Sheets ni en el Site de retornos.
// Modo por variable RETURNS_MODE:
//   off  (predeterminado) → módulo oculto; no se muestran datos ficticios en la bodega.
//   demo → dos retornos ficticios en memoria, para probar la interfaz.
//   site → lectura del Site de retornos con una sesión privada (RETURNS_SITE_COOKIE). Sin validar con datos reales.
const dm = require('./domain');

const ORIGIN = 'https://bringo-retornos-almacenes.fco-ramirezsalda.chatgpt.site';
const MODES = ['off', 'demo', 'site'];
const STATUSES = ['recibido', 'acomodado', 'cerrado'];

// Normaliza una fila de cualquier fuente; descarta filas sin id o sin guía.
function normRow(r) {
  if (!r || typeof r !== 'object') return null;
  const id = String(r.id ?? '').trim(), guide = String(r.guide ?? '').replace(/\s+/g, '').slice(0, 60);
  if (!id || !guide) return null;
  return { id, guide, carrier: String(r.carrier ?? '').trim() || 'Sin paquetería', rack: r.rack ?? null,
    status: String(r.status ?? '').trim() || 'recibido', created: r.created ?? null, note: r.note ?? null };
}

function createReturns({ mode = process.env.RETURNS_MODE || 'off', request = fetch } = {}) {
  mode = String(mode).trim().toLowerCase();
  if (!MODES.includes(mode)) mode = 'off';
  const rows = [
    { id: 'demo-1', guide: 'DEMO000001', carrier: 'FedEx', rack: 2, status: 'recibido', created: '2026-11-16T18:00:00Z', note: 'Dato ficticio para prueba' },
    { id: 'demo-2', guide: 'DEMO000002', carrier: 'Estafeta', rack: 4, status: 'acomodado', created: '2026-11-16T19:00:00Z', note: 'Dato ficticio para prueba' }
  ];
  async function remote() {
    const cookie = process.env.RETURNS_SITE_COOKIE;
    if (!cookie) dm.fail(503, 'Falta configurar la sesión privada del Site en el servidor. Usa demo para probar.');
    const headers = { Cookie: cookie, Origin: ORIGIN };
    const r = await request(ORIGIN + '/api/warehouse', { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!r.ok) dm.fail(502, 'El Site no respondió o la sesión expiró. No se confirmó la operación.');
    try { return await r.json(); } catch { dm.fail(502, 'El Site requiere iniciar sesión.'); }
  }
  return {
    mode,
    async list() {
      if (mode === 'off') dm.fail(404, 'El módulo de retornos está desactivado.');
      const data = mode === 'demo' ? { rows: structuredClone(rows) } : await remote();
      if (!data || !Array.isArray(data.rows)) dm.fail(502, 'Respuesta inválida del Site.');
      return { mode, rows: data.rows.slice(0, 2000).map(normRow).filter(Boolean), fetched_at: new Date().toISOString(), source: ORIGIN, limit: mode === 'site' ? 2000 : null };
    },
    async get(id) { const data = await this.list(); const r = data.rows.find(r => r.id === String(id)); if (!r) dm.fail(404, 'Retorno no encontrado en la consulta actual.'); return r; },
    async status(id, status) {
      if (!STATUSES.includes(status)) dm.fail(400, 'Estado inválido.');
      await this.get(id);
      if (mode !== 'demo') dm.fail(409, 'Las escrituras al Site están deshabilitadas. Abre el Site para cambiar el estado real.');
      rows.find(r => r.id === String(id)).status = status;
      return { ok: true, mode };
    }
  };
}

function mountReturns(app, db, opts, now) {
  const source = opts.returns || createReturns();
  const route = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) {
      if (!(e instanceof dm.HttpError)) console.error('[retornos]', e);
      res.status(e instanceof dm.HttpError ? e.status : 502).json({ error: e instanceof dm.HttpError ? e.message : 'No se pudo consultar retornos. Intenta de nuevo.' });
    }
  };
  app.get('/api/returns', route(() => source.list()));
  app.post('/api/returns/:id/status', route(req => { dm.need(req.user, 'resolve'); return source.status(req.params.id, req.body && req.body.status); }));
  app.post('/api/returns/:id/ticket', route(async req => {
    dm.needAdmin(req.user);
    const r = await source.get(req.params.id);
    // Idempotente: si ya hay un ticket abierto "Otro" con esa guía, se abre ese sin escribir nada.
    const existing = db.prepare(`SELECT id FROM tickets WHERE trk=? AND type='otro' AND ${dm.isOpenSql} ORDER BY id LIMIT 1`).get(r.guide);
    if (existing) return { id: existing.id, folio: dm.folio(existing.id), appended: true };
    const at = now();
    const result = dm.createIncident(db, req.user, { type: 'otro', trk: r.guide, other_text: 'Retorno escaneado · ' + r.carrier, description: 'Origen: ' + source.mode + ' · retorno ' + r.id }, at);
    if (!result.appended) dm.event(db, result.id, req.user, 'retorno', `Retorno ${r.id} · ${source.mode} · rack ${r.rack ?? 'sin asignar'} · ${r.status}`, at);
    return result;
  }));
  return source;
}

module.exports = { createReturns, mountReturns, normRow };
