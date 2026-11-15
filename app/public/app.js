/* MX Wharehouse · interfaz del piloto. Todo lo que cambia datos lo valida el servidor. */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const p2 = n => String(n).padStart(2, '0');
const fdt = ms => { if (!ms) return '—'; const d = new Date(ms); return `${d.getDate()} ${MES[d.getMonth()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const H = 3600e3, D = 24 * H;
const dur = ms => { ms = Math.abs(ms); const d = Math.floor(ms / D), h = Math.floor(ms % D / H), m = Math.floor(ms % H / 60e3); return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };
const codeRe = /^(MX|ES)[\s-]?(\d{5,})$/i;
const normCode = v => { const m = String(v || '').trim().match(codeRe); return m ? `${m[1].toUpperCase()}-${m[2]}` : null; };

const S = { me: null, view: 'registro', sel: null, tab: 'chat', R: null, last: null, ui: {}, fl: { status: 'abiertos', type: '', owner: '', plat: '', due: '', enr: '' }, users: [], cache: {} };

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { showLogin(); throw new Error(j.error || 'Inicia sesión.'); }
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}
function toast(msg) { const t = $('#toast'); t.innerHTML = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 4500); }
const isAdmin = () => S.me && S.me.role === 'admin';
const can = p => isAdmin() && S.me.perms.includes(p);
const T = k => (S.me && S.me.types[k]) || k;

const stCls = { 'Abierto': 'warn', 'En gestión': 'info', 'Esperando respuesta': 'info', 'Resuelto': 'ok', 'Enviado dañado': 'warn', 'Dispose programado': 'solid-bad', 'Dispose realizado': 'neutral', 'Descartado': 'neutral' };
const stChip = s => `<span class="chip ${stCls[s] || 'neutral'}">${esc(s)}</span>`;
const platChip = p => p === 'MX' ? '<span class="chip mx">Bringgo · MX</span>' : p === 'ES' ? '<span class="chip es">EasyShip · ES</span>' : '<span class="chip neutral">Por identificar</span>';
const idl = t => t.code || t.trk || (t.nolabel ? 'Sin etiqueta' : '—');
const enrChip = t => ({ buscando: '<span class="chip info">Buscando…</span>', lista: '<span class="chip ok">Lista</span>', sin: '<span class="chip bad">Sin coincidencias</span>', error: '<span class="chip bad">Error</span>' }[t.enr_status] || '<span class="muted">—</span>');
function dueInfo(t) {
  if (!t.open) return { k: 'none', html: '' };
  if (t.status === 'Dispose programado') return { k: 'none', html: '<span class="chip bad">Plazo cumplido</span>' };
  const diff = t.due_at - Date.now(), lbl = t.dup_confirmed_at ? 'Duplicado · ' : '';
  if (diff < 0) return { k: 'late', html: `<span class="chip bad">${lbl}Vencido hace ${dur(diff)}</span>` };
  if (diff < D) return { k: 'soon', html: `<span class="chip warn">${lbl}Vence en ${dur(diff)}</span>` };
  return { k: 'ok', html: `<span class="chip neutral">${lbl}Vence ${fdt(t.due_at)}</span>` };
}

/* ---------- Login ---------- */
async function showLogin() {
  $('#shell').hidden = true; const v = $('#loginview'); v.hidden = false;
  let users = []; try { users = await (await fetch('/api/login-users')).json(); } catch {}
  v.innerHTML = `<form class="panel login" id="loginform">
    <div class="brandmark" style="padding:0"><div class="sq">MX</div><div><b>MX Wharehouse</b><small>Incidencias de registro</small></div></div>
    <div class="field"><label class="lbl" for="lu">¿Quién eres?</label><select id="lu">${users.map(u => `<option>${esc(u.name)}</option>`).join('')}</select></div>
    <div class="field"><label class="lbl" for="lp">PIN</label><input id="lp" class="pinpad" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8"></div>
    <p class="err" id="lerr" role="alert"></p>
    <button class="btn brand" type="submit">Entrar</button></form>`;
  $('#lp').focus();
  $('#loginform').onsubmit = async e => {
    e.preventDefault();
    try { await api('POST', '/api/login', { name: $('#lu').value, pin: $('#lp').value }); await boot(); }
    catch (err) { $('#lerr').textContent = err.message; $('#lp').value = ''; $('#lp').focus(); }
  };
}

/* ---------- Navegación ---------- */
const TITLES = { registro: 'Registrar incidencia', misreportes: 'Mis reportes', tickets: 'Bandeja de tickets', tablero: 'Tablero', duplicados: 'Mercancías duplicadas', danados: 'Enviados dañados', descartes: 'Archivo de descartes', equipo: 'Equipo y permisos' };
const ICONS = {
  registro: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M12 8v5M12 16v.5"/>', misreportes: '<path d="M6 3h9l4 4v14H6zM9 12h7M9 16h5"/>',
  tickets: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 6v12"/>', tablero: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  duplicados: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>', danados: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  descartes: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', equipo: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>' };
const navFor = () => isAdmin() ? [['grp', 'Gestión'], ['tickets'], ['tablero'], ['duplicados'], ['danados'], ['descartes'], ['grp', 'Piso'], ['registro'], ['grp', 'Personal'], ['equipo']] : [['grp', 'Mi estación'], ['registro'], ['misreportes']];
function renderNav() {
  $('#nav').innerHTML = navFor().map(([k, l]) => k === 'grp' ? `<div class="grp lbl">${l}</div>` : `<a href="#${k}" class="${S.view === k ? 'on' : ''}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${TITLES[k]}</a>`).join('');
  $('#crumb').innerHTML = `${isAdmin() ? 'Panel administrativo' : 'Operación'} › <b>${S.sel && S.view === 'tickets' ? 'Ticket' : TITLES[S.view]}</b>`;
  $('#who').textContent = S.me.name; $('#rolechip').textContent = isAdmin() ? S.me.dept : 'Operador';
}
async function render() {
  renderNav();
  const v = $('#view');
  try { v.innerHTML = await VIEWS[S.view](); after(); }
  catch (e) { v.innerHTML = `<div class="banner bad"><span class="ic">!</span><div><b>No se pudo cargar</b>${esc(e.message)}</div></div>`; }
}
function after() {
  if (S.view === 'registro') { const R = S.R; const el = R && R.focusCode ? $('#code') : (!R || R.step === 1) ? $('#scan') : (R.type === 'otro' ? $('#f-otro') : R.nolabel ? $('#f-desc') : null); if (el) el.focus(); if (R) R.focusCode = false; }
}
function route() { const h = location.hash.slice(1); const ok = navFor().map(x => x[0]); S.view = VIEWS[h] && ok.includes(h) ? h : (isAdmin() ? 'tickets' : 'registro'); S.sel = null; S.ui = {}; render(); scrollTo(0, 0); agentStatus(); }
addEventListener('hashchange', route);

