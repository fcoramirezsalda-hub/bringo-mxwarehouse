# Prueba de concepto · agente de búsqueda (Windows)

Busca una orden en Bringgo o EasyShip **en solo lectura** y muestra los campos en pantalla. No toca el WMS.

## 1. Instalar (una sola vez)

1. Instala Node.js LTS desde https://nodejs.org (opción "Windows Installer").
2. Copia esta carpeta `agent-poc` a la PC, por ejemplo en `C:\wms-agente\agent-poc`.
3. Abre "Símbolo del sistema" en esa carpeta y ejecuta:

```
npm install
npx playwright install chromium
```

## 2. Iniciar sesión (tú mismo, sin escribir contraseñas en ningún archivo)

```
node poc.js login
```

Se abre un navegador con Bringgo y EasyShip. Inicia sesión en las dos pestañas y cierra la ventana.
La sesión queda guardada en la carpeta `perfil` (no la compartas).

## 3. Probar

```
node poc.js mx MX-2900440
node poc.js es 877615833234
node poc.js guia 191255213580
```

Para que corra sin ventana: `set HEADLESS=true` antes del comando.

Si no logra leer el resultado, guarda una captura y el HTML en `capturas/`. Sirven para ajustar el script;
contienen datos de clientes, así que no se suben a ningún lado.

## Qué falta saber

- Los nombres exactos de los campos de búsqueda pueden variar; el primer intento puede necesitar ajustes.
