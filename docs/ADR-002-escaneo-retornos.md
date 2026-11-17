# ADR-002: Escaneo de retornos en MX Wharehouse con detección automática de paquetería y acomodo por racks

**Estado:** Aceptada por el propietario el 2026-11-17 · implementada (R2.1–R2.4), apagada hasta configurarla en la PC de la bodega
**Fecha:** 2026-11-17
**Decide:** Propietario
**Relacionado:** ADR-001 (consulta de retornos, apagado por defecto)

## Respuestas del propietario (2026-11-17)

1. Escanear en MX Wharehouse y la hoja como copia: **aprobado**.
2. Guardado: **columna nueva "Rack"** en Registro (columna J).
3. **10 racks, se acomodan por paquetería.** (No se respondió si tienen código de barras: el rack se asigna solo y el operador puede cambiarlo.)
4. Corrige la paquetería: **el operador**.
5. Apps Script nuevo con token: **sí**, y **el Sheets actual debe seguir funcionando**.

## Implementación (2026-11-17)

| Pieza | Archivo |
|---|---|
| Detector (port fiel + veto por dígito verificador FedEx) | `app/src/guias.js` |
| Escaneo, racks, anulación, sincronización con la hoja | `app/src/retornos-escaneo.js` |
| Apps Script nuevo (independiente del actual) | `app/integraciones/google-sheets/Retornos.gs` |
| Pantalla "Escanear retorno" (operadores y admins) + racks por paquetería (admin con "Administrar usuarios") | `app/public/app.js` |
| Pruebas (incluye `Retornos.gs` ejecutado contra una hoja simulada) | `app/test/guias.test.js`, `app/test/retornos-escaneo.test.js` |

Hallazgos que cambiaron el diseño:
- En Registro, **D (Mes), G (Control) e I (Clave única) son fórmulas que se extienden desde la fila 2** (`ARRAYFORMULA`/`MAP`).
  Escribir en ellas las rompería; `Retornos.gs` escribe solo A, B, C, E, F, H y J, y busca la última fila por la columna B (no `getLastRow`).
- Las escrituras de un script no disparan el `onEdit` del script actual ni las validaciones de B y C: MX envía ya la paquetería y el método.
- Para reintentos sin duplicar, `Retornos.gs` guarda en una pestaña oculta "MX Wharehouse" qué fila escribió cada escaneo.
- Dígito verificador FedEx (12 dígitos): 15/15 FedEx reales lo cumplen, pero 1 de 2 PaqueteExpress también (por azar).
  Se usa solo como **veto** (si no cumple, no puede ser FedEx) y como rasgo del modelo, nunca para asignar FedEx por sí solo.

Medición con datos reales (328 filas de Registro + Catálogo de guías, sin Referencias BrinGO):
- Coincidencia con la hoja: **328/328**.
- Guías nuevas (cada guía se quita del catálogo antes de detectarla): asigna **83.5 %** automáticamente con **100 %** de aciertos;
  el resto queda "Por identificar" para que el operador elija.

Racks iniciales (propuesta por volumen; se cambian en pantalla): PaqueteExpress → Rack 1, FedEx → 2, Estafeta → 3, DHL → 4, J&T → 5,
iMile → 6, UPS → 7, Correos de México / Castores / Afimex → 8, Cliente / RMA → 9, Por identificar → 10.

## Contexto

Hoy los retornos se escanean con un lector Eyoyo directamente en la hoja **"Escaneo de Retornos"** (pestaña Registro, columna B).
El Apps Script "Escaneo Retornos — Eyoyo" identifica la paquetería en este orden (revisado en solo lectura el 2026-11-17):

1. **Normalizar:** quita `]C1` (identificador de simbología GS1), espacios y `\x1d`; mayúsculas.
2. **Catálogo de guías** (confirmadas por operadores) → "Catálogo / selección aprendida".
3. **Referencia BrinGO / Process** (exportaciones de Bringgo) → "Referencia BrinGO / Process".
4. **Decodificadores fijos:** DHL `JJD…` (quita la J del lector); FedEx FDX1D de 34 dígitos
   (`10\d{18}00\d{12}` o `96\d{32}`; el tracking son los últimos 12/14); FedEx ASTRA de 32 dígitos (tracking en 17–28, solo si está en catálogo).
5. **Reglas** (expresiones regulares por paquetería, editables en la pestaña Reglas).
6. **Modelo ML:** Naive Bayes categórico con rasgos de longitud, forma (`#`/`A`), prefijos de 2-4 y letras inicial/final.
   Solo asigna con puntaje ≥ 98 %, ≥ 3 ejemplos parecidos (misma longitud, prefijo y forma) sin conflicto, y si la validación
   "deja uno fuera" da ≥ 95 % con ≥ 5 aceptadas. Hoy: 160 guías confirmadas, 29/29 aciertos en validación.
