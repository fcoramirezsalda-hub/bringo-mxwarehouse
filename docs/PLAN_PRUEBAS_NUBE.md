# Plan de pruebas · Tickets de incidencias antes de pedir la migración a la nube

Fecha: 2026-11-15 · Claude Code · Estado: propuesta para el propietario

## 1. Para qué es este documento

Para pedir la migración a la nube hay que demostrar dos cosas:

1. **Los tickets funcionan en la operación real**: registrar, tomar, gestionar, resolver, plazos, duplicados, descartes y agente.
2. **Mover el sistema de la PC de la bodega a un servidor en internet no rompe nada ni expone datos.**

Este plan dice qué probar, con qué tipo de prueba, qué hay hoy y qué falta. La sección 7 es la lista para decir "listo".

## 2. Qué ya está probado (`npm test`, 9 pruebas, todas pasan)

| Prueba | Cubre |
|---|---|
| Login y bloqueo | PIN incorrecto → 401; 5 intentos → 429 |
| Registro y anti-duplicado | Por código y por guía; el segundo reporte con el mismo motivo se agrega al expediente |
| Permisos de operador | El operador no ve ni gestiona tickets |
| Toma atómica | Dos personas toman a la vez → una gana, la otra recibe 409 |
| Resolver / descartar / restaurar | Resolver exige ser responsable; descartar exige permiso y justificación |
| Plazos | Retraso a 3 días y Dispose programado a 10 días, sin repetirse |
| Agente en modo de prueba | Llena la información de la orden o marca "sin coincidencias" |
| Restablecer PIN | Solo quien administra usuarios |
| Copia a Google Sheets | Alta, solo cambios, sin eventos repetidos, error de red, token incorrecto |

**Nota:** en una copia limpia `npm test` falla si antes no se corre `npm ci`. No hay CI que lo corra en cada cambio (ver sección 4.7).

## 3. Lo que bloquea la nube (encontrado en el código)

Estas no son pruebas que fallen hoy: son supuestos del piloto en una PC local que dejan de cumplirse en la nube.
Cada uno necesita un cambio **y** una prueba que lo demuestre.

| # | Hallazgo | Dónde | Riesgo en la nube | Prueba que debe pasar |
|---|---|---|---|---|
| B1 | PIN de 4 dígitos con bloqueo por usuario: tras 5 fallos se permite 1 intento por minuto, sin límite | `src/server.js:33-47` | Expuesto a internet, alguien puede adivinar el PIN de una cuenta en horas o pocos días (10 000 combinaciones) | Límite por IP y por usuario con bloqueo creciente; prueba que 50 intentos desde varias IP no logran entrar y que se registra la alerta |
| B2 | `/api/login-users` es público y devuelve todos los nombres y roles | `src/server.js:32` | Da la lista de cuentas a atacar | Sin sesión → 401, o la lista solo existe en la red de la bodega |
| B3 | La cookie de sesión no tiene `Secure` | `src/server.js:45` | Sin HTTPS la sesión viaja en claro | En producción la cookie lleva `Secure`; HTTP redirige a HTTPS |
| B4 | El agente y el servidor comparten el mismo archivo SQLite | `src/worker.js:6`, `src/db.js` | El agente corre en la PC de la bodega y la base estará en la nube: ya no puede abrir el archivo | El agente usa una API con token de máquina (tomar trabajo, entregar resultado, latido); pruebas de contrato de esa API |
| B5 | Las evidencias se guardan en disco local | `src/server.js:128-147` | El disco de un servidor en la nube puede borrarse al reiniciar o escalar | Evidencias en almacenamiento privado con URL firmada y corta; no hay ruta de borrado |
| B6 | El job de plazos corre dentro del servidor con `setInterval` | `src/server.js:196` | Con 2 instancias corre dos veces; si no hay instancias encendidas no corre | Dos ejecuciones simultáneas producen los mismos eventos que una (ya es idempotente; falta probarlo en paralelo) y un solo registro en `job_runs` por minuto |
| B7 | El tablero calcula "hoy" con la hora del servidor | `src/server.js:157` | Los servidores en la nube usan UTC: entre 18:00 y 24:00 (hora de México) los reportes de "hoy" se cuentan en el día siguiente | Prueba con `TZ=UTC` y reloj a las 23:30 de Ciudad de México: los tickets cuentan para el día correcto |
| B8 | Anti-duplicado y toma atómica dependen de que SQLite serializa las transacciones | `src/domain.js:78-96` | Si se cambia a PostgreSQL, dos registros simultáneos del mismo código pueden abrir dos tickets | Índice único parcial (código + motivo con ticket abierto) y prueba de 20 registros simultáneos → 1 ticket + 19 eventos |
| B9 | Respaldos: "copiar `data\` al final del día" a mano | `app/LEEME.md` | En la nube hay que tener respaldo automático y probar que se puede restaurar | Simulacro: restaurar el respaldo en un entorno aparte y comparar conteos |

