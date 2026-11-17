# Agente de búsqueda de órdenes (Bringgo y EasyShip)

Estado: **diseño + simulación en el prototipo**. No hay conexión real todavía.

## Qué hace

1. El operador registra la incidencia solo con el MX/ES tecleado o la guía escaneada. **No se muestra información del producto al registrar.**
2. El ticket entra a una cola de búsqueda (`enrichment_jobs`).
3. Un proceso en segundo plano consulta en **solo lectura**:

| Dato registrado | Dónde busca | Página |
|---|---|---|
| Código MX | Bringgo · **Accept goods** (Search with BGMX) | https://app.bringgoship.com/en/dropshipping/add-package |
| Guía escaneada (sin código) | Bringgo · **Item Look Up**, en este orden: Outbound Tracking Number → Inbound Tracking Number → Canceled Tracking Number | https://app.bringgoship.com/en/dropshipping/item-lookup |
| Código ES | EasyShip · **Orden** (`prepare-v2/<número>`); si no abre, Item lookup | https://warehouse.easyshipping.cloud/prepare-v2/4748635/ |
| Guía ES | EasyShip · **Item lookup** | https://warehouse.easyshipping.cloud/lookup/ |
| Número sin MX/ES (ej. `4748635`, tecleado en el campo de código) | Bringgo Accept goods como `MX-4748635` **y** EasyShip Orden como `ES-4748635`. Si aparece en una sola, el ticket queda con ese código; si aparece en las dos, muestra ambas y pide confirmar | — |

4. Escribe la información de la orden en el ticket: producto, ASIN, cantidad, fecha, seller order ID, cliente, destino, paquetería, guía mexicana y guía americana. También deja la fuente y la hora.
5. Si no encuentra nada, marca "Sin coincidencias"; Victor o CS pueden agregar un MX/ES o una guía y volver a buscar.

Se acepta un retraso de **2–3 minutos** entre el registro y la aparición de la información en el panel de Victor y CS.

### Bringgo · Item Look Up (captura del propietario, 2026-11-15)

Tipos de búsqueda disponibles: ASIN, Product Name, Outbound Tracking Number, Seller Order ID, Buyer Order ID,
Inbound Tracking Number, Receipent Name, Canceled Tracking Number. Formulario: "Search Type" + "Search Value" + "Search".

**Resultado** (captura con búsqueda por Outbound Tracking Number): tabla "Search Result", 25 por página, "Total Records".

| Columna en Bringgo | Campo en el ticket | ¿Se guarda? |
|---|---|---|
| USER (nombre + correo) | Usuario (cliente Bringgo) | Solo el nombre y su código de cliente; **el correo no** (dato personal que no se necesita) |
| W.H CODE | Código MX | Sí; si el ticket se registró solo con guía, completa el MX |
| (imagen) | Foto del producto | Pendiente decidir: guardar la URL o solo mostrarla |
| PRODUCT NAME | Producto | Sí |
| ASIN | ASIN | Sí |
| PRODUCT QUANTITY | Cantidad | Sí |
| SELLER ACCOUNT ORDER NO | Seller account order no | Sí |
| BUYER ORDER ID | Buyer order ID | Sí |
| OUTBOUND TRACKING (paquetería, número, estado, fecha) | Guía mexicana + paquetería + estado del envío | Sí |
| CREA… (columna cortada) y las que siguen a la derecha | — | **Falta ver** las columnas ocultas por el scroll |

Si hay más de un resultado, el agente guarda todos como candidatos y no elige solo; Victor o CS confirman cuál es.

### EasyShip · Item lookup (captura de ejemplo, 2026-11-15)

Un buscador libre ("Where an item is and what happened to it"). Devuelve tarjetas ("N results"):

| Dato en la tarjeta | Campo en el ticket | ¿Se guarda? |
|---|---|---|
| #4442683 + etiqueta (MX) + estado (Delivered) | Orden EasyShip + estado | Sí |
| Correo | — | **No** |
| Nombre del producto + ASIN | Producto, ASIN | Sí |
| Tracking ID | Guía mexicana | Sí |
| Seller Order | Seller order | Sí |
| Buyer Order | Buyer order | Sí |
| Buyer Tracking | Guía americana (inbound) | Sí |
| (más abajo, cortado en la captura) | — | Falta ver |

~~Pendiente: ¿el "#4442683" es el número que corresponde al ES?~~ Resuelto 2026-11-17 (captura del propietario): `ES-4748635` es la orden
`https://warehouse.easyshipping.cloud/prepare-v2/4748635/`, la pantalla que sale al buscar el ES.