7. Si nada es seguro → **"Por identificar"**; el operador elige en la columna C y eso se **aprende** (catálogo + reentrenamiento).
8. **Duplicados:** clave normalizada (DHL sin J; FedEx por su tracking) → se rechaza el segundo escaneo.

Ambigüedad principal conocida: **guías numéricas de 11-12 dígitos** (FedEx vs PaqueteExpress vs Castores).

La hoja **no tiene rack** ni estado.

## Requisitos pedidos

1. Escanear directo en MX Wharehouse.
2. Detección automática de la paquetería, igual o mejor que la de la hoja.
3. Acomodo por racks.
4. Guardado en "Escaneo de Retornos" (simultáneo o diferido).

## Decisión propuesta

**La base local de MX Wharehouse pasa a ser el punto de escaneo de retornos, y la hoja queda como espejo**,
siguiendo el mismo patrón que ya funciona para la copia de tickets a Sheets (`sheets-sync.js`): guardar primero en local
y enviar a la hoja en segundo plano, con reintentos.

```
Eyoyo (teclado + Enter)
   │
   ▼
Pantalla "Escanear retorno"  ──►  POST /api/returns/scan
                                       │
                         ┌─────────────┼──────────────────────┐
                         ▼             ▼                      ▼
                  Detector de guía   Anti-duplicado       Sugerencia de rack
                  (guias.js)         (clave normalizada)  (racks por paquetería/capacidad)
                         └─────────────┬──────────────────────┘
                                       ▼
                               SQLite (return_scans)  ← fuente principal, respuesta < 100 ms
                                       │  cola "outbox"
                                       ▼
                     sheets-returns: Apps Script nuevo (doPost + token)
                                       ▼
                     "Escaneo de Retornos" › Registro (o pestaña nueva, ver opción 4)
```

### 1. Escaneo en la plataforma
- Nueva vista **"Escanear retorno"** (operadores y admins) con el campo de captura siempre enfocado; el Eyoyo funciona como
  teclado y termina con Enter, igual que el campo de escaneo de incidencias.
- Respuesta inmediata en pantalla: paquetería detectada + método + rack sugerido, con sonido distinto para OK / duplicado / por identificar.
- Si es "Por identificar": botones (chips) con las paqueterías; un toque confirma y **enseña** al modelo.
- Sin internet la captura sigue funcionando (todo es local); la hoja se pone al día cuando vuelva la conexión.

### 2. Detección de guía (`app/src/guias.js`)
Se **porta el mismo algoritmo** de la hoja a Node, con el mismo orden de prioridad y la misma regla de abstención, y se le añade:

| Mejora | Por qué |
|---|---|
| **Dígitos verificadores** (FedEx 12 dígitos: pesos 1-7-3 mód 11; UPS `1Z`: mód 10; Correos de México S10: UPU mód 11) | Es la señal más fuerte para separar FedEx de PaqueteExpress/Castores en guías numéricas, y no necesita ejemplos. **Se debe validar** con las guías confirmadas antes de usarla para decidir. |
| Rasgos de **n-gramas de caracteres** además de prefijos | Mejora el modelo con pocos ejemplos sin cambiar de algoritmo (sigue siendo Naive Bayes, explicable y sin dependencias). |
| **Consulta al agente de Bringgo** para guías dudosas | El agente ya busca por tracking en Bringgo; si la encuentra, la paquetería sale de la fuente y se agrega al catálogo. |
| **Prueba retrospectiva** (backtest) contra todo el historial de Registro | Antes de activar se mide: % identificado automáticamente y % de error, comparado con la hoja. Criterio: error ≤ 1 % en lo asignado. |
| Catálogo y reglas **compartidos** con la hoja | Las correcciones hechas en MX Wharehouse también se envían al "Catálogo de guías" de la hoja, para que ambos aprendan. |

No se propone una red neuronal: con ~160 ejemplos confirmados, reglas + verificadores + Naive Bayes con abstención es más preciso y auditable.

### 3. Acomodo por racks
- Tabla `racks` (código impreso en etiqueta, nombre, paquetería(s) asignadas, capacidad, activo).
- Al escanear se **sugiere** el rack: el de la paquetería detectada con espacio libre; "Por identificar" → rack de cuarentena.
- **Confirmación escaneando la etiqueta del rack** (código de barras): evita acomodos equivocados. Si no se confirma, queda "Sin acomodar".
- Mover de rack queda en historial (quién, cuándo, de dónde a dónde). Vista de ocupación por rack.
- Las reglas reales (cuántos racks, por paquetería o por fecha, capacidad) las define el propietario (ver preguntas).