> B4 y B8 son cambios de arquitectura: según `AGENTS.md` requieren aprobación del propietario antes de implementarse.

## 4. Pruebas por nivel

Objetivo de cobertura: **100 % de las reglas de `src/domain.js`** (cada `fail(...)` con su caso), **todas las rutas de `src/server.js`**
con al menos un caso permitido y uno negado. Medir con `node --test --experimental-test-coverage`; meta ≥ 85 % de líneas en `src/`
(excepto `connectors.js`, que se prueba contra las páginas reales).

### 4.1 Reglas de negocio (unitarias, `domain.js`, rápidas)

Faltan casos para funciones que hoy no tienen prueba:

| Función | Casos que faltan |
|---|---|
| `createIncident` | Código mal escrito → 400; guía de menos de 6 caracteres → 400; "sin etiqueta" con motivo distinto a Sin etiqueta/Otro → 400; "Otro" sin texto → 400; sin etiqueta sin descripción → 400; dañado → estado "Enviado dañado" y desenlace "Pendiente"; sin etiqueta no se deduplica; mismo código con **otro** motivo sí abre ticket nuevo; ticket cerrado no cuenta como duplicado |
| `normCode` | `mx 1234567`, `MX-1234567`, `es123456` → forma normal; `MX123` (corto) y `XX-123456` → `null` |
| `release` | Sin responsable → 409; otro usuario sin permiso `transfer` → 403; "En gestión" vuelve a "Abierto" |
| `transfer` | A un operador o usuario inactivo → 400; queda evento con "de X a Y" |
| `setWaiting` | Departamento inválido → 400; no saca a un ticket de "Dispose programado" |
| `confirmDup` | No es duplicado → 400; confirmar dos veces → 409; sin permiso → 403; inicia 10 días |
| `disposeDone` | Sin evidencia → 400; evidencia **anterior** a la programación → 400; evidencia de otro ticket → 400 |
| `discard` / `restore` | Sin segunda confirmación → 400; restaurar devuelve el estado previo exacto (p. ej. "Esperando respuesta") |
| `research` | Con código válido actualiza `code` y `plat`; cancela trabajos pendientes anteriores; **ticket cerrado** (hoy no se valida: decidir si se permite) |
| `runDeadlines` | Ticket "Esperando respuesta" también se marca tarde; duplicado confirmado no se marca tarde a los 3 días; ticket resuelto antes del plazo no se toca |

### 4.2 API y permisos (integración, `api.test.js`)

Para cada ruta: sin sesión → 401, rol que no debe → 403, caso correcto → 200. Faltan:

- `/api/my-reports`: el operador ve **solo** sus reportes.
- `/api/incidents/check`: avisa ticket abierto existente.
- `/api/tickets` con cada filtro (estado, motivo, responsable, origen, vencimiento, orden).
- `/api/tickets/:id/evidence`: tipo no permitido → 400; más de 8 MB → 400; nombre con `../` se limpia; el operador no puede subir.
- `/api/evidence/:id`: operador → 403; inexistente → 404; **no existe ningún DELETE** (prueba que lista todas las rutas y falla si aparece uno).
- Sesión vencida a las 14 h → 401; restablecer PIN cierra las sesiones de esa persona.
- Usuario desactivado no puede entrar ni usar su sesión abierta.
- Permisos de CS según DECISIONS pendiente #3: Samantha/Pamela/Rachel **no** pueden transferir tickets de otros, descartar, restaurar ni confirmar Dispose. (Confirmar la tabla con el propietario antes de fijar la prueba.)
- Historial: cada acción que cambia un ticket deja exactamente un evento con actor y hora (prueba que recorre el ciclo completo y compara la bitácora).

