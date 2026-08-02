# SafeHer — Engineering Architecture

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React 19, Tailwind CSS v4, shadcn/ui, TypeScript |
| Backend | Hono, Better Auth, Prisma ORM, Zod, Bun Runtime |
| Database | PostgreSQL, PostGIS, pgvector |
| AI Layer | Google Gemini 2.5 Flash, Gemini Embeddings, Gemini Vision |
| Maps & Location | OpenStreetMap + Leaflet (in use) — swappable to Google Maps / Mapbox via the `SafeMap` adapter |
| Deployment | Vercel (Frontend), Railway/Render (Backend), Supabase PostgreSQL (Production DB) |

## Database Design

**users:** `id, name, email, created_at`

**trusted_contacts:** `id, user_id, name, phone, relation`

**reports:** `id, user_id, title, description, category, severity, latitude, longitude, image_url, ai_summary, embedding, is_spam, confidence_level (unverified / community-corroborated), created_at`

**risk_scores:** `id, geohash, historical_score, live_score, combined_score, incident_count, last_updated`

**trips:** `id, user_id, vehicle_details, driver_details, planned_route, status, started_at, ended_at`

**trip_locations:** `id, trip_id, lat, lng, timestamp`

**trip_alerts:** `id, trip_id, type (deviation / stop / high_risk_zone), ai_explanation, triggered_at, resolved`

**sos_events:** `id, user_id, trip_id (nullable), location, battery_level (nullable), audio_url (nullable), triggered_at, contacts_notified`

## AI Workflow

### Incident Reporting
1. User submits report
2. Gemini: summarize, categorize, detect severity, spam detection, generate embedding
3. Store in PostgreSQL
4. Corroboration check (3+ reports in geohash/30 days → upgrade confidence)
5. Risk engine updates heatmap

### Trip Monitoring
1. Trip started → planned route stored
2. Live location streamed via Supabase Realtime
3. AI Monitor checks: deviation? stop? high-risk zone?
4. Flag triggered → Gemini generates explanation
5. Alert sent to trusted contacts + 60s check-in to user
6. No response → Auto-SOS

## Build Order

1. Schema & database setup
2. Incident reporting
3. Risk heatmap
4. Smart SOS
5. Trip monitoring
6. Audio recording + polish
7. Integration
8. Demo rehearsal