### 4. Guardado en "Escaneo de Retornos"
Diferido de segundos (cola con reintentos), no en la misma petición: así el escaneo no depende de Google ni de internet.
Cada fila lleva la `Clave única`, de modo que reenviar no duplica.

| Opción | Pros | Contras |
|---|---|---|
| **4a. Agregar filas a Registro** (A-I iguales que hoy; Operador = usuario MX; Método = método de detección) | Las pestañas por mes/paquetería y el Site siguen funcionando sin cambios | Toca el sistema actual (requiere aprobación, AGENTS.md); agregar "Rack" necesitaría una columna nueva (J) |
| **4b. Pestaña nueva "MX Wharehouse"** en la misma hoja | No toca Registro ni sus fórmulas | Las pestañas por paquetería y el Site no ven esos escaneos |

**Recomendación: 4a**, con la columna "Rack" en J si se aprueba. Las escrituras por API no disparan el `onEdit` del script
actual, así que no se re-identifican ni se rechazan: MX Wharehouse envía ya la paquetería y el método.

### Transición (evitar duplicados entre canales)
1. Importar una vez Registro + Catálogo + Referencias a SQLite (para anti-duplicado y entrenamiento).
2. Piloto: escanear **solo** en MX Wharehouse; la hoja recibe las filas. No escanear en ambos a la vez.
3. Si hay que volver a la hoja, se apaga el módulo (`RETURNS_MODE=off`); nada se pierde porque la hoja ya tiene las filas.

## Opciones consideradas

| | A. Seguir escaneando en la hoja y solo consultarla (ADR-001) | **B. Escanear en MX Wharehouse, hoja como espejo (propuesta)** | C. MX Wharehouse llama al Apps Script en cada escaneo |
|---|---|---|---|
| Complejidad | Baja | Media | Media |
| Funciona sin internet | No | **Sí** | No |
| Racks | No | **Sí** | Sí |
| Velocidad por escaneo | 1-3 s (Apps Script) | **< 100 ms** | 1-3 s |
| Riesgo para el sistema actual | Ninguno | Bajo (escribe filas) | Bajo |
| Un solo lugar para incidencias + retornos | No | **Sí** | Sí |

## Consecuencias

- Más fácil: un solo punto de captura, retorno → ticket con un clic, racks auditados, funciona sin internet.
- Más difícil: mantener dos copias del catálogo de guías (se sincronizan); la hoja deja de ser donde se escanea.
- Cambios estructurales que requieren aprobación: tablas `return_scans`, `guide_catalog`, `guide_references`, `racks`,
  `rack_moves`, `returns_outbox`; un Apps Script nuevo con `doPost`; posible columna J en Registro.
- Sin dependencias nuevas de npm.

## Plan por fases (cada fase se entrega con pruebas y apagada hasta aprobar)

| Fase | Entregable | Cómo se prueba |
|---|---|---|
| R2.1 | `guias.js` (port + verificadores) y backtest contra el historial de la hoja | Mismo resultado que la hoja en ≥ 99 % de las guías; informe de diferencias |
| R2.2 | Pantalla "Escanear retorno", tablas, anti-duplicado, chips de "Por identificar" con aprendizaje | Pruebas de API + navegador con el lector |
| R2.3 | Racks: catálogo, sugerencia, confirmación por escaneo, movimientos | Pruebas + piloto en un rack |
| R2.4 | Envío a "Escaneo de Retornos" con cola y reintentos | Hoja de copia primero; luego la real con aprobación |
| R2.5 | Piloto en bodega, luego cambio de canal | Comparar conteos diarios hoja vs MX |

## Preguntas para el propietario

1. ¿Apruebas la opción B (escanear en MX Wharehouse y la hoja como espejo)?
2. Guardado: ¿4a (filas en Registro, con columna "Rack") o 4b (pestaña nueva)?
3. Racks: ¿cuántos hay, cómo se llaman, se asignan por paquetería, por fecha o por espacio? ¿Tienen o pueden tener etiqueta con código de barras?
4. ¿Quién puede corregir una paquetería detectada: cualquier operador (como hoy en la hoja) o solo admins?
5. ¿Se puede compartir la hoja con una cuenta de servicio o desplegar un Apps Script nuevo con token (como el de tickets)?
