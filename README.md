# MX Wharehouse · Incidencias de registro

Plataforma complementaria a Bringgo (MX) y EasyShip (ES) para el almacén en México: registro de incidencias en 3 clics,
bandeja compartida para Procesamiento y Customer Service, y un agente que busca la información de la orden.

| Carpeta | Qué contiene |
|---|---|
| `app/` | MVP: servidor Node + SQLite, interfaz web, agente de búsqueda (Playwright) y copia a Google Sheets. Instalación en `app/LEEME.md`. |
| `docs/` | Contexto, requisitos, decisiones, tareas, conectores y handoff entre agentes. |
| `AGENTS.md` | Reglas comunes para Claude Code, Codex y ChatGPT. |
| `prototype/` | Maqueta interactiva (HTML, sin backend). |
| `agent-poc/` | Prueba de concepto original del lector de Bringgo/EasyShip. |

Pruebas: `cd app && npm install && npm test`.