/* ---------- Registro ---------- */
function newR() { return { step: 1, f: {}, err: null }; }
async function identify(raw, how) {
  const R = S.R || (S.R = newR()); const v = String(raw || '').trim(); R.err = null; S.last = null;
  if (!v) { R.err = how === 'code' ? 'Teclea el código MX o ES.' : 'Escanea o escribe la guía.'; return render(); }
  const nc = normCode(v);
  if (how === 'code' && !nc) { R.err = `“${v}” no tiene formato de código MX o ES (ej. MX-3015532).`; R.focusCode = true; return render(); }
  Object.assign(R, nc ? { code: nc, plat: nc.slice(0, 2), trk: null, src: 'Código tecleado' } : { code: null, plat: null, trk: v.replace(/\s+/g, ''), src: 'Guía escaneada' }, { step: 2, type: null, f: {}, nolabel: false, existing: [] });
  try { R.existing = await api('GET', '/api/incidents/check?' + new URLSearchParams(R.code ? { code: R.code } : { trk: R.trk })); } catch {}
  render();
}
function vRegistro() {
  const R = S.R, s = R ? R.step : 1, cls = n => s > n ? 'done' : s === n ? 'cur' : 'locked';
  const types = Object.keys(S.me.types).filter(k => !(R && R.nolabel && !['sinetiqueta', 'otro'].includes(k)));
  const ready = R && R.type && (R.type !== 'otro' || (R.f.otro || '').trim()) && (!R.nolabel || (R.f.desc || '').trim());
  return `<div class="reg"><div style="display:flex;flex-direction:column;gap:14px;min-width:0">
  ${S.last ? `<div class="banner ok"><span class="ic">✓</span><div><b>${S.last.appended ? 'Agregado a ' + S.last.folio : 'Registrado ' + S.last.folio}</b>${esc(S.last.label)} · ${S.last.appended ? 'se agregó al ticket abierto' : S.last.status === 'Enviado dañado' ? 'quedó en el registro de enviados dañados' : 'ticket abierto; Victor y Customer Service ya lo ven'}.</div></div>` : ''}
  <section class="stepcard ${cls(1)}">
    <div class="stephead"><span class="stepn">1</span><h2>Identifica el paquete</h2><span class="sp"></span>${s > 1 ? '<button class="btn sm" data-a="restart">Cambiar</button>' : ''}</div>
    ${s === 1 ? `<div class="field"><label class="lbl" for="scan">Escanea la guía</label>
      <div class="scanrow" style="margin-top:0"><input id="scan" class="scaninput" type="text" autocomplete="off" spellcheck="false" placeholder="ID…"><button class="btn brand" data-a="scan">Buscar</button></div></div>
      <div class="or">¿No escanea o el número no es válido?</div>
      <div class="field"><label class="lbl" for="code">Teclea el código MX o ES con problema</label>
      <div class="row"><input id="code" class="codeinput" type="text" autocomplete="off" spellcheck="false" placeholder="MX-0000000"><button class="btn brand" data-a="usecode">Usar código</button></div></div>
      ${R && R.err ? `<p class="err" role="alert">${esc(R.err)}</p>` : ''}
      <div class="row"><button class="btn ghost-danger" data-a="nolabel">El paquete no tiene etiqueta</button></div>`
    : `<div class="row"><span class="code">${esc(R.nolabel ? 'Sin etiqueta' : R.code || R.trk)}</span>${R.nolabel ? '' : platChip(R.plat)}<span class="chip neutral">${esc(R.src)}</span></div>
      <p class="small muted">${R.nolabel ? 'Sin código: se identifica por descripción.' : 'La información de la orden la agrega el agente de búsqueda al ticket en unos minutos.'}</p>
      ${R.existing && R.existing.length ? `<div class="banner warn"><span class="ic">!</span><div><b>Ya hay ${R.existing.length === 1 ? 'un ticket abierto' : R.existing.length + ' tickets abiertos'} para ${esc(R.code || R.trk)}</b>${R.existing.map(t => `${t.folio} · ${esc(t.type_label)}`).join('<br>')}<br>Si registras el mismo motivo, se agrega a ese expediente.</div></div>` : ''}`}
  </section>
  <section class="stepcard ${cls(2)}">
    <div class="stephead"><span class="stepn">2</span><h2>Motivo y abrir ticket</h2></div>
    ${s === 2 ? `<div class="typegrid">${types.map(k => `<button class="type${k === 'inbound' ? ' feat' : ''}${R.type === k ? ' on' : ''}" data-a="type" data-v="${k}"><b>${esc(T(k))}</b>${k === 'inbound' ? '<span class="act">El tracking no escanea, no es válido o no aparece en la plataforma</span>' : ''}${k === 'otro' ? '<span class="act">Especifica el motivo</span>' : ''}</button>`).join('')}</div>
      ${R.type === 'otro' ? `<div class="field"><label class="lbl" for="f-otro">Especifica el motivo · obligatorio</label><input type="text" id="f-otro" data-f="otro" value="${esc(R.f.otro || '')}" maxlength="300"></div>` : ''}
      ${R.nolabel ? `<div class="field"><label class="lbl" for="f-desc">Descripción del producto · obligatoria</label><input type="text" id="f-desc" data-f="desc" value="${esc(R.f.desc || '')}" maxlength="300" placeholder="Ej. lámpara LED de escritorio negra"></div>` : ''}
      ${R.type ? `<div class="regfoot"><div class="small">${R.type === 'danado' ? 'Re-empácalo y envíalo. Queda en el registro de enviados dañados.' : 'Se abre sin responsable para Victor y Customer Service.'}<br><span class="muted">A nombre de <b>${esc(S.me.name)}</b>, con fecha y hora.</span></div>
        <button class="btn danger" data-a="register" id="regbtn" ${ready ? '' : 'disabled'}>${R.type === 'danado' ? 'Registrar envío dañado' : 'Abrir ticket'}</button></div>` : '<p class="muted small">Elige el motivo; después presiona “Abrir ticket”.</p>'}`
    : '<p class="muted">Primero identifica el paquete.</p>'}
  </section></div>
  <aside class="side-col"><section class="panel"><div class="lbl">Estación de</div><h2>${esc(S.me.name)}</h2><p class="small muted" style="margin-top:6px">Escanea y presiona Enter, o teclea el código. Máximo 3 clics para abrir un ticket.</p></section></aside></div>`;
}
async function register() {
  const R = S.R; const btn = $('#regbtn'); if (btn) btn.disabled = true;
  try {
    const r = await api('POST', '/api/incidents', { type: R.type, code: R.code, trk: R.trk, nolabel: !!R.nolabel, other_text: R.f.otro, description: R.f.desc });
    S.last = { ...r, label: `${T(R.type)} · ${R.nolabel ? 'sin etiqueta' : R.code || R.trk}` }; S.R = null; render();
  } catch (e) { toast(esc(e.message)); if (btn) btn.disabled = false; }
}