### 4.3 Concurrencia e integridad de datos

- 20 registros simultáneos del mismo código y motivo → 1 ticket y 19 eventos (B8).
- Tomar mientras otro transfiere el mismo ticket → estado final consistente, sin dos responsables.
- Dos procesos de plazos a la vez → mismos eventos que uno (B6).
- Dos agentes tomando trabajos de la cola → cada trabajo se procesa una sola vez.
- `version` aumenta en cada cambio (útil para detectar ediciones encimadas en la interfaz).

### 4.4 Agente de búsqueda (contrato y operación)

- Reintentos a 1, 3 y 10 min y luego "failed" (con reloj simulado).
- Trabajo que quedó "running" más de 5 min vuelve a "pending" (el agente se cayó).
- "Buscar de nuevo" cancela el trabajo anterior y el resultado viejo no sobrescribe al nuevo.
- Los datos guardados no contienen correos (prueba con un resultado falso que trae un correo).
- **Prueba manual en la PC de la bodega** con 3–5 tickets reales en Bringgo (Accept goods, Item Look Up) y EasyShip; guardar resultado y capturas. Hoy está pendiente (HANDOFF 8).
- Si se aprueba B4: pruebas de contrato de la API del agente (token inválido → 401; el agente no puede leer ni cambiar nada más que su cola).

### 4.5 Interfaz (de punta a punta con Playwright, pocas y lentas)

Un recorrido por persona, contra el servidor con base de prueba y agente en modo de prueba:

1. **Operador**: escanear guía → motivo → Abrir ticket en ≤ 3 clics; teclear MX/ES; sin etiqueta con descripción; aviso de ticket existente; "Mis reportes".
2. **Victor**: bandeja → filtro "sin responsable" → Tomar → chat → evidencia → Resolver.
3. **CS**: dos navegadores toman el mismo ticket → uno ve "X tomó este ticket un instante antes".
4. **Duplicado**: confirmar → avanzar reloj 10 días → Dispose programado → subir evidencia → Dispose realizado.
5. **Descarte**: justificación + doble confirmación → archivo → restaurar.
6. Vista de 400 px (celular) sin scroll horizontal y sin errores de consola.

### 4.6 Seguridad (antes de exponer a internet)

- B1, B2, B3 de la sección 3.
- Inyección: campos de texto (motivo "Otro", descripción, chat, resolución) con `'; DROP TABLE`, `<script>` → se guardan como texto y no se ejecutan en la interfaz.
- Encabezados: `nosniff`, `X-Frame-Options: DENY` y política de contenido (CSP).
- Ningún secreto en el repositorio (token de Sheets, sesión de Bringgo/EasyShip): revisión automática en CI.
- Las capturas del agente y las evidencias tienen datos de clientes: no son accesibles sin sesión.

### 4.7 Automatización (CI)

- GitHub Actions: `npm ci && npm test` en cada push y PR, en Linux con `TZ=UTC` (como estará en la nube) y Node 22.
- Bloquear la fusión si fallan.

### 4.8 Migración de datos y operación en la nube (entorno de prueba, no producción)

| Prueba | Cómo se acepta |
|---|---|
| Migrar la base del piloto | Copia de `incidencias.db` → nueva base: mismos conteos de tickets, eventos, mensajes y evidencias; 10 tickets revisados a mano campo por campo |
| Evidencias | Todas las de `data/evidencias/` abren en la nube; mismo número de archivos y mismo hash |
| Respaldo y restauración | Restaurar el respaldo de ayer en otro entorno en menos de 1 h |
| Carga | 10 usuarios a la vez durante un turno simulado (~300 registros/turno, 1 cada 2 s en picos): respuesta del registro < 1 s en el 95 % |
| Internet de la bodega cae | Qué ve el operador; definir plan B (hoja en papel o modo sin conexión) y probarlo |
| Reinicio del servidor | Sesiones, cola del agente y plazos siguen igual después de reiniciar |
| Google Sheets | La copia sigue funcionando desde la nube (la URL de Apps Script no cambia) |

