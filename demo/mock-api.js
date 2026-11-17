/* Servidor simulado para la demo publicada (sin backend).
   Intercepta fetch('/api/...') y responde como app/src/server.js, con las mismas reglas
   (permisos, toma de tickets, anti-duplicado, plazos, agente con datos de prueba).
   Los datos viven solo en este navegador (localStorage). PIN de prueba para todos: 1234. */
(function () {
  'use strict';
  const H = 3600e3, D = 24 * H, KEY = 'mxw-demo-v4', PIN = '1234';
  const TYPES = { inbound: 'Guía no reconocida', producto: 'Sin producto o diferente', danado: 'Dañado o con escurrimiento', extradept: 'Extra Dept', sinetiqueta: 'Sin etiqueta', nouse: 'No use label', duplicado: 'Duplicado', otro: 'Otro' };
  const PERMS = { take: 'Tomar ticket', transfer: 'Transferir / liberar tickets de otros', resolve: 'Resolver', confirmdup: 'Confirmar duplicado', discard: 'Descartar incidencia', restore: 'Restaurar descartada', dispose: 'Confirmar Dispose realizado', users: 'Administrar usuarios' };
  const DEPTS = ['Bringgo', 'EasyShip', 'Equipo turco', 'Vendedor Amazon', 'Murat (Laredo)', 'Customer Service', 'Procesamiento'];
  const TAGS = ['Mensaje', 'Instrucción del equipo turco', 'Instrucción del vendedor Amazon', 'Seguimiento'];
  const OUTCOMES = ['Pendiente', 'Regresó', 'Dispose de paquetería', 'Entregado'];
  const CLOSED = ['Resuelto', 'Dispose realizado', 'Descartado', 'Enviado dañado'];
  const ALL = Object.keys(PERMS), CS = ['take', 'resolve', 'confirmdup'];
  const TEAM = [
    ['Fatima', 'op', 'Operación', 'Procesadora de paquetes', []], ['Mauricio', 'op', 'Operación', 'Procesador de paquetes', []],
    ['Aracely', 'op', 'Operación', 'Procesadora de paquetes', []], ['Michelle', 'op', 'Operación', 'Procesadora de paquetes', []],
    ['Isaac', 'op', 'Retornos', 'Equipo de retornos', []], ['Adrian', 'op', 'Retornos', 'Equipo de retornos', []], ['Josué', 'op', 'Retornos', 'Equipo de retornos', []],
    ['Victor', 'admin', 'Procesamiento', 'Resuelve incidencias', ALL.filter(p => p !== 'users')],
    ['Francisco R.', 'admin', 'Customer Service', 'Customer Service · administrador del sistema', ALL],
    ['Samantha M.', 'admin', 'Customer Service', 'Customer Service', CS], ['Pamela V.', 'admin', 'Customer Service', 'Customer Service', CS],
    ['Rachel', 'admin', 'Customer Service', 'Customer Service', CS]];
  // Datos de prueba del agente (ficticios, salvo los ejemplos de las capturas del propietario).
  const FAKE = {
    'MX-2900440': { source: 'Bringgo · Accept goods', code: 'MX-2900440', product: 'EVER ADVANCED Rolling Ball Storage Cart', fields: [['Product Name', 'EVER ADVANCED Rolling Ball Storage Cart'], ['W.T No', 'MX-2900440'], ['ASIN', 'B0BPYBDTC6'], ['Quantity', '1']] },
    '191255213580': { source: 'Bringgo · Item Look Up · Outbound Tracking Number', code: 'MX-2900440', product: 'EVER ADVANCED Rolling Ball Storage Cart', fields: [['W.H CODE', 'MX-2900440'], ['PRODUCT NAME', 'EVER ADVANCED Rolling Ball Storage Cart'], ['ASIN', 'B0BPYBDTC6'], ['SELLER ACCOUNT ORDER NO', '701-9461183-8702647'], ['OUTBOUND TRACKING', '191255213580 | Delivered']] },
    'MX-3015532': { source: 'Bringgo · Accept goods', code: 'MX-3015532', product: 'Hydro Flask 32 oz Wide Mouth', fields: [['Product Name', 'Hydro Flask 32 oz Wide Mouth'], ['W.T No', 'MX-3015532'], ['ASIN', 'B083GBK6S2'], ['Quantity', '1'], ['Destino · City', 'Querétaro']] },
    'ES-118412': { source: 'EasyShip · Item lookup', code: 'ES-118412', product: 'Olaplex No. 3 Hair Perfector 100 ml', fields: [['Orden EasyShip', '#4442683 · Delivered'], ['Producto', 'Olaplex No. 3 Hair Perfector 100 ml'], ['ASIN', 'B00SNM5US4'], ['Tracking ID', '8055420177'], ['Seller Order', '701-6636277-7159417'], ['Buyer Order', '114-7881374-5366648']] },
  };

  const PROFILES = {
    operacion: { label: 'Operación (registra incidencias)', role: 'op', dept: 'Operación', title: 'Procesador(a) de paquetes', perms: [] },
    retornos: { label: 'Equipo de retornos (registra incidencias)', role: 'op', dept: 'Retornos', title: 'Equipo de retornos', perms: [] },
    cs: { label: 'Customer Service (panel: tomar, resolver, confirmar duplicado)', role: 'admin', dept: 'Customer Service', title: 'Customer Service', perms: CS },
    procesamiento: { label: 'Procesamiento (panel: todo menos administrar usuarios)', role: 'admin', dept: 'Procesamiento', title: 'Resuelve incidencias', perms: ALL.filter(p => p !== 'users') } };
  const nn = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const now = () => Date.now();
  const folio = id => 'INC-' + String(id).padStart(4, '0');
  const normCode = v => { const m = String(v || '').trim().match(/^(MX|ES)[\s-]?(\d{5,})$/i); return m ? `${m[1].toUpperCase()}-${m[2]}` : null; };
  const isOpen = t => !CLOSED.includes(t.status);
  class E extends Error { constructor(s, m) { super(m); this.status = s; } }
  const fail = (s, m) => { throw new E(s, m); };

  let DB;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch {} }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { DB = JSON.parse(raw); return; } } catch {}
    seed();
  }
  function seed() {
    const t0 = now();
    DB = { seq: 0, ev: 0, msg: 0, evid: 0, users: TEAM.map(([name, role, dept, title, perms], i) => ({ id: i + 1, name, role, dept, title, perms, active: 1 })),
      tickets: [], events: [], messages: [], evidence: [], jobs: [], hb: t0 };
    const U = n => DB.users.find(u => u.name === n);
    const mk = (who, body, ago) => { const r = create(U(who), body, t0 - ago); const t = tk(r.id); const j = DB.jobs.find(x => x.ticket_id === t.id && x.status === 'pending'); if (j) j.ready = t0 - ago + 150e3; return t; };
    mk('Fatima', { type: 'producto', code: 'MX-2900440' }, 50 * H);
    const g = mk('Michelle', { type: 'inbound', trk: '191255213580' }, 5 * H);
    const d = mk('Mauricio', { type: 'duplicado', code: 'MX-3013307' }, 6 * D);
    mk('Aracely', { type: 'sinetiqueta', nolabel: true, description: 'Lámpara LED de escritorio negra' }, 75 * H);
    mk('Fatima', { type: 'otro', code: 'ES-118412', other_text: 'Caja abierta con cinta de otra bodega' }, 2 * H);
    mk('Mauricio', { type: 'danado', code: 'MX-3008120' }, 26 * H);
    const vic = U('Victor'), sam = U('Samantha M.');
    take(vic, g.id, t0 - 4 * H); setWaiting(vic, g.id, 'Bringgo', t0 - 3 * H);
    msg(vic, g.id, 'Ya se dejó el mensaje en Bringgo. Queda en el anaquel A-03.', t0 - 3 * H);
    take(sam, d.id, t0 - 5 * D); confirmDup(sam, d.id, t0 - 5 * D + H); setWaiting(sam, d.id, 'Vendedor Amazon', t0 - 5 * D + 2 * H);
    msg(sam, d.id, 'Instrucción del vendedor: esperar a que generen una nueva orden.', t0 - 4 * D);
    agent(); deadlines();
  }
  const tk = id => { const t = DB.tickets.find(x => x.id === Number(id)); if (!t) fail(404, 'No existe ese ticket.'); return t; };
  const user = id => DB.users.find(u => u.id === id);
  const can = (u, p) => u.role === 'admin' && u.perms.includes(p);
  const need = (u, p) => { if (!can(u, p)) fail(403, `Tu usuario no tiene permiso para: ${PERMS[p]}.`); };
  const needAdmin = u => { if (u.role !== 'admin') fail(403, 'Solo Victor y Customer Service pueden ver tickets.'); };
  const event = (t, u, kind, text, at = now()) => DB.events.push({ id: ++DB.ev, ticket_id: t.id, who: u ? u.name : 'Proceso programado', kind, text, created_at: at });
  const openT = id => { const t = tk(id); if (CLOSED.includes(t.status)) fail(409, `El ticket está ${t.status.toLowerCase()}.`); return t; };
  const manage = (u, t) => { if (t.owner_id !== u.id && !can(u, 'transfer')) fail(403, 'Solo el responsable o alguien con permiso de transferir puede hacer esto.'); };
  function enqueue(t, at = now()) {
    DB.jobs.forEach(j => { if (j.ticket_id === t.id && j.status === 'pending') j.status = 'cancelled'; });
    if (!t.code && !t.trk) { t.enr_status = 'na'; return; }
    DB.jobs.push({ ticket_id: t.id, code: t.code, trk: t.trk, status: 'pending', ready: at + 20e3 }); t.enr_status = 'buscando';
  }
  function create(u, b, at = now()) {
    const type = String(b.type || ''); if (!TYPES[type]) fail(400, 'Elige un motivo válido.');
    const nolabel = !!b.nolabel; let code = null, trk = null;
    if (!nolabel) {
      if (b.code) { code = normCode(b.code); if (!code) fail(400, 'El código debe ser MX-0000000 o ES-000000.'); }
      if (b.trk) { trk = String(b.trk).replace(/\s+/g, '').slice(0, 60); if (trk.length < 6) fail(400, 'La guía es muy corta.'); }
      if (!code && !trk) fail(400, 'Escanea una guía o teclea el código MX/ES.');
    } else if (type !== 'sinetiqueta' && type !== 'otro') fail(400, 'Un paquete sin etiqueta solo puede ser "Sin etiqueta" u "Otro".');
    const other = String(b.other_text || '').trim(), desc = String(b.description || '').trim();
    if (type === 'otro' && !other) fail(400, 'Especifica el motivo.');
    if (nolabel && !desc) fail(400, 'Describe el producto (no tiene código).');
    if (!nolabel) {
      const ex = DB.tickets.find(t => isOpen(t) && t.type === type && ((code && t.code === code) || (trk && t.trk === trk)));
      if (ex) { event(ex, u, 'evento', 'Evento adicional registrado' + (other ? ': ' + other : ''), at); return { id: ex.id, folio: folio(ex.id), appended: true, status: ex.status }; }
    }
    const dmg = type === 'danado';
    const t = { id: ++DB.seq, code, trk, plat: code ? code.slice(0, 2) : null, nolabel, type, other_text: other || null, description: desc || null,
      status: dmg ? 'Enviado dañado' : 'Abierto', reporter_id: u.id, reporter_dept: u.role === 'admin' ? u.dept : 'Operación', owner_id: null,
      waiting_dept: null, location: dmg ? 'Enviado con paquetería' : 'Mesa de incidencias', created_at: at, due_at: at + 3 * D, damage_outcome: dmg ? 'Pendiente' : null, enr_status: 'na' };
    DB.tickets.push(t);
    event(t, u, 'registro', `Registró: ${TYPES[type]}${other ? ' · ' + other : ''}${desc ? ' · ' + desc : ''}`, at);
    if (dmg) event(t, u, 'estado', 'Re-empacado y enviado dañado; queda en seguimiento', at);
    enqueue(t, at);
    return { id: t.id, folio: folio(t.id), appended: false, status: t.status };
  }
  function take(u, id, at = now()) {
    need(u, 'take'); const t = openT(id);
    if (t.owner_id) fail(409, `${user(t.owner_id).name} tomó este ticket un instante antes.`);
    t.owner_id = u.id; if (t.status === 'Abierto') t.status = t.waiting_dept ? 'Esperando respuesta' : 'En gestión'; event(t, u, 'asignacion', 'Tomó el ticket', at);
  }
  function setWaiting(u, id, dept, at = now()) {
    const t = openT(id); manage(u, t); const d = dept || null; if (d && !DEPTS.includes(d)) fail(400, 'Departamento no válido.');
    if (t.status !== 'Dispose programado') t.status = d ? 'Esperando respuesta' : (t.owner_id ? 'En gestión' : 'Abierto');
    t.waiting_dept = d; event(t, u, 'espera', d ? `Esperando respuesta de ${d}` : 'Ya no se espera respuesta de otro departamento', at);
  }
  function msg(u, id, body, at = now()) {
    needAdmin(u); const t = tk(id); const b = String(body || '').trim(); if (!b) fail(400, 'Escribe un mensaje.');
    DB.messages.push({ id: ++DB.msg, ticket_id: t.id, who: u.name, tag: 'Mensaje', body: b, created_at: at });
    event(t, u, 'chat', 'Escribió en el chat', at);
  }
  function addEvidence(u, t, file, purpose, label) {
    const mm = String((file && file.data) || '').match(/^data:([\w/+.-]+);base64,/); if (!mm || !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mm[1])) fail(400, 'Sube una foto (JPG, PNG, WEBP) o PDF.');
    if (file.data.length > 6e6) fail(400, 'En la demo el archivo debe pesar menos de 4 MB.');
    const e = { id: ++DB.evid, ticket_id: t.id, file_name: String(file.name || 'foto').slice(0, 80), mime: mm[1], purpose: purpose === 'dispose' ? 'dispose' : 'general', who: u.name, created_at: now(), data: file.data.length < 1.5e6 ? file.data : null };
    DB.evidence.push(e); event(t, u, 'evidencia', label + ': ' + e.file_name); return e.id;
  }
  function confirmDup(u, id, at = now()) {
    need(u, 'confirmdup'); const t = openT(id); if (t.type !== 'duplicado') fail(400, 'Solo aplica a tickets de duplicado.');
    if (t.dup_confirmed_at) fail(409, 'Ya estaba confirmado como duplicado.');
    Object.assign(t, { dup_confirmed_by: u.id, dup_confirmed_at: at, dup_due_at: at + 10 * D }); event(t, u, 'duplicado', 'Confirmó mercancía duplicada · inicia plazo de 10 días', at);
  }
  function agent() {
    DB.hb = now();
    for (const j of DB.jobs) {
      if (j.status !== 'pending' || j.ready > now()) continue;
      const t = tk(j.ticket_id), r = FAKE[j.code] || FAKE[j.trk];
      if (r) { Object.assign(t, { enr_status: 'lista', enr_source: r.source, enr_data: { product: r.product, fields: r.fields, candidates: [] }, enr_at: j.ready }); if (!t.code) { t.code = r.code; t.plat = r.code.slice(0, 2); } event(t, null, 'agente', 'Agente de búsqueda: información obtenida de ' + r.source, j.ready); }
      else { const tried = j.code ? [j.code.startsWith('MX') ? 'Bringgo · Accept goods' : 'EasyShip · Item lookup'] : ['Bringgo · Item Look Up', 'EasyShip · Item lookup'];
        Object.assign(t, { enr_status: 'sin', enr_source: null, enr_data: { tried }, enr_at: j.ready }); event(t, null, 'agente', 'Agente de búsqueda: sin coincidencias en ' + tried.join(', '), j.ready); }
      DB.events[DB.events.length - 1].who = 'Agente de búsqueda'; j.status = 'done';
    }
  }
  function deadlines() {
    const n = now(); let c = 0;
    for (const t of DB.tickets) {
      if (!isOpen(t)) continue;
      if (!t.dup_confirmed_at && t.status !== 'Dispose programado' && !t.late_flagged_at && t.due_at < n) { t.late_flagged_at = n; event(t, null, 'plazo', 'Plazo de 3 días vencido · el ticket sigue abierto y se registra el retraso', t.due_at); c++; }
      if (t.dup_due_at && t.dup_due_at <= n && !t.dispose_scheduled_at) { t.dispose_scheduled_at = t.dup_due_at; t.status = 'Dispose programado'; event(t, null, 'plazo', '10 días sin resolución → Dispose programado', t.dup_due_at); c++; }
    }
    DB.last_job = { at: n, changes: c };
  }
  function row(t) {
    const N = id => id ? user(id).name : null;
    return { id: t.id, folio: folio(t.id), code: t.code, trk: t.trk, plat: t.plat, nolabel: !!t.nolabel, type: t.type, type_label: TYPES[t.type], other_text: t.other_text, description: t.description,
      status: t.status, open: isOpen(t), reporter: N(t.reporter_id), reporter_dept: t.reporter_dept, owner: N(t.owner_id), owner_id: t.owner_id, waiting_dept: t.waiting_dept, location: t.location,
      created_at: t.created_at, due_at: t.dup_due_at || t.due_at, late: !!t.late_flagged_at, dup_confirmed_by: N(t.dup_confirmed_by), dup_confirmed_at: t.dup_confirmed_at || null, dup_due_at: t.dup_due_at || null,
      resolution: t.resolution || null, discarded_by: N(t.discarded_by), discarded_at: t.discarded_at || null, discard_reason: t.discard_reason || null, damage_outcome: t.damage_outcome,
      enr_status: t.enr_status, enr_source: t.enr_source || null, enr_data: t.enr_data || null, enr_at: t.enr_at || null };
  }
  const byDue = (a, b) => (isOpen(b) - isOpen(a)) || ((a.dup_due_at || a.due_at) - (b.dup_due_at || b.due_at));
  const me = u => ({ id: u.id, name: u.name, role: u.role, dept: u.dept, title: u.title, perms: u.role === 'admin' ? u.perms : [] });

  function route(method, url, body) {
    const u0 = new URL(url, location.href), p = u0.pathname, q = Object.fromEntries(u0.searchParams);
    if (p === '/api/version') return { version: (window.MXW_VERSION || '') + ' · demo' };
    if (p === '/api/login-users') return DB.users.filter(u => u.active).map(u => ({ name: u.name, role: u.role }));
    if (p === '/api/login' && method === 'POST') {
      const u = DB.users.find(x => x.name === body.name && x.active); if (!u || String(body.pin) !== PIN) fail(401, 'Usuario o PIN incorrecto. En la demo el PIN es 1234.');
      try { sessionStorage.setItem(KEY + '-uid', u.id); } catch {} window.__mxwUid = u.id; return me(u);
    }
    if (p === '/api/logout') { try { sessionStorage.removeItem(KEY + '-uid'); } catch {} window.__mxwUid = null; return { ok: true }; }
    let uid = window.__mxwUid; try { uid = uid || Number(sessionStorage.getItem(KEY + '-uid')); } catch {}
    const u = uid && user(uid); if (!u || !u.active) fail(401, 'Inicia sesión.');
    agent(); deadlines();
    if (p === '/api/me') return { ...me(u), types: TYPES, perms_catalog: PERMS, depts: DEPTS, tags: TAGS, outcomes: OUTCOMES };
    if (p === '/api/incidents' && method === 'POST') return create(u, body);
    if (p === '/api/incidents/check') { const c = normCode(q.code), tr = q.trk; return DB.tickets.filter(t => isOpen(t) && ((c && t.code === c) || (tr && t.trk === tr))).map(t => ({ folio: folio(t.id), type_label: TYPES[t.type], has_owner: !!t.owner_id })); }
    if (p === '/api/my-reports') return DB.tickets.filter(t => t.reporter_id === u.id && t.status !== 'Descartado').sort((a, b) => b.id - a.id).map(t => { const r = row(t); return { folio: r.folio, code: r.code, trk: r.trk, type_label: r.type_label, created_at: r.created_at, owner: r.owner, status: r.status }; });
    if (p === '/api/agent-status') return { online: true, last_seen: DB.hb, note: 'Demo', queue: DB.jobs.filter(j => j.status === 'pending').length };
    if (p === '/api/sheets-status') return { configured: false, last_ok_at: null, last_error: null };
    needAdmin(u);
    if (p === '/api/users' && method !== 'POST') return DB.users;
    if (p === '/api/stats') { const d0 = new Date(); d0.setHours(0, 0, 0, 0); const today = DB.tickets.filter(t => t.created_at >= d0.getTime()); const n = now(), op = DB.tickets.filter(isOpen);
      const count = (arr, k) => Object.entries(arr.reduce((a, t) => (a[k(t)] = (a[k(t)] || 0) + 1, a), {}));
      return { today: count(today, t => t.type).map(([type, n]) => ({ type, n })), open: op.length, unassigned: op.filter(t => !t.owner_id).length,
        late: op.filter(t => t.status !== 'Dispose programado' && (t.dup_due_at || t.due_at) < n).length, soon: op.filter(t => { const x = t.dup_due_at || t.due_at; return x >= n && x <= n + D; }).length,
        dispose: DB.tickets.filter(t => t.status === 'Dispose programado').length, by_reporter: count(today, t => user(t.reporter_id).name).map(([name, n]) => ({ name, n })), last_job: DB.last_job }; }
    if (p === '/api/duplicates') return DB.tickets.filter(t => t.type === 'duplicado' && t.status !== 'Descartado').sort(byDue).map(row);
    if (p === '/api/damaged') return DB.tickets.filter(t => t.type === 'danado' && t.status === 'Enviado dañado').sort((a, b) => b.id - a.id).map(row);
    if (p === '/api/discarded') return DB.tickets.filter(t => t.status === 'Descartado').sort((a, b) => b.discarded_at - a.discarded_at).map(row);
    if (p === '/api/user-profiles') { need(u, 'users'); return Object.entries(PROFILES).map(([id, x]) => ({ id, label: x.label })); }
    if (p === '/api/users' && method === 'POST') {
      need(u, 'users'); const name = String(body.name || '').replace(/\s+/g, ' ').trim(), pr = PROFILES[body.profile];
      if (name.length < 2 || name.length > 40) fail(400, 'Escribe el nombre (de 2 a 40 caracteres).'); if (!pr) fail(400, 'Elige un perfil válido.');
      const ex = DB.users.find(x => nn(x.name) === nn(name)); if (ex) fail(409, ex.active ? `Ya existe ${ex.name}.` : `${ex.name} ya existe pero está dado de baja. Usa "Reactivar".`);
      const id = Math.max(...DB.users.map(x => x.id)) + 1; DB.users.push({ id, name, role: pr.role, dept: pr.dept, title: pr.title, perms: pr.perms, active: 1 }); save();
      return { id, name, pin: PIN + ' (en la demo todos usan este PIN)' };
    }
    let m = p.match(/^\/api\/users\/(\d+)\/active$/);
    if (m) { need(u, 'users'); const t = user(Number(m[1])); if (!t) fail(404, 'No existe ese usuario.'); if (typeof body.active !== 'boolean') fail(400, 'Indica si la persona queda activa (true o false).'); const on = body.active;
      if (!on && t.id === u.id) fail(400, 'No puedes darte de baja a ti mismo.'); t.active = on ? 1 : 0; let released = 0;
      if (!on) for (const k of DB.tickets.filter(x => x.owner_id === t.id && isOpen(x))) { k.owner_id = null; if (k.status === 'En gestión') k.status = 'Abierto'; event(k, u, 'asignacion', `Ticket liberado: ${t.name} fue dado de baja`); released++; }
      save(); return { name: t.name, active: on, released }; }
    m = p.match(/^\/api\/users\/(\d+)\/pin$/);
    if (m) { need(u, 'users'); return { name: user(Number(m[1])).name, pin: PIN + ' (en la demo no cambia)' }; }
    if (p === '/api/tickets') {
      const n = now();
      return DB.tickets.filter(t => t.status !== 'Descartado').filter(t => {
        if (q.status === 'abiertos' && !isOpen(t)) return false;
        if (q.status === 'sin' && (!isOpen(t) || t.owner_id)) return false;
        if (q.status === 'mios' && t.owner_id !== u.id) return false;
        if (q.status === 'espera' && t.status !== 'Esperando respuesta') return false;
        if (q.status === 'dispose' && t.status !== 'Dispose programado') return false;
        if (q.status === 'cerrados' && isOpen(t)) return false;
        if (q.type && t.type !== q.type) return false;
        if (q.plat && t.plat !== q.plat) return false;
        if (q.owner === 'sin' && t.owner_id) return false; if (q.owner && q.owner !== 'sin' && t.owner_id !== Number(q.owner)) return false;
        const due = t.dup_due_at || t.due_at;
        if (q.due === 'late' && !(isOpen(t) && t.status !== 'Dispose programado' && due < n)) return false;
        if (q.due === 'soon' && !(isOpen(t) && due >= n && due <= n + D)) return false;
        if (q.enr && t.enr_status !== q.enr) return false;
        return true;
      }).sort(byDue).map(row);
    }
    m = p.match(/^\/api\/tickets\/(\d+)(?:\/([\w-]+))?$/); if (!m) fail(404, 'No existe.');
    const id = Number(m[1]), act = m[2];
    if (!act) { const t = tk(id); return { ...row(t), events: DB.events.filter(e => e.ticket_id === id).sort((a, b) => b.created_at - a.created_at || b.id - a.id), messages: DB.messages.filter(x => x.ticket_id === id), evidence: DB.evidence.filter(x => x.ticket_id === id).map(({ data, ...e }) => ({ ...e, src: data })) }; }
    const t = tk(id);
    switch (act) {
      case 'take': take(u, id); break;
      case 'release': { const o = openT(id); if (!o.owner_id) fail(409, 'El ticket no tiene responsable.'); manage(u, o); const prev = user(o.owner_id).name; o.owner_id = null; if (o.status === 'En gestión') o.status = 'Abierto'; event(o, u, 'asignacion', `Liberó el ticket (responsable anterior: ${prev})`); break; }
      case 'transfer': { const o = openT(id); manage(u, o); const to = DB.users.find(x => x.id === Number(body.to) && x.role === 'admin'); if (!to) fail(400, 'Elige a una persona de Procesamiento o Customer Service.'); const prev = o.owner_id ? user(o.owner_id).name : 'sin responsable'; o.owner_id = to.id; if (o.status === 'Abierto') o.status = 'En gestión'; event(o, u, 'asignacion', `Transfirió de ${prev} a ${to.name}`); break; }
      case 'waiting': setWaiting(u, id, body.dept); break;
      case 'location': { const o = openT(id); manage(u, o); o.location = String(body.location || '').trim() || null; event(o, u, 'ubicacion', 'Ubicación física: ' + (o.location || 'sin registrar')); break; }
      case 'messages': { needAdmin(u); const b = String(body.body || '').trim(); if (!b && !body.photo) fail(400, 'Escribe un mensaje o adjunta una foto.'); const ev = body.photo ? addEvidence(u, t, body.photo, 'general', 'Envió una foto en el chat') : null; if (b) msg(u, id, b); save(); return { ok: true, evidence_id: ev }; }
      case 'confirm-dup': confirmDup(u, id); break;
      case 'resolve': { need(u, 'resolve'); const o = openT(id); if (o.owner_id !== u.id) fail(403, 'Toma el ticket para resolverlo.'); if (o.status === 'Dispose programado') fail(409, 'Este ticket está en Dispose programado; confirma la disposición con evidencia.'); const r = String(body.resolution || '').trim(); if (r.length < 8) fail(400, 'Escribe la resolución final (qué se hizo y dónde quedó el paquete).'); Object.assign(o, { status: 'Resuelto', resolution: r, resolved_at: now() }); event(o, u, 'resolucion', 'Resolvió: ' + r); break; }
      case 'evidence': { needAdmin(u); const eid = addEvidence(u, t, { name: body.name, data: body.data }, body.purpose, body.purpose === 'dispose' ? 'Subió evidencia de disposición' : 'Agregó evidencia'); save(); return { id: eid }; }
      case 'dispose-done': { need(u, 'dispose'); if (t.status !== 'Dispose programado') fail(409, 'El ticket no está en Dispose programado.'); const e = DB.evidence.find(x => x.id === Number(body.evidence_id) && x.ticket_id === id && x.created_at >= t.dispose_scheduled_at); if (!e) fail(400, 'Sube la evidencia de la disposición antes de confirmarla.'); Object.assign(t, { status: 'Dispose realizado', dispose_done_at: now() }); event(t, u, 'dispose', 'Confirmó Dispose realizado con evidencia: ' + e.file_name); break; }
      case 'discard': { need(u, 'discard'); if (body.confirm !== true) fail(400, 'Falta la segunda confirmación.'); const r = String(body.reason || '').trim(); if (r.length < 10) fail(400, 'La justificación es obligatoria (mínimo 10 caracteres).'); if (t.status === 'Descartado') fail(409, 'Ya está descartado.'); Object.assign(t, { status_before_discard: t.status, status: 'Descartado', discarded_by: u.id, discarded_at: now(), discard_reason: r }); event(t, u, 'descarte', 'Descartó la incidencia: ' + r); break; }
      case 'restore': { need(u, 'restore'); if (t.status !== 'Descartado') fail(409, 'El ticket no está descartado.'); t.status = t.status_before_discard || 'Abierto'; event(t, u, 'descarte', 'Restauró la incidencia descartada'); break; }
      case 'damage-outcome': { needAdmin(u); if (!OUTCOMES.includes(body.outcome)) fail(400, 'Desenlace no válido.'); if (t.type !== 'danado') fail(404, 'No es un envío dañado.'); t.damage_outcome = body.outcome; event(t, u, 'danado', 'Desenlace del envío dañado: ' + body.outcome); break; }
      case 'research': { needAdmin(u); const v = String(body.value || '').trim(); if (!v) fail(400, 'Escribe un MX/ES o una guía.'); const c = normCode(v); if (c) { t.code = c; t.plat = c.slice(0, 2); } else t.trk = v.replace(/\s+/g, ''); event(t, u, 'agente', 'Pidió nueva búsqueda con ' + v); enqueue(t); break; }
      default: fail(404, 'No existe.');
    }
    return { ok: true };
  }

  load();
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, opts = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!/^\/api\//.test(url)) return realFetch(input, opts);
    const method = (opts.method || 'GET').toUpperCase();
    let body = {}; try { body = opts.body ? JSON.parse(opts.body) : {}; } catch {}
    let status = 200, out;
    try { out = route(method, url, body); if (method !== 'GET') save(); }
    catch (e) { status = e.status || 500; out = { error: e.message || 'Error' }; if (!e.status) console.error(e); }
    return new Response(JSON.stringify(out), { status, headers: { 'Content-Type': 'application/json' } });
  };
  window.mxwDemoReset = () => { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY + '-uid'); } catch {} location.reload(); };
})();
