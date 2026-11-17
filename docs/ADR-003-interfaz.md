# ADR-003 · Idioma (ES/EN), inicio de sesión centrado y diseño horizontal oscuro/claro

Fecha: 2026-11-17 · Claude Code · Estado: implementado en v0.8.0 (pendiente de visto bueno del propietario)

## Pedido del propietario

1. Panel de idioma: el sistema en **español e inglés**.
2. Formato **centrado** al iniciar sesión y al agregar usuarios.
3. Diseño tipo **Vuexy Horizontal Dark Layout**, con opción a **blanco** (tema claro).

## Requisitos

| Tipo | Requisito |
|---|---|
| Funcional | Cambiar ES ↔ EN en cualquier pantalla, también antes de iniciar sesión, sin perder lo que se está capturando. |
| Funcional | Cambiar oscuro ↔ claro con un botón; oscuro por defecto. |
| Funcional | Inicio de sesión y "Agregar persona" centrados. |
| No funcional | Sin dependencias nuevas, sin migración, sin cambios en la API ni en las reglas del servidor. |
| No funcional | El servidor sigue recibiendo los valores en español (estados, áreas, desenlaces): la traducción es solo de pantalla. |
| No funcional | Funciona igual en la demo publicada (`demo/build.js`) y en la PC de la bodega. Sin scroll horizontal en celular. |

## Diseño

```
index.html
 ├─ <script> tema (antes de pintar: lee localStorage "mxw-theme", oscuro por defecto)
 ├─ .topbar  ── barra: marca · agente · [ES|EN] · ☀/☾ · usuario · Salir
 │            └ menú horizontal (Gestión / Piso / Personal; se desliza en celular)
 ├─ .main.wrap (contenedor centrado de 1440 px) ── #crumb + #view
 ├─ i18n.js  ── traduce lo que se pinta (MutationObserver)
 └─ app.js   ── genera el HTML en español (sin cambios de lógica)
```

**Idioma (`app/public/i18n.js`).** El español es el idioma fuente y sirve de clave (como `msgid` en gettext).
Un `MutationObserver` traduce los textos y los atributos `placeholder`, `title` y `aria-label` que app.js pinta:
1) diccionario exacto, 2) patrones para textos con datos ("Vence en 3 h", "INC-0004 reabierto"),
3) textos compuestos con " · ". Lo que no tiene traducción queda en español. Las fechas usan los meses del idioma.
Cambiar de idioma vuelve a pintar la vista actual (el formulario en curso se conserva en memoria).

- **No se traduce** (`translate="no"`): chat, resolución, justificación, descripción, "Otro" especificado,
  el historial de auditoría (queda como se registró), nombres y códigos.
- `<option>` sin `value` recibe el texto original en español como `value` antes de traducirse, para que el
  servidor reciba siempre el valor original (áreas, desenlaces, estados de retornos).
- Los mensajes de error fijos del servidor también se traducen en pantalla; el servidor no cambia.

**Tema (`app.css`).** Tokens de color en `:root[data-theme=dark|light]`. Paleta inspirada en el estilo Vuexy
(primario violeta `#7367F0`, fondo `#25293C` / `#F8F7FA`, tarjetas con sombra, menú activo con degradado), fuente
Public Sans. Es CSS propio: no se usa ni se copia la plantilla comercial Vuexy. En el tema claro los colores de
estado se oscurecen para mantener el contraste del texto sobre blanco.

**Preferencias.** Idioma y tema se guardan en el navegador de cada PC (`localStorage`: `mxw-lang`, `mxw-theme`).

## Alternativas descartadas

| Opción | Por qué no |
|---|---|
| Envolver cada texto de app.js en `t('…')` | ~400 cambios en app.js y en la demo; más riesgo de romper reglas ya probadas. Se puede migrar después, pantalla por pantalla, sin cambiar i18n.js. |
| Traducir en el servidor (mensajes y catálogos por idioma) | Toca la API y las pruebas; el historial quedaría mezclado. No hace falta para el piloto. |
| Guardar idioma/tema por usuario en la base | Requiere una columna nueva (migración, necesita aprobación). En la bodega cada PC suele tener su idioma. |
| Menú con desplegables por grupo (como Vuexy) | Agrega un clic a lo más usado (Bandeja, Registrar). Se dejó el menú plano con separadores. |
| Usar la plantilla Vuexy | Es de pago, trae Bootstrap/jQuery y cambiaría toda la interfaz. |

## Riesgos y qué revisar después

- Un texto nuevo en app.js sin entrada en el diccionario aparece en español en modo EN (no rompe nada). Al agregar textos, agregar su traducción.
- Si un mensaje de un usuario coincide exactamente con una clave (p. ej. "Resuelto"), se traduciría; por eso el chat va con `translate="no"`.
- Si el idioma debe seguir a la persona y no a la PC, hace falta la columna `users.lang` (migración).
- Si el diccionario crece mucho, separar `es.json` / `en.json` o migrar a `t('clave')`.
