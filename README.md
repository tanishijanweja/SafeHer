# SafeHer

An AI-powered community safety system for Delhi — **Person A scope**: report input & storage, plus Smart SOS.

Users report unsafe locations from a form, the report is saved (instantly, even if AI is slow), Gemini 2.5 Flash (with a local heuristic fallback) grades severity and flags spam, a risk score per 600 m grid cell (geohash-6) is updated, and the live heatmap reflects it. A panic SOS captures the user's location, notifies trusted contacts, and shows the nearest police stations and hospitals.

## Stack

- **Next.js + React + Tailwind CSS** — UI (`apps/web`)
- **Hono** — API (`apps/server`)
- **Prisma + Supabase (PostgreSQL)** — real shared database (Phase 2; Phase 1 uses a fake local store)
- **Gemini 2.5 Flash** — report analysis (falls back to a local classifier when no key / on timeout)
- **OpenStreetMap + Leaflet** — maps (no API key needed; `SafeMap` is the single render adapter)

## Run it

```bash
bun install
bun run dev:web        # web app at http://localhost:3100
bun run dev:server     # API at http://localhost:3110 (from apps/server/.env -> PORT)
```

No database or API keys are required to demo — the app seeds realistic fake reports from across Delhi
into localStorage and renders OpenStreetMap tiles. Sign in with **"Explore with demo account"** (user `test-user-001`).

Optional integrations (just add to `.env`):

- `apps/server/.env` → `GEMINI_API_KEY` enables real Gemini analysis (else heuristic fallback).

## Person A features

**Priority 1 — Report input & storage**

- `/reports/new` — report form: description, photo upload (auto-compressed), interactive map to pin location, category dropdown, auto-filled time, live AI severity preview.
- Photos are stored (data URL in Phase 1) and linked to the report via `image_url`.
- `/reports` — list of all reports with search + category/severity/verified filters.
- `/reports/[id]` — full report detail with map, nearby police/hospitals, corroborate, spam flag, re-run AI.
- `/login` — sign up / sign in (better-auth) + demo access.
- Realistic fake sample reports seeded across real Delhi locations.

**Priority 2 — Smart SOS**

- `/sos` — panic button with 3-second arming countdown, captures the user's location (geolocation).
- Backend saves the SOS event and notifies trusted contacts (email + in-app alert).
- Map shows the nearest police stations and hospitals with call buttons.
- `/contacts` — add / edit / remove trusted emergency contacts, with "send test alert".

## Shared data shape (every teammate builds against this)

```ts
Report:    { id, title, description, category, severity(1-5), latitude, longitude,
             image_url|null, is_spam, status("unverified"|"community-corroborated"),
             user_id, created_at, corroborations }
RiskScore: { geohash(6), historical_score, live_score, combined_score, last_updated, latitude, longitude }
```

**Fixed rules**

- Geohash precision level: **6** (~600 m grid).
- Map library: **OpenStreetMap** via Leaflet (wrapped by `SafeMap`, `apps/web/src/components/safe-map.tsx`).
- Dummy test user id: **`test-user-001`**.
- If Gemini fails or times out the report still saves with `status: "unverified"`, `severity: 3`,
  `is_spam: false` — never blocks saving, never freezes the app.

## Phase 1 → Phase 2 (shared database) swap

Everyone builds against fake data first. The swap to Person C's real database is small and contained:

- Web app: `apps/web/src/lib/store.ts` — each function has a documented matching Hono endpoint
  (replace the localStorage bodies with `fetch()` calls). The UI never changes.
- API: `apps/server/src/store.ts` — in-memory store; replace bodies with Prisma/Supabase queries.
- The Hono API already exposes: reports CRUD + corroborate, risk scores, SOS + alerts, contacts,
  nearby places (`GET /api` lists every endpoint).