### EasyShip · Orden `prepare-v2` (captura de ejemplo, 2026-11-17)

Solo se abre la página y se lee. **Nunca** se presiona "Send with standard", "Save Changes", "Change", "Add Note" ni "Report an Exception".

| En la página | Se guarda como | Verificado con la página real |
|---|---|---|
| Estado (ej. `PRE_LABEL_CREATED`) | Orden EasyShip `#4748635 · estado` | No (solo captura) |
| User Info - #15589 | Usuario | No |
| Tarjeta seleccionada (ej. PAQUETEXPRESS > STANDARD) | Paquetería | No |
| Box Price [0.60 lbs] | Peso | No |
| Orden Amazon (###-#######-#######), ASIN y producto, si aparecen | Orden Amazon, ASIN, Producto | No |
| Correo del usuario | No se guarda (se quitan correos) | — |

## Reglas

- Solo lectura: nunca pulsa botones que cambien algo (Accept goods, Print, Add Package, Wrong Product, etc.).
- Un trabajo por ticket; reintentos con espera creciente (1, 3, 10 min) y máximo 3 intentos antes de "Sin coincidencias".
- Idempotente: si el ticket ya tiene información, no vuelve a consultar salvo que alguien pida "Buscar de nuevo".
- Límite de velocidad para no saturar las plataformas (p. ej. 1 consulta cada 5–10 s por plataforma).
- Credenciales en un gestor de secretos, nunca en el repositorio ni en documentos o chats.
- Cada consulta queda en bitácora: ticket, plataforma, resultado y hora.

## Cuentas que usa el agente (decisión 2026-11-15)

- **Por ahora:** las cuentas existentes de **Francisco R.** en Bringgo y en EasyShip.
- **Después:** cada miembro del equipo (Victor, Samantha M., Pamela V., Rachel) puede ligar sus propias cuentas.
  Solo un usuario con permiso "Administrar usuarios" (hoy Francisco R.) liga cuentas y elige con cuál consulta el agente.
- Las contraseñas se capturan en un formulario seguro del sistema y van directo al gestor de secretos; nunca se muestran de nuevo.
- Prototipo: panel "Cuentas de Bringgo y EasyShip para el agente" en Equipo y permisos (conexión simulada, sin campos de contraseña).

### Riesgos de usar una cuenta personal y cómo mitigarlos

| Riesgo | Mitigación |
|---|---|
| El agente puede cerrar la sesión de Francisco si la plataforma permite una sola sesión por usuario | Reutilizar una sola sesión del agente y no iniciar sesión en cada consulta; agrupar búsquedas cada 1–2 min. Si se detecta el conflicto, pasar a otra cuenta o pedir una dedicada. |
| En Bringgo/EasyShip, las consultas del agente aparecen como hechas por Francisco | La bitácora del sistema registra qué consultó el agente y cuándo. |
| Si cambia la contraseña de Francisco, el agente falla | El agente marca "Sin conexión con Bringgo/EasyShip" en el panel; se actualiza la contraseña desde el formulario seguro. |
| La cuenta tiene permisos completos (puede aceptar, imprimir, modificar) | El código del agente solo usa las pantallas de búsqueda y nunca pulsa botones de acción; revisión de código obligatoria (Codex). |

## Cómo implementarlo (en orden de preferencia)

1. **API o exportación oficial** de Bringgo / EasyShip. Es lo más estable. Pendiente preguntar a ambas plataformas.
2. **Automatización de navegador** (Playwright, sin interfaz gráfica) con un usuario dedicado: abre la página, busca el código y lee los campos. Es determinista y no necesita un modelo de IA. Requiere confirmar que los términos de uso de cada plataforma lo permiten.
3. Un agente de IA que use el navegador solo tiene sentido si las páginas cambian mucho. Es más lento y caro; no es la primera opción.

### Decisión: automatización de navegador (2026-11-15)

El propietario eligió la opción 2.

**Piezas**

| Pieza | Qué es |
|---|---|
| Worker | Programa (Node.js + Playwright) que corre todo el tiempo con un Chromium sin ventana |
| Cola | Tabla `enrichment_jobs` en la base de datos del WMS: ticket, qué buscar, estado, intentos |
| Sesión guardada | Cookies de Bringgo y EasyShip guardadas cifradas, para no iniciar sesión en cada búsqueda |
| Secretos | Usuario y contraseña en variables de entorno o gestor de secretos del servidor |
| Bitácora | Cada consulta: ticket, plataforma, resultado, duración; captura de pantalla solo si falla |

**Ciclo de cada búsqueda**

1. Toma el siguiente trabajo pendiente de la cola (con candado, para que dos workers no tomen el mismo).
2. Si la sesión venció, inicia sesión con la cuenta configurada.
3. Abre la página que corresponde (Accept goods, Item Look Up o EasyShip Item lookup), escribe el valor y presiona buscar.
4. Lee la tabla o tarjeta de resultado y la convierte en los campos del ticket.
5. Guarda el resultado, marca el trabajo como hecho y espera 5–10 s antes del siguiente.
6. Si falla: reintenta a 1, 3 y 10 min; después marca "Sin coincidencias" o "Error de conexión".

**Dónde corre (a elegir)**

| Opción | Ventaja | Desventaja |
|---|---|---|
| Servidor en la nube (VPS pequeño, ~10–20 USD/mes) | Siempre encendido, no depende de la bodega | Hay que contratarlo |
| PC de la bodega siempre encendida | Sin costo extra | Si se apaga o se reinicia, se detiene |
| El mismo servidor del WMS | Todo en un lugar | Depende de que exista ese servidor |

**Elegido (2026-11-15): PC de la bodega.** La búsqueda solo se necesita mientras se reportan incidencias en el turno;
después el seguimiento es dentro de la plataforma interna.

Consecuencias de diseño:
- La cola vive en la base de datos del WMS, no en la PC. Si la PC se apaga, los trabajos esperan y se procesan al encenderla; no se pierde nada.
- El worker se conecta **hacia afuera** al WMS (API o base de datos). No hay que abrir puertos en la red de la bodega.
- El worker arranca solo al encender la PC (en Windows: Programador de tareas o un servicio con pm2/NSSM) y se reinicia si se cae.
- El panel muestra "Agente sin conexión desde hh:mm" si el worker deja de reportarse, para que nadie espere información que no va a llegar.
- La PC debe tener suspensión desactivada durante el turno y una cuenta de Windows propia para el worker.
- El WMS (tickets, panel de CS) sigue necesitando un lugar accesible para todo el equipo; eso es independiente de esta PC.

**Plan por fases**

1. **Prueba de concepto en la PC del propietario.** Un script que busca un MX y una guía en Bringgo y un caso en EasyShip, y muestra los campos en pantalla. Confirma que el inicio de sesión y la lectura funcionan. No toca el WMS.
2. **Conectar a la cola** del WMS (o de un servidor de prueba) y escribir en los tickets.
3. **Pasar al servidor definitivo** con secretos, bitácora y alertas.

**Datos que hacen falta antes de la fase 1**

- ¿Bringgo o EasyShip piden código por correo/SMS (2FA) o captcha al iniciar sesión? Si sí, la sesión guardada se renueva a mano cada cierto tiempo.
- ¿Cuánto dura la sesión antes de pedir login otra vez?
- ¿La PC donde se hará la prueba puede tener Node.js instalado?

 (comparator, grader, analyzer) sirve para evaluar *skills* de Claude. No sirve para este agente de búsqueda.

### Evaluación: navegador del agente de ChatGPT (`@oai/browser-desktop`), 2026-11-15

El propietario compartió el código con que su agente de ChatGPT controla su navegador (lista navegadores conectados,
lee la documentación del entorno y reutiliza la pestaña abierta de Bringgo).

- **Confirma que la búsqueda web es viable:** Bringgo se puede operar desde un navegador automatizado con la sesión ya iniciada.
- **No sirve como agente de producción del MVP:** es un entorno propio de ChatGPT (no se instala en nuestro servidor), corre
  solo mientras hay una conversación activa, usa el navegador personal del propietario, cada búsqueda pasa por un modelo de IA
  (más lento, con costo y menos predecible) y los datos de clientes salen a un servicio externo.
- **Uso recomendado:** herramienta de exploración para verificar los selectores de `app/src/connectors.js`.
- **Idea equivalente dentro del MVP:** si el inicio de sesión del perfil del agente diera problemas, Playwright puede conectarse
  a un Chrome ya abierto con la sesión iniciada (`chromium.connectOverCDP`), igual que ese código reutiliza la pestaña existente.

## Pendiente del propietario

- Autorización: el propietario entiende que las consultas automatizadas están permitidas. Conviene confirmarlo por escrito con cada plataforma.
- ~~Usuario para el agente~~ → decidido: cuentas de Francisco R. por ahora (ver arriba). Cargar las credenciales cuando exista el servidor.
- Confirmar los campos que se necesitan en el ticket.
- Captura con resultado de Item Look Up de Bringgo y de Item lookup de EasyShip, para mapear los campos.
