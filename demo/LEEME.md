# Demo publicada (sin servidor)

`demo/build.js` junta la interfaz real (`app/public/`) con un servidor simulado (`demo/mock-api.js`) en una sola página:
`demo/dist/mx-wharehouse-demo.html`. Esa página se publica en el link permanente del panel "MX Wharehouse"
(https://claude.ai/artifact/AohXAPkYV8vAeoeb1g1zCy).

- PIN de prueba: 1234 para todos. Los datos se guardan solo en el navegador de quien la abre (botón "Reiniciar datos").
- El agente de búsqueda usa datos de prueba (MX-2900440, 191255213580, MX-3015532, ES-118412); lo demás da "Sin coincidencias".
- `mock-api.js` repite las reglas de `app/src/domain.js`. Si cambian las reglas o la API, actualiza los dos.

Regenerar después de cambiar la interfaz:

```
node demo/build.js
```

y volver a publicar el archivo en el mismo link.
