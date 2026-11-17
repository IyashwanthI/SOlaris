# Solari Analytics — Agent-Assist Frontend

React + Vite + Tailwind SPA for the Support Agent-Assist & Resolution
Intelligence prototype. Talks to the existing FastAPI backend at
`http://localhost:8000` (unmodified).

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Keep the backend running separately:

```bash
uvicorn main:app --reload --port 8000
```

## Routes

- `/workspace` — split-screen agent workspace (search, matches, co-pilot).
- `/admin` — knowledge-gap review + KB indexing (RBAC via role switcher).
- `/benchmark` — golden evaluation suite (Recall@4 + guardrail pass rate).

## Graceful degradation

The current backend implements `/api/search`, `/api/copilot`, `/api/feedback`,
and `/api/feedback/stats`. The frontend also targets `/api/tickets/incoming`,
`/api/admin/gaps`, `/api/admin/gaps/{id}/approve`, and `/api/benchmark`. When
any of those are missing (404/network) the UI falls back to built-in presets
and runs the benchmark/golden set live through `/api/search`, so the demo
always works. Missing response fields (`recommended_route`, `cosine_sim`,
`search_mode`) are derived or defaulted client-side.

All requests send `X-Demo-Role: <agent|admin>`; approvals enforce RBAC and show
the backend's `403 Forbidden` message when an agent attempts them.