/* ---------- Mis reportes ---------- */
async function vMisReportes() {
  const list = await api('GET', '/api/my-reports');
  return `<div class="panel-h"><h1>Mis reportes</h1><span class="muted">Solo consulta. La gestión la hacen Victor y Customer Service.</span></div>
  <section class="panel" style="padding:6px 8px"><div class="tbl-wrap"><table><thead><tr><th>Folio</th><th>Código / guía</th><th>Motivo</th><th>Registrado</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>
  ${list.length ? list.map(t => `<tr><td class="mono"><b>${t.folio}</b></td><td class="mono">${esc(t.code || t.trk || 'Sin etiqueta')}</td><td>${esc(t.type_label)}</td><td class="num">${fdt(t.created_at)}</td><td>${t.owner ? esc(t.owner) : '<span class="muted">Sin asignar</span>'}</td><td>${stChip(t.status)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">Aún no registras incidencias.</td></tr>'}
  </tbody></table></div></section>`;
}

/* ---------- Bandeja ---------- */
function ticketTable(list, compact) {
  return `<div class="tbl-wrap"><table><thead><tr><th>Folio</th><th>Código / guía</th><th>Motivo</th>${compact ? '' : '<th>Orden</th><th>Registró</th>'}<th>Responsable</th>${compact ? '' : '<th>Esperando a</th>'}<th>Plazo</th><th>Estado</th></tr></thead><tbody>
  ${list.length ? list.map(t => { const d = dueInfo(t); return `<tr class="click ${d.k === 'late' ? 'late' : d.k === 'soon' ? 'soon' : ''}" data-a="open" data-v="${t.id}" tabindex="0">
    <td class="mono"><b>${t.folio}</b></td><td><span class="mono">${esc(idl(t))}</span> ${t.plat ? `<span class="chip ${t.plat === 'MX' ? 'mx' : 'es'}">${t.plat}</span>` : ''}</td><td>${esc(t.type_label)}${t.other_text ? `<div class="muted small">${esc(t.other_text)}</div>` : ''}</td>
    ${compact ? '' : `<td>${enrChip(t)}</td><td>${esc(t.reporter)}<div class="muted small">${fdt(t.created_at)}</div></td>`}
    <td>${t.owner ? esc(t.owner) : t.open ? '<span class="chip warn">Sin asignar</span>' : '<span class="muted">—</span>'}</td>${compact ? '' : `<td>${t.waiting_dept && t.open ? esc(t.waiting_dept) : '<span class="muted">—</span>'}</td>`}
    <td>${d.html}</td><td>${stChip(t.status)}</td></tr>`; }).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">Ningún ticket coincide con los filtros.</td></tr>'}
  </tbody></table></div>`;
}
async function vTickets() {
  if (S.sel) return vDetail();
  if (!S.users.length) S.users = await api('GET', '/api/users');
  const f = S.fl, list = await api('GET', '/api/tickets?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v)));
  const sel = (id, k, opts) => `<div class="field"><label class="lbl" for="${id}">${{ status: 'Estado', type: 'Motivo', owner: 'Responsable', plat: 'Origen', due: 'Vencimiento', enr: 'Orden' }[k]}</label><select id="${id}" data-fl="${k}">${opts.map(([v, l]) => `<option value="${v}" ${f[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  return `<div class="panel-h"><h1>Bandeja de tickets</h1><span class="muted">Compartida por Victor y Customer Service · abrir un ticket no lo asigna · se actualiza sola</span></div>
  <section class="panel"><div class="filtersbar">
    ${sel('f-st', 'status', [['abiertos', 'Abiertos'], ['sin', 'Sin responsable'], ['mios', 'Asignados a mí'], ['espera', 'Esperando respuesta'], ['dispose', 'Dispose programado'], ['cerrados', 'Cerrados'], ['', 'Todos']])}
    ${sel('f-ty', 'type', [['', 'Todos'], ...Object.entries(S.me.types)])}
    ${sel('f-ow', 'owner', [['', 'Todos'], ['sin', 'Sin asignar'], ...S.users.filter(u => u.role === 'admin').map(u => [String(u.id), u.name])])}
    ${sel('f-pl', 'plat', [['', 'MX y ES'], ['MX', 'Bringgo · MX'], ['ES', 'EasyShip · ES']])}
    ${sel('f-du', 'due', [['', 'Cualquiera'], ['soon', 'Vence en 24 h'], ['late', 'Vencidos']])}
    ${sel('f-en', 'enr', [['', 'Cualquiera'], ['buscando', 'Buscando'], ['lista', 'Lista'], ['sin', 'Sin coincidencias'], ['error', 'Error']])}
  </div></section>
  <section class="panel" style="padding:6px 8px">${ticketTable(list)}</section>`;
}
function orderPanel(t) {
  const h = '<div class="panel-h"><h3>Información de la orden</h3><span class="sp"></span>';
  const box = `<div class="row" style="margin-top:10px"><input type="text" id="recode" class="mono" placeholder="MX-0000000, ES-000000 o guía" style="flex:1 1 200px"><button class="btn" data-a="research">Buscar de nuevo</button></div>`;
  const d = t.enr_data || {};
  if (t.enr_status === 'buscando') return `<section class="panel">${h}<span class="chip info">Buscando</span></div><p class="small">El agente de búsqueda está consultando Bringgo / EasyShip. Esta página se actualiza sola.</p></section>`;
  if (t.enr_status === 'lista') return `<section class="panel">${h}<span class="chip ok">${esc(t.enr_source)}</span></div>
    ${d.product ? `<b>${esc(d.product)}</b>` : ''}<dl class="kvlist" style="margin-top:10px">${(d.fields || []).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${d.candidates && d.candidates.length ? `<div class="banner warn" style="margin-top:10px"><span class="ic">!</span><div><b>${d.candidates.length} resultados</b>Confirma cuál corresponde al paquete.</div></div><div class="cands">${d.candidates.map(c => `<div class="cand">${Object.entries(c).filter(([, v]) => v).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' · ')}</div>`).join('')}</div>` : ''}
    <p class="muted small" style="margin-top:8px">Obtenida por el agente · ${fdt(t.enr_at)} · solo lectura.</p>${box}</section>`;
  if (t.enr_status === 'sin' || t.enr_status === 'error') return `<section class="panel">${h}<span class="chip bad">${t.enr_status === 'sin' ? 'Sin coincidencias' : 'No se pudo consultar'}</span></div>
    <p class="small">${d.tried ? 'Se buscó en: ' + esc(d.tried.join(', ')) + ' · ' : ''}${fdt(t.enr_at)}</p>${box}</section>`;
  return `<section class="panel">${h}</div><p class="small muted">Sin código ni guía: el agente no puede buscar todavía.</p>${box}</section>`;
}
async function vDetail() {
  const t = await api('GET', '/api/tickets/' + S.sel); S.cache.t = t;
  if (!S.users.length) S.users = await api('GET', '/api/users');
  const mine = t.owner_id === S.me.id, manage = mine || can('transfer'), active = t.open && t.status !== 'Dispose programado', d = dueInfo(t);
  const admins = S.users.filter(u => u.role === 'admin' && u.active);
  const tabs = [['chat', `Chat interno (${t.messages.length})`], ['hist', `Historial (${t.events.length})`], ['ev', `Evidencias (${t.evidence.length})`]];
  const tab = S.tab === 'hist' ? `<ul class="timeline">${t.events.map(e => `<li><span class="mono muted">${fdt(e.created_at)}</span><span><b>${esc(e.who)}</b> · ${esc(e.text)}</span></li>`).join('')}</ul>`
    : S.tab === 'ev' ? `<div class="evgrid">${t.evidence.map(e => `<a class="ev" href="/api/evidence/${e.id}" target="_blank" rel="noopener"><div class="im">${e.mime.startsWith('image/') ? `<img src="/api/evidence/${e.id}" alt="${esc(e.file_name)}" loading="lazy">` : 'PDF'}</div><div class="cap"><b>${esc(e.file_name)}</b><div class="muted">${esc(e.who)} · ${fdt(e.created_at)}</div></div></a>`).join('') || '<p class="muted">Sin evidencias.</p>'}</div>
      <div class="row" style="margin-top:12px"><input type="file" id="evfile" accept="image/*,application/pdf"><button class="btn" data-a="addev">Adjuntar al expediente</button></div><p class="muted small" style="margin-top:6px">Las evidencias no se eliminan.</p>`
    : `${!t.messages.length && !S.ui.chatOpen ? `<div class="empty"><h3>Sin conversación</h3><p>El chat se abre cuando hace falta coordinar algo.</p><button class="btn brand" style="margin-top:12px" data-a="openchat">Iniciar conversación</button></div>`
      : `<div class="chat">${t.messages.map(m => `<div class="msg ${m.who === S.me.name ? 'mine' : ''}"><div class="mh"><b>${esc(m.who)}</b><span>${fdt(m.created_at)}</span>${m.tag !== 'Mensaje' ? `<span class="chip ${m.tag.includes('turco') ? 'info' : 'warn'}">${esc(m.tag)}</span>` : ''}</div>${esc(m.body)}</div>`).join('')}
        <div class="field"><div class="row"><label class="lbl" for="ctag">Tipo</label><select id="ctag">${S.me.tags.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
        <textarea id="cmsg" data-ui="cmsg" placeholder="Escribe un mensaje o documenta la instrucción recibida">${esc(S.ui.cmsg || '')}</textarea><div class="row"><span style="flex:1"></span><button class="btn brand" data-a="sendchat">Enviar</button></div></div></div>`}`;
  const disc = S.ui.disc || 0;
  return `<div class="row"><button class="btn sm" data-a="back">← Bandeja</button></div>
  <div class="detail"><div style="display:flex;flex-direction:column;gap:16px;min-width:0">
    <section class="panel"><div class="tk-head"><span class="code">${t.folio}</span>${stChip(t.status)}${d.html}<span style="flex:1"></span>${platChip(t.plat)}</div>
      <h2 style="margin:8px 0 14px">${esc(t.type_label)} · <span class="mono">${esc(idl(t))}</span></h2>
      <div class="facts">
        <div><div class="lbl">Registrado</div><div class="v num">${fdt(t.created_at)}</div></div>
        <div><div class="lbl">Registró</div><div class="v">${esc(t.reporter)}</div><div class="muted small">${esc(t.reporter_dept)}</div></div>
        <div><div class="lbl">Responsable</div><div class="v">${t.owner ? esc(t.owner) : t.open ? '<span class="chip warn">Sin asignar</span>' : '—'}</div></div>
        <div><div class="lbl">Respuesta pendiente de</div><div class="v">${t.waiting_dept && t.open ? esc(t.waiting_dept) : '—'}</div></div>
        <div><div class="lbl">Ubicación física</div><div class="v">${esc(t.location || 'Sin registrar')}</div></div>
        <div><div class="lbl">Fecha límite</div><div class="v num">${fdt(t.due_at)}</div><div class="muted small">${t.dup_confirmed_at ? 'duplicado (10 d)' : 'general (3 d)'}</div></div>
        ${t.trk && t.code ? `<div><div class="lbl">Guía escaneada</div><div class="v mono">${esc(t.trk)}</div></div>` : ''}
        ${t.other_text ? `<div><div class="lbl">Motivo especificado</div><div class="v">${esc(t.other_text)}</div></div>` : ''}
        ${t.description ? `<div><div class="lbl">Descripción</div><div class="v">${esc(t.description)}</div></div>` : ''}
        ${t.type === 'danado' ? `<div><div class="lbl">Desenlace del envío</div><div class="v">${esc(t.damage_outcome)}</div></div>` : ''}
      </div>
      ${t.resolution ? `<div class="banner ok" style="margin-top:14px"><span class="ic">✓</span><div><b>Resolución final</b>${esc(t.resolution)}</div></div>` : ''}
      ${t.status === 'Descartado' ? `<div class="banner bad" style="margin-top:14px"><span class="ic">!</span><div><b>Descartado por ${esc(t.discarded_by)} · ${fdt(t.discarded_at)}</b>${esc(t.discard_reason)}</div></div>` : ''}
    </section>
    ${orderPanel(t)}
    <section class="panel"><div class="panel-h"><div class="tabs">${tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${l}</button>`).join('')}</div></div>${tab}</section>
  </div>
  <aside class="panel mgmt">
    <section><div class="lbl">Responsable</div>
      <div class="owner"><div class="av ${t.owner ? 'on' : ''}">${t.owner ? esc(t.owner[0]) : '?'}</div><b>${t.owner ? esc(t.owner) : 'Sin responsable'}</b></div>
      ${t.open ? (!t.owner ? `<button class="btn brand full" data-a="take" ${can('take') ? '' : 'disabled'}>Tomar ticket</button>`
        : manage ? `<div class="row"><button class="btn sm" data-a="release">Liberar</button><select id="xfer" aria-label="Transferir a">${admins.filter(u => u.id !== t.owner_id).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select><button class="btn sm" data-a="transfer">Transferir</button></div>` : '<p class="muted small">Asignado a otra persona. Puedes consultar y escribir en el chat.</p>') : ''}
    </section>
    ${active ? `<section><label class="lbl" for="wait">Respuesta pendiente de</label><select id="wait" data-a="waiting" ${manage ? '' : 'disabled'}><option value="">Ninguno</option>${S.me.depts.map(x => `<option ${t.waiting_dept === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></section>
    <section><label class="lbl" for="loc">Ubicación física</label><div class="row"><input type="text" id="loc" value="${esc(t.location || '')}" style="flex:1 1 140px"><button class="btn sm" data-a="saveloc" ${manage ? '' : 'disabled'}>Guardar</button></div></section>` : ''}
    ${t.type === 'danado' && t.status === 'Enviado dañado' ? `<section><label class="lbl" for="dmg">Desenlace del envío dañado</label><select id="dmg" data-a="dmg">${S.me.outcomes.map(o => `<option ${t.damage_outcome === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></section>` : ''}
    ${t.type === 'duplicado' ? `<section><div class="lbl">Mercancía duplicada</div>${t.dup_confirmed_at ? `<div class="small">Confirmó <b>${esc(t.dup_confirmed_by)}</b> · ${fdt(t.dup_confirmed_at)}<br>Revisión inicial: ${dur(t.dup_confirmed_at - t.created_at)} · Vence ${fdt(t.dup_due_at)}</div>` : `<button class="btn full" data-a="confirmdup" ${can('confirmdup') && t.open ? '' : 'disabled'}>Confirmar que es duplicado</button><p class="muted small">Inicia el plazo de 10 días.</p>`}
      ${t.status === 'Dispose programado' ? `<div class="confirmbox"><b>Dispose programado</b><span class="small">Sube la evidencia y confirma.</span><input type="file" id="dspfile" accept="image/*,application/pdf"><button class="btn danger" data-a="disposedone" ${can('dispose') ? '' : 'disabled'}>Confirmar Dispose realizado</button></div>` : ''}</section>` : ''}
    ${active ? `<section><label class="lbl" for="res">Resolución final</label><textarea id="res" data-ui="res">${esc(S.ui.res || '')}</textarea><button class="btn primary full" data-a="resolve" ${mine && can('resolve') ? '' : 'disabled'}>Resolver ticket</button>${mine ? '' : '<span class="muted small">Toma el ticket para resolverlo.</span>'}</section>` : ''}
    ${t.status !== 'Descartado' ? `<section>${!can('discard') ? '<span class="muted small">Descartar requiere permiso especial.</span>' : disc === 0 ? '<button class="btn ghost-danger full" data-a="disc1">Descartar incidencia reportada por error…</button>'
      : `<div class="confirmbox"><b>Descartar ${t.folio}</b><span class="small">Pasa al archivo de auditoría. No se borra y puede restaurarse.</span><label class="lbl" for="dwhy">Justificación (obligatoria)</label><textarea id="dwhy" data-ui="why">${esc(S.ui.why || '')}</textarea>
        ${disc === 1 ? '<div class="row"><button class="btn sm" data-a="disc0">Cancelar</button><button class="btn danger sm" data-a="disc2">Continuar</button></div>' : `<div class="banner bad"><span class="ic">!</span><div><b>Segunda confirmación</b>¿Descartar ${t.folio} a nombre de ${esc(S.me.name)}?</div></div><div class="row"><button class="btn sm" data-a="disc0">No, volver</button><button class="btn danger sm" data-a="discgo">Sí, descartar</button></div>`}</div>`}</section>`
      : `<section>${can('restore') ? '<button class="btn full" data-a="restore">Restaurar</button>' : ''}</section>`}
  </aside></div>`;
}

/* ---------- Otras vistas ---------- */
async function vTablero() {
  const s = await api('GET', '/api/stats'), mx = Math.max(1, ...s.today.map(x => x.n)), gs = await api('GET', '/api/sheets-status').catch(() => null);
  return `<div class="panel-h"><h1>Incidencias de registro</h1><span class="muted">Hoy</span></div>
  <div class="kpis">
    <div class="kpi hl"><span class="lbl">Registradas hoy</span><span class="v num">${s.today.reduce((a, x) => a + x.n, 0)}</span></div>
    <div class="kpi"><span class="lbl">Tickets abiertos</span><span class="v num">${s.open}</span><span class="s">${s.unassigned} sin responsable</span></div>
    <div class="kpi"><span class="lbl">Vencidos</span><span class="v num" style="color:var(--bad)">${s.late}</span></div>
    <div class="kpi"><span class="lbl">Vencen en 24 h</span><span class="v num" style="color:var(--warn)">${s.soon}</span></div>
    <div class="kpi"><span class="lbl">Dispose programado</span><span class="v num">${s.dispose}</span></div>
  </div>
  <div class="two"><section class="panel"><div class="panel-h"><h2>Por motivo</h2></div><div class="hbars">${s.today.map(x => `<div class="hb"><span>${esc(T(x.type))}</span><div class="bar"><i style="width:${x.n / mx * 100}%"></i></div><span class="n">${x.n}</span></div>`).join('') || '<p class="muted">Sin registros hoy.</p>'}</div></section>
  <section class="panel"><div class="panel-h"><h2>Por persona</h2></div><div class="hbars">${s.by_reporter.map(x => `<div class="hb"><span>${esc(x.name)}</span><div class="bar"><i style="width:${x.n / mx * 100}%"></i></div><span class="n">${x.n}</span></div>`).join('') || '<p class="muted">Sin registros hoy.</p>'}</div></section></div>
  ${gs ? (gs.last_error ? `<div class="banner bad"><span class="ic">!</span><div><b>La copia a Google Sheets falló</b>${esc(gs.last_error)}. Se reintenta cada minuto.</div></div>` : '') : ''}
  <p class="muted small">Último proceso de plazos: ${s.last_job ? fdt(s.last_job.at) + ' · ' + s.last_job.changes + ' cambio(s)' : '—'} · Copia en Google Sheets: ${!gs || !gs.configured ? 'sin configurar' : gs.last_ok_at ? 'al día (' + fdt(gs.last_ok_at) + ')' : 'pendiente'}</p>`;
}
async function vDuplicados() {
  const list = await api('GET', '/api/duplicates');
  return `<div class="panel-h"><h1>Mercancías duplicadas</h1><span class="muted">10 días naturales desde la confirmación · después pasa a Dispose programado</span></div><section class="panel" style="padding:6px 8px">${ticketTable(list)}</section>`;
}
async function vDanados() {
  const list = await api('GET', '/api/damaged');
  return `<div class="panel-h"><h1>Enviados dañados</h1><span class="muted">Re-empacados y enviados; se espera que regresen o terminen en dispose con la paquetería</span></div>
  <section class="panel" style="padding:6px 8px"><div class="tbl-wrap"><table><thead><tr><th>Folio</th><th>Código / guía</th><th>Registró</th><th>Enviado</th><th>Desenlace</th></tr></thead><tbody>
  ${list.map(t => `<tr><td class="mono"><b>${t.folio}</b></td><td class="mono">${esc(idl(t))}</td><td>${esc(t.reporter)}</td><td class="num">${fdt(t.created_at)}</td><td><select data-dmg="${t.id}" aria-label="Desenlace de ${t.folio}">${S.me.outcomes.map(o => `<option ${t.damage_outcome === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">Sin envíos dañados.</td></tr>'}
  </tbody></table></div></section>`;
}
async function vDescartes() {
  const list = await api('GET', '/api/discarded');
  return `<div class="panel-h"><h1>Archivo de descartes</h1><span class="muted">Auditoría · nada se borra</span></div>
  <section class="panel" style="padding:6px 8px"><div class="tbl-wrap"><table><thead><tr><th>Folio</th><th>Código</th><th>Motivo</th><th>Descartó</th><th>Justificación</th><th></th></tr></thead><tbody>
  ${list.map(t => `<tr><td class="mono"><b>${t.folio}</b></td><td class="mono">${esc(idl(t))}</td><td>${esc(t.type_label)}</td><td>${esc(t.discarded_by)}<div class="muted small">${fdt(t.discarded_at)}</div></td><td>${esc(t.discard_reason)}</td><td><button class="btn sm" data-a="open" data-v="${t.id}">Ver expediente</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">No hay descartes.</td></tr>'}
  </tbody></table></div></section>`;
}
async function vEquipo() {
  S.users = await api('GET', '/api/users'); const adm = S.users.filter(u => u.role === 'admin'), P = S.me.perms_catalog;
  return `<div class="panel-h"><h1>Equipo y permisos</h1></div>
  ${S.ui.newpin ? `<div class="banner ok"><span class="ic">✓</span><div><b>Nuevo PIN de ${esc(S.ui.newpin.name)}: <span class="mono">${esc(S.ui.newpin.pin)}</span></b>Entrégalo en persona. No se vuelve a mostrar.</div></div>` : ''}
  <section class="panel" style="padding:6px 8px"><div class="tbl-wrap"><table><thead><tr><th>Persona</th><th>Rol</th><th>Área</th><th></th></tr></thead><tbody>
  ${S.users.map(u => `<tr><td><b>${esc(u.name)}</b><div class="muted small">${esc(u.title)}</div></td><td>${u.role === 'admin' ? 'Panel administrativo' : 'Operador'}</td><td>${esc(u.dept)}</td><td style="text-align:right">${can('users') ? `<button class="btn sm" data-a="pin" data-v="${u.id}">Restablecer PIN</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></section>
  <section class="panel"><div class="panel-h"><h2>Matriz de permisos</h2><span class="sp"></span><span class="muted">validados en el servidor</span></div><div class="tbl-wrap"><table><thead><tr><th>Acción</th><th>Operadores</th>${adm.map(u => `<th>${esc(u.name)}</th>`).join('')}</tr></thead><tbody>
  <tr><td>Registrar incidencia</td><td class="yes">Sí</td>${adm.map(() => '<td class="yes">Sí</td>').join('')}</tr>
  <tr><td>Ver bandeja, chat, historial y evidencias</td><td class="no">No</td>${adm.map(() => '<td class="yes">Sí</td>').join('')}</tr>
  ${Object.entries(P).map(([k, l]) => `<tr><td>${esc(l)}</td><td class="no">No</td>${adm.map(u => u.perms.includes(k) ? '<td class="yes">Sí</td>' : '<td class="no">No</td>').join('')}</tr>`).join('')}
  </tbody></table></div></section>`;
}
const VIEWS = { registro: vRegistro, misreportes: vMisReportes, tickets: vTickets, tablero: vTablero, duplicados: vDuplicados, danados: vDanados, descartes: vDescartes, equipo: vEquipo };

/* ---------- Acciones ---------- */
const fileData = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });
async function tpost(path, body, msg) {
  try { const r = await api('POST', `/api/tickets/${S.sel}/${path}`, body || {}); if (msg) toast(msg); await render(); return r; }
  catch (e) { toast(esc(e.message)); await render(); }
}
function openTicket(id) { S.sel = Number(id); S.tab = 'chat'; S.ui = {}; if (S.view !== 'tickets') { history.replaceState(null, '', '#tickets'); S.view = 'tickets'; } render(); scrollTo(0, 0); }

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'scan') identify(e.target.value, 'scan');
  else if (e.target.id === 'code') identify(e.target.value, 'code');
  else if (e.target.dataset && e.target.dataset.f && !$('#regbtn')?.disabled) { e.preventDefault(); register(); }
  else if (e.target.matches && e.target.matches('tr[data-a=open]')) openTicket(e.target.dataset.v);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f && S.R) { S.R.f[el.dataset.f] = el.value; const R = S.R, b = $('#regbtn'); if (b) b.disabled = !((R.type !== 'otro' || (R.f.otro || '').trim()) && (!R.nolabel || (R.f.desc || '').trim())); }
  if (el.dataset.ui) S.ui[el.dataset.ui] = el.value;
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.fl !== undefined && el.dataset.fl) { S.fl[el.dataset.fl] = el.value; render(); }
  else if (el.dataset.a === 'waiting') tpost('waiting', { dept: el.value || null });
  else if (el.dataset.a === 'dmg') tpost('damage-outcome', { outcome: el.value }, 'Desenlace guardado');
  else if (el.dataset.dmg) { try { await api('POST', `/api/tickets/${el.dataset.dmg}/damage-outcome`, { outcome: el.value }); toast('Desenlace guardado'); } catch (err) { toast(esc(err.message)); render(); } }
});
document.addEventListener('click', async e => {
  const nl = e.target.closest('.nav a'); if (nl && nl.getAttribute('href') === location.hash) { e.preventDefault(); route(); return; }
  const el = e.target.closest('[data-a]'); if (!el || el.tagName === 'SELECT') return;
  const a = el.dataset.a, v = el.dataset.v, R = S.R;
  switch (a) {
    case 'logout': await api('POST', '/api/logout'); showLogin(); break;
    case 'scan': identify($('#scan').value, 'scan'); break;
    case 'usecode': identify($('#code').value, 'code'); break;
    case 'nolabel': S.last = null; S.R = { ...newR(), step: 2, type: 'sinetiqueta', nolabel: true, src: 'Sin etiqueta', code: null, trk: null }; render(); break;
    case 'restart': S.R = null; render(); break;
    case 'type': R.type = v; R.f = {}; await render(); if (v !== 'otro' && !R.nolabel) $('#regbtn')?.focus(); break;
    case 'register': register(); break;
    case 'open': openTicket(v); break;
    case 'back': S.sel = null; S.ui = {}; render(); break;
    case 'tab': S.tab = v; render(); break;
    case 'take': tpost('take', null, 'Ticket tomado'); break;
    case 'release': tpost('release', null, 'Ticket liberado'); break;
    case 'transfer': tpost('transfer', { to: Number($('#xfer').value) }, 'Ticket transferido'); break;
    case 'saveloc': tpost('location', { location: $('#loc').value }, 'Ubicación guardada'); break;
    case 'confirmdup': tpost('confirm-dup', null, 'Duplicado confirmado: inicia el plazo de 10 días'); break;
    case 'resolve': { const r = await tpost('resolve', { resolution: $('#res').value }, 'Ticket resuelto'); if (r) S.ui.res = ''; break; }
    case 'openchat': S.ui.chatOpen = true; render(); break;
    case 'sendchat': { const r = await tpost('messages', { tag: $('#ctag').value, body: $('#cmsg').value }); if (r) { S.ui.cmsg = ''; render(); } break; }
    case 'research': tpost('research', { value: $('#recode').value }, 'En cola: el agente buscará en unos minutos'); break;
    case 'disc1': S.ui.disc = 1; render(); break;
    case 'disc0': S.ui.disc = 0; render(); break;
    case 'disc2': if ((S.ui.why || '').trim().length < 10) { toast('La justificación es obligatoria (mínimo 10 caracteres).'); break; } S.ui.disc = 2; render(); break;
    case 'discgo': { const r = await tpost('discard', { reason: S.ui.why, confirm: true }, 'Pasó al archivo de descartes'); if (r) S.ui = {}; break; }
    case 'restore': tpost('restore', null, 'Ticket restaurado'); break;
    case 'addev': case 'disposedone': {
      const inp = $(a === 'addev' ? '#evfile' : '#dspfile'), f = inp && inp.files[0];
      if (!f) { toast('Elige un archivo.'); break; }
      try {
        const up = await api('POST', `/api/tickets/${S.sel}/evidence`, { name: f.name, data: await fileData(f), purpose: a === 'disposedone' ? 'dispose' : 'general' });
        if (a === 'disposedone') await tpost('dispose-done', { evidence_id: up.id }, 'Disposición confirmada con evidencia'); else { toast('Evidencia agregada'); render(); }
      } catch (err) { toast(esc(err.message)); }
      break; }
    case 'pin': try { S.ui.newpin = await api('POST', `/api/users/${v}/pin`); render(); } catch (err) { toast(esc(err.message)); } break;
  }
});

/* ---------- Actualización automática ---------- */
const typing = () => { const a = document.activeElement; return a && $('#view').contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName); };
setInterval(() => {
  if (!S.me || !isAdmin() || typing()) return;
  if (S.view === 'tickets' && (!S.sel || (S.cache.t && S.cache.t.enr_status === 'buscando'))) render();
}, 20000);
async function agentStatus() {
  if (!S.me) return;
  try { const s = await api('GET', '/api/agent-status'); $('#agent').innerHTML = `<span class="dot ${s.online ? '' : 'agentdot off'}"></span> Agente de búsqueda · ${s.online ? 'en línea' : 'sin conexión' + (s.last_seen ? ' desde ' + fdt(s.last_seen) : '')}${s.queue ? ` · ${s.queue} en cola` : ''}`; } catch {}
}
setInterval(agentStatus, 30000);

async function boot() {
  try { S.me = await api('GET', '/api/me'); } catch { return; }
  $('#loginview').hidden = true; $('#shell').hidden = false; S.R = null; S.last = null; S.users = [];
  route();
}
boot();
