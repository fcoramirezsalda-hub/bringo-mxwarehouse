// Prueba de concepto del agente de búsqueda (solo lectura).
//
//   node poc.js login            Abre Bringgo y EasyShip con ventana para que inicies sesión tú.
//                                La sesión queda guardada en ./perfil (no se guarda ninguna contraseña).
//   node poc.js mx  MX-2900440   Bringgo · Accept goods (Search with BGMX)
//   node poc.js guia 191255213580 Bringgo · Item Look Up: Outbound → Inbound → Canceled Tracking Number
//   node poc.js es  877615833234 EasyShip · Item lookup
//
// Reglas: solo escribe en los campos de búsqueda y solo presiona "Search"/buscar.
// Nunca presiona Accept, Print, Add Package, Wrong Product ni nada que cambie datos.
// Si algo no se encuentra, guarda captura y HTML en ./capturas (contienen datos de clientes: no compartir).

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URLS = {
  bringgoAccept: 'https://app.bringgoship.com/en/dropshipping/add-package',
  bringgoLookup: process.env.BRINGGO_LOOKUP_URL || 'https://app.bringgoship.com/en/dropshipping/item-lookup',
  easyLookup: 'https://warehouse.easyshipping.cloud/lookup/',
};
const PERFIL = path.join(__dirname, 'perfil');
const CAPTURAS = path.join(__dirname, 'capturas');
const HEADLESS = process.env.HEADLESS === 'true';

async function abrir(headless = HEADLESS) {
  return chromium.launchPersistentContext(PERFIL, { headless, viewport: { width: 1400, height: 900 } });
}

async function evidencia(page, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const base = path.join(CAPTURAS, `${new Date().toISOString().replace(/[:.]/g, '-')}-${nombre}`);
  await page.screenshot({ path: base + '.png', fullPage: true }).catch(() => {});
  fs.writeFileSync(base + '.html', await page.content().catch(() => ''));
  console.error(`  Guardé captura y HTML en ${base}.*  (para ajustar el script)`);
}

function pareja(texto, etiquetas) {
  // Convierte bloques "Etiqueta\nValor" o "Etiqueta: Valor" en un objeto.
  const lineas = texto.split('\n').map(s => s.trim()).filter(Boolean);
  const out = {};
  for (let i = 0; i < lineas.length; i++) {
    for (const et of etiquetas) {
      const l = lineas[i];
      if (l.toLowerCase().startsWith(et.toLowerCase())) {
        const resto = l.slice(et.length).replace(/^[:\s]+/, '');
        out[et] = resto || lineas[i + 1] || '';
      }
    }
  }
  return out;
}

async function tablaComoObjetos(page) {
  // Lee la tabla "Search Result": usa los encabezados como nombres de campo.
  return page.evaluate(() => {
    const t = document.querySelector('table');
    if (!t) return [];
    const heads = [...t.querySelectorAll('thead th')].map(th => th.innerText.trim());
    return [...t.querySelectorAll('tbody tr')].map(tr => {
      const o = {};
      [...tr.querySelectorAll('td')].forEach((td, i) => { o[heads[i] || 'col' + i] = td.innerText.trim().replace(/\s*\n\s*/g, ' | '); });
      return o;
    }).filter(o => Object.values(o).some(Boolean));
  });
}

async function bringgoMX(page, mx) {
  await page.goto(URLS.bringgoAccept, { waitUntil: 'networkidle' });
  await page.getByText('Search with BGMX', { exact: false }).click().catch(() => {});
  const campo = page.locator('input[type="text"], input[type="search"]').filter({ hasNot: page.locator('[readonly]') });
  // El campo de búsqueda de orden es el que está junto a los botones Search / Clear.
  const input = page.locator('xpath=//button[normalize-space()="Search"]/preceding::input[1]').first();
  await (await input.count() ? input : campo.nth(1)).fill(mx);
  await page.getByRole('button', { name: 'Search', exact: true }).first().click();
  await page.waitForLoadState('networkidle');
  await page.getByText('Order Details', { exact: false }).first().waitFor({ timeout: 15000 });
  const detalles = await page.locator('text=Order Details').locator('xpath=ancestor::*[self::div][3]').first().innerText().catch(() => '');
  const destino = await page.locator('text=Recipient Address').locator('xpath=ancestor::*[self::div][3]').first().innerText().catch(() => '');
  return {
    fuente: 'Bringgo · Accept goods',
    orden: pareja(detalles, ['Product Name', 'W.T No', 'ASIN', 'Quantity', 'Length (CM)', 'Width (CM)', 'Height (CM)', 'Weight (KG)']),
    destinatario: pareja(destino, ['Full Name', 'Colony', 'City', 'State', 'Zip Code', 'Country']),
  };
}

