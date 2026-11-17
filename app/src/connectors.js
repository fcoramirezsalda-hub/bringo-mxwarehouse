// Lectores de Bringgo y EasyShip con Playwright. SOLO LECTURA:
// únicamente escriben en el campo de búsqueda y presionan "Search"/Enter.
// Nunca presionan Accept, Print, Add Package, Wrong Product ni nada que cambie datos.
// En la orden de EasyShip (prepare-v2) solo se abre la página y se lee: nunca "Send with standard",
// "Save Changes", "Change", "Add Note" ni "Report an Exception".
const fs = require('fs');
const path = require('path');

const URLS = {
  bringgoAccept: 'https://app.bringgoship.com/en/dropshipping/add-package',
  bringgoLookup: 'https://app.bringgoship.com/en/dropshipping/item-lookup',
  easyLookup: 'https://warehouse.easyshipping.cloud/lookup/',
  easyOrder: n => `https://warehouse.easyshipping.cloud/prepare-v2/${n}/`,
};
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const clean = v => String(v ?? '').replace(EMAIL, '').replace(/\s*\|\s*$/, '').replace(/^\s*\|\s*/, '').trim();

class SessionExpired extends Error { constructor(m) { super(m); this.name = 'SessionExpired'; } }

function pairs(text, labels) {
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean), out = [];
  for (let i = 0; i < lines.length; i++) for (const l of labels) {
    if (lines[i].toLowerCase().startsWith(l.toLowerCase())) {
      const rest = lines[i].slice(l.length).replace(/^[:\s]+/, '');
      const v = clean(rest || lines[i + 1] || '');
      if (v && !out.some(([k]) => k === l)) out.push([l, v]);
    }
  }
  return out;
}

async function checkLogin(page) {
  const u = page.url();
  if (/login|sign-?in|auth/i.test(u) || await page.locator('input[type="password"]').count()) throw new SessionExpired('La sesión venció. Corre: npm run agent:login');
}