### 4.9 Aceptación en piso (piloto, con personas reales)

Antes de pedir la nube, el piloto en la PC debe demostrar que el flujo sirve:

- **2 semanas** de uso en turno real.
- Todas las incidencias del turno se registran en el sistema (comparar contra lo que se reporta hoy por otros medios).
- Ningún ticket perdido ni duplicado por error del sistema.
- Victor y CS cierran tickets solo desde el sistema.
- El agente encuentra la orden en ≥ 80 % de los tickets con código o guía.
- Registro de problemas encontrados y cómo se resolvieron.

## 5. Ejemplos de pruebas

```js
// 4.3 · Anti-duplicado bajo concurrencia (B8)
test('20 registros simultáneos del mismo código abren un solo ticket', async () => {
  const op = await login('Adrian');
  const rs = await Promise.all(Array.from({ length: 20 }, () =>
    op('POST', '/api/incidents', { type: 'producto', code: 'MX-7770001' })));
  assert.ok(rs.every(r => r.status === 200));
  assert.strictEqual(rs.filter(r => !r.body.appended).length, 1);
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM tickets WHERE code='MX-7770001'").get().n, 1);
});

// 4.1 · Dispose solo con evidencia posterior a la programación
test('Dispose realizado rechaza evidencia subida antes de programarse', () => {
  // ticket duplicado con evidencia vieja → confirmDup → avanzar 10 días → runDeadlines
  assert.throws(() => dm.disposeDone(db, francisco, id, evidenciaVieja), { status: 400 });
});

// 3 · B7 · Zona horaria (correr con TZ=UTC)
test('el tablero cuenta como hoy un ticket de las 23:30 de Ciudad de México', async () => {
  clock = Date.parse('2026-11-20T23:30:00-06:00');
  // registrar ticket y pedir /api/stats → today debe incluirlo
});

// 4.2 · Evidencias nunca se borran
test('no existe ninguna ruta DELETE en la API', () => {
  const rutas = app._router.stack.filter(l => l.route).map(l => Object.keys(l.route.methods));
  assert.ok(!rutas.flat().includes('delete'));
});
```

## 6. Orden sugerido

1. CI (4.7) — media hora, protege todo lo demás.
2. Huecos de reglas y permisos (4.1, 4.2) — no cambian la arquitectura; tarea delimitada para Codex.
3. Prueba manual del agente en la PC de la bodega (4.4) y arranque del piloto (4.9).
4. Mientras corre el piloto: decidir con el propietario B4 (API del agente), B5 (almacenamiento de evidencias) y la base de datos en la nube (B8).
5. Seguridad (4.6, B1–B3) y zona horaria (B7).
6. Entorno de prueba en la nube: migración, respaldo, carga y caídas (4.8).
7. Pedir la migración con los resultados de la sección 7.

## 7. Lista para pedir la migración

- [ ] CI en verde en cada cambio, con `TZ=UTC`.
- [ ] Cobertura ≥ 85 % en `src/` y todas las reglas de `domain.js` con prueba.
- [ ] Recorridos de punta a punta (4.5) pasando.
- [ ] Agente probado contra Bringgo y EasyShip reales; tasa de acierto anotada.
- [ ] Piloto de 2 semanas terminado y sin tickets perdidos.
- [ ] B1–B9 resueltos o aceptados por escrito por el propietario.
- [ ] Migración de datos y restauración de respaldo probadas en un entorno aparte.
- [ ] Plan para cuando se cae el internet de la bodega.
- [ ] Decisiones pendientes que afectan pruebas respondidas: permisos de CS (#3), clave anti-duplicado (#5), paquete sin código (#6), duplicado ES (#7).