async function bringgoGuia(page, guia) {
  if (!URLS.bringgoLookup) throw new Error('Falta BRINGGO_LOOKUP_URL (la dirección de Item Look Up en Bringgo).');
  for (const tipo of ['Outbound Tracking Number', 'Inbound Tracking Number', 'Canceled Tracking Number']) {
    await page.goto(URLS.bringgoLookup, { waitUntil: 'networkidle' });
    await page.getByText('Search Type').locator('xpath=following::*[1]').click();
    await page.getByText(tipo, { exact: true }).click();
    await page.getByText('Search Value').locator('xpath=following::input[1]').fill(guia);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const filas = await tablaComoObjetos(page);
    if (filas.length) return { fuente: 'Bringgo · Item Look Up · ' + tipo, resultados: filas };
  }
  return { fuente: 'Bringgo · Item Look Up', resultados: [] };
}

async function easyBuscar(page, valor) {
  await page.goto(URLS.easyLookup, { waitUntil: 'networkidle' });
  const input = page.locator('main input, input[type="search"], input[type="text"]').first();
  await input.fill(valor);
  await input.press('Enter');
  await page.getByText(/\d+ results?/i).first().waitFor({ timeout: 15000 });
  const tarjetas = await page.locator('a[href*="order"], a:has-text("#")').evaluateAll(as =>
    as.map(a => a.closest('div[class]')?.parentElement?.innerText || '').filter(Boolean));
  const etiquetas = ['Tracking ID', 'Seller Order', 'Buyer Order', 'Buyer Tracking'];
  return { fuente: 'EasyShip · Item lookup', resultados: tarjetas.map(t => ({ ...pareja(t, etiquetas), texto: t.slice(0, 400) })) };
}

(async () => {
  const [modo, valor] = process.argv.slice(2);
  if (!modo) { console.log('Uso: node poc.js login | mx MX-0000000 | guia NUMERO | es NUMERO'); return; }

  if (modo === 'login') {
    const ctx = await abrir(false);
    const p1 = await ctx.newPage(); await p1.goto(URLS.bringgoAccept);
    const p2 = await ctx.newPage(); await p2.goto(URLS.easyLookup);
    console.log('Inicia sesión en las dos pestañas. Cuando veas las páginas de búsqueda, cierra la ventana del navegador.');
    await new Promise(r => ctx.on('close', r));
    console.log('Sesión guardada en ./perfil');
    return;
  }

  if (!valor) { console.error('Falta el valor a buscar.'); process.exit(1); }
  const ctx = await abrir();
  const page = ctx.pages()[0] || await ctx.newPage();
  const t0 = Date.now();
  try {
    const r = modo === 'mx' ? await bringgoMX(page, valor.toUpperCase())
            : modo === 'guia' ? await bringgoGuia(page, valor.replace(/\s/g, ''))
            : modo === 'es' ? await easyBuscar(page, valor)
            : null;
    if (!r) throw new Error('Modo desconocido: ' + modo);
    console.log(JSON.stringify({ busqueda: valor, segundos: ((Date.now() - t0) / 1000).toFixed(1), ...r }, null, 2));
  } catch (e) {
    console.error('No se pudo leer el resultado:', e.message);
    if (/login|sign in/i.test(page.url())) console.error('  Parece que la sesión venció. Corre: node poc.js login');
    await evidencia(page, modo);
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
})();
