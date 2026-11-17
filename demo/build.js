// Arma demo/dist/mx-wharehouse-demo.html: la interfaz real (app/public) + servidor simulado (demo/mock-api.js)
// en una sola página, para publicarla como enlace permanente sin backend.  Uso: node demo/build.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');
const version = JSON.parse(rd('app/package.json')).version;
let js = rd('app/public/app.js');
const swaps = [
  ['href="/api/evidence/${e.id}" target="_blank"', 'href="${e.src || \'#\'}" target="_blank"'],
  ['src="/api/evidence/${e.id}"', 'src="${e.src || \'\'}"'],
];
for (const [a, b] of swaps) { if (!js.includes(a)) throw new Error('No encontré en app.js: ' + a); js = js.split(a).join(b); }
const body = rd('app/public/index.html').match(/<body>([\s\S]*?)<script src="app.js"><\/script>/)[1];
const css = rd('app/public/app.css') + `
.demo-banner{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center;padding-block:8px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));background:var(--hi);color:var(--hi-ink);font-size:.84rem;font-weight:600}
.demo-banner button{border:1px solid currentColor;background:transparent;color:inherit;border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit}
`;
const html = `<title>MX Wharehouse</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${css}</style>
<div class="demo-banner"><span>Demo de la plataforma v${version} · PIN de prueba: 1234 para todos · los datos se guardan solo en este navegador · la búsqueda de órdenes usa datos de prueba</span><button type="button" onclick="mxwDemoReset()">Reiniciar datos</button></div>
${body}
<script>window.MXW_VERSION = '${version}';</script>
<script>${rd('demo/mock-api.js')}</script>
<script>${js}</script>
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist', 'mx-wharehouse-demo.html');
fs.writeFileSync(out, html);
console.log('Listo:', out, (html.length / 1024).toFixed(0) + ' KB');