async function evidence(page, dir, name) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`);
    await page.screenshot({ path: base + '.png', fullPage: true });
    fs.writeFileSync(base + '.html', await page.content());
    return base;
  } catch { return null; }
}

// Bringgo · Accept goods (por MX). Devuelve null si no hay orden.
async function bringgoByMX(page, mx) {
  await page.goto(URLS.bringgoAccept, { waitUntil: 'networkidle' }); await checkLogin(page);
  await page.getByText('Search with BGMX', { exact: false }).first().click().catch(() => {});
  const input = page.locator('xpath=//button[normalize-space()="Search"]/preceding::input[1]').first();
  await input.fill(mx);
  await page.getByRole('button', { name: 'Search', exact: true }).first().click();
  await page.waitForLoadState('networkidle');
  const found = await page.getByText('Order Details', { exact: false }).first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  if (!found) return null;
  const block = async label => page.getByText(label, { exact: false }).first().locator('xpath=ancestor::div[3]').innerText().catch(() => '');
  const det = pairs(await block('Order Details'), ['Product Name', 'W.T No', 'ASIN', 'Quantity', 'Length (CM)', 'Width (CM)', 'Height (CM)', 'Weight (KG)']);
  const rcp = pairs(await block('Recipient Address'), ['City', 'State', 'Country']);
  const get = k => (det.find(([a]) => a === k) || [])[1];
  return { code: get('W.T No') || mx, product: get('Product Name'), fields: [...det, ...rcp.map(([k, v]) => ['Destino · ' + k, v])], candidates: [] };
}

async function readTable(page) {
  return page.evaluate(() => {
    const t = document.querySelector('table'); if (!t) return [];
    const heads = [...t.querySelectorAll('thead th')].map(th => th.innerText.trim());
    return [...t.querySelectorAll('tbody tr')].map(tr => {
      const o = {}; [...tr.querySelectorAll('td')].forEach((td, i) => { const h = heads[i]; if (h) o[h] = td.innerText.trim().replace(/\s*\n\s*/g, ' | '); });
      return o;
    }).filter(o => Object.values(o).some(Boolean));
  });
}

// Bringgo · Item Look Up por guía: Outbound → Inbound → Canceled.
async function bringgoByTracking(page, trk) {
  for (const type of ['Outbound Tracking Number', 'Inbound Tracking Number', 'Canceled Tracking Number']) {
    await page.goto(URLS.bringgoLookup, { waitUntil: 'networkidle' }); await checkLogin(page);
    await page.getByText('Search Type', { exact: true }).locator('xpath=following::*[1]').click();
    await page.getByText(type, { exact: true }).last().click();
    await page.getByText('Search Value', { exact: true }).locator('xpath=following::input[1]').fill(trk);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await page.getByText(/Total Records|Search Result/).first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const rows = (await readTable(page)).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, clean(v)])));
    if (rows.length) {
      const first = rows[0];
      const code = first['W.H CODE'] || first['W.H Code'] || null;
      return { source: 'Bringgo · Item Look Up · ' + type, code, product: first['PRODUCT NAME'] || null,
        fields: Object.entries(first).filter(([, v]) => v), candidates: rows.length > 1 ? rows : [] };
    }
  }
  return null;
}

// EasyShip · Item lookup (por ES o por guía).
async function easyLookup(page, value) {
  await page.goto(URLS.easyLookup, { waitUntil: 'networkidle' }); await checkLogin(page);
  const input = page.locator('main input, input[type="search"], input[type="text"]').first();
  await input.fill(value); await input.press('Enter');
  const count = await page.getByText(/\d+\s+results?/i).first().waitFor({ timeout: 12000 }).then(() => page.getByText(/\d+\s+results?/i).first().innerText()).catch(() => '0 results');
  if (/^\s*0\s/.test(count)) return null;
  const cards = await page.locator('a:has-text("#")').evaluateAll(as => as.map(a => { let el = a; for (let i = 0; i < 6 && el.parentElement; i++) { el = el.parentElement; if (el.innerText.includes('Tracking')) break; } return el.innerText; }));
  if (!cards.length) return null;
  const parse = t => {
    const f = pairs(t, ['Tracking ID', 'Seller Order', 'Buyer Order', 'Buyer Tracking']);
    const ord = (t.match(/#\d+/) || [])[0]; const st = (t.match(/\b(Delivered|In transit|Created|Pending|Cancel\w*|Returned)\b/i) || [])[0];
    const asin = (t.match(/\bB0[A-Z0-9]{8}\b/) || [])[0];
    const lines = t.split('\n').map(s => clean(s)).filter(Boolean);
    const product = asin ? lines[lines.findIndex(l => l.includes(asin)) - 1] : null;
    return { ord, st, asin, product, fields: [...(ord ? [['Orden EasyShip', ord + (st ? ' · ' + st : '')]] : []), ...(product ? [['Producto', product]] : []), ...(asin ? [['ASIN', asin]] : []), ...f] };
  };
  const all = cards.map(parse);
  const code = /^ES-/i.test(value) ? value.toUpperCase() : null;
  return { source: 'EasyShip · Item lookup', code, product: all[0].product, fields: all[0].fields, candidates: all.length > 1 ? all.map(c => Object.fromEntries(c.fields)) : [] };
}

// EasyShip · orden por número (ES-4748635 → /prepare-v2/4748635/). Es la pantalla que sale al buscar el ES.
// Solo lectura: abre la página y lee el texto. Devuelve null si no existe la orden.
async function easyOrder(page, num) {
  const res = await page.goto(URLS.easyOrder(num), { waitUntil: 'networkidle' }); await checkLogin(page);
  if (res && res.status() >= 400) return null;
  const ok = await page.getByText(/User Info/i).first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  if (!ok) return null;
  const text = await page.locator('main').first().innerText().catch(() => '') || await page.locator('body').innerText();
  const lines = text.split('\n').map(s => clean(s)).filter(Boolean);
  const status = (text.match(/\b[A-Z]{3,}(?:_[A-Z]+)+\b/) || [])[0];
  const user = (text.match(/User Info\s*-\s*#(\d+)/i) || [])[1];
  const amazon = (text.match(/\b\d{3}-\d{7}-\d{7}\b/) || [])[0];
  const asin = (text.match(/\bB0[A-Z0-9]{8}\b/) || [])[0];
  const weight = (text.match(/Box Price\s*\[([^\]]+)\]/i) || [])[1];
  const sel = lines.findIndex(l => /SELECTED/i.test(l));
  const carrier = sel < 0 ? null : lines.slice(Math.max(0, sel - 4), sel + 1).reverse().find(l => / > /.test(l)) || null;
  const product = asin ? lines[lines.findIndex(l => l.includes(asin)) - 1] || null : null;
  const fields = [['Orden EasyShip', '#' + num + (status ? ' · ' + status : '')], ...(user ? [['Usuario', '#' + user]] : []),
    ...(product ? [['Producto', product]] : []), ...(asin ? [['ASIN', asin]] : []), ...(amazon ? [['Orden Amazon', amazon]] : []),
    ...(carrier ? [['Paquetería', carrier.replace(/\s*(CHARGED|USER'S CHOICE|SELECTED).*$/i, '')]] : []), ...(weight ? [['Peso', weight]] : [])];
  return { source: 'EasyShip · Orden', code: 'ES-' + num, product, fields, candidates: [] };
}

async function findES(page, code, tried) {
  const num = code.slice(3);
  tried.push('EasyShip · Orden'); let r = await easyOrder(page, num); if (r) return r;
  tried.push('EasyShip · Item lookup'); r = await easyLookup(page, code); return r ? { ...r, code: r.code || code } : null;
}

// Elige dónde buscar según lo registrado.
async function lookup(page, { code, trk }) {
  const tried = [];
  // Número sin MX/ES: se busca como MX-… en Bringgo y como ES-… en EasyShip.
  if (code && /^\d+$/.test(code)) {
    tried.push(`Bringgo · Accept goods (MX-${code})`); const mx = await bringgoByMX(page, 'MX-' + code);
    const es = await findES(page, 'ES-' + code, tried);
    if (mx && es) {
      const asObj = (src, r) => ({ Plataforma: src, Código: r.code, ...Object.fromEntries(r.fields) });
      return { source: 'Bringgo y EasyShip', code: null, product: null, tried,
        fields: [['Atención', `El número ${code} existe como MX-${code} y como ES-${code}: confirma cuál es y búscalo de nuevo con el prefijo.`]],
        candidates: [asObj('Bringgo', { ...mx, code: mx.code || 'MX-' + code }), asObj('EasyShip', es)] };
    }
    if (mx) return { ...mx, code: mx.code || 'MX-' + code, source: 'Bringgo · Accept goods', tried };
    if (es) return { ...es, tried };
    return { none: true, tried };
  }
  if (code && code.startsWith('MX')) { tried.push('Bringgo · Accept goods'); const r = await bringgoByMX(page, code); if (r) return { ...r, source: 'Bringgo · Accept goods', tried }; }
  if (code && code.startsWith('ES')) { const r = await findES(page, code, tried); if (r) return { ...r, tried }; }
  if (trk) {
    tried.push('Bringgo · Item Look Up (Outbound/Inbound/Canceled)'); let r = await bringgoByTracking(page, trk); if (r) return { ...r, tried };
    tried.push('EasyShip · Item lookup'); r = await easyLookup(page, trk); if (r) return { ...r, tried };
  }
  return { none: true, tried };
}

module.exports = { URLS, lookup, evidence, SessionExpired, clean, pairs };
