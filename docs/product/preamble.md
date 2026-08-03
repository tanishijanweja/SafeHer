# SafeHer — Preamble

**Team:** Girls Hack Day, Delhi  
**Problem Statement (PS12):** AI-powered system that identifies unsafe locations based on community reports and public data

## The Idea

SafeHer is an AI-powered platform that identifies unsafe locations by combining historical crime data, verified live news intelligence, and community reports to generate dynamic street-level safety insights. AI automatically analyzes incidents, classifies risk, and powers an explainable safety heatmap for users.

> "Safety isn't just about where crime happened yesterday—it's about understanding what's happening around you today."

---

## Act 1 — Core System

### Feature 1: AI Incident Reporting

Users can report incidents via:
- **Text** — description of what happened
- **Images** — optional photo evidence (poor lighting, unsafe alley, etc.)
- **Location** — auto-captured GPS or manual pin drop on map
- **Time** — auto-filled with current timestamp
- **Category** — dropdown: harassment / poor lighting / stalking / unsafe transport / other

**AI Processing (Gemini):**
- Summarizes the report
- Detects incident type
- Detects severity (1–5)
- Flags spam or duplicate reports (embeddings, cosine similarity within same geohash + 24h window)

**Verification:** Every report starts as "unverified." If 3+ independent reports land in the same geohash cell within a rolling 30-day window, it auto-upgrades to "community-corroborated." No manual moderation needed.

### Feature 2: AI Risk Heatmap

- **Green** → Safe
- **Yellow** → Moderate
- **Red** → Dangerous

Two clearly separated data layers (user-toggleable):
- **Layer A — Historical:** NCRB/data.gov.in district and police-station-jurisdiction level crime data
- **Layer B — Live:** Real-time community incident reports

**Combined formula:**
```
risk_score = 0.4 × historical_baseline 
           + 0.35 × recent_weighted_reports 
           + 0.25 × time_of_day_multiplier
```

**Data Sources:**
- data.gov.in — district-wise IPC crime data (NCRB, crimes against women)
- Historical NCRB crime data, GDELT live news pipeline (AI-filtered and classified), Community reports, AI-generated incident summaries and embeddings
- Live reports submitted during build and demo

**Data Honesty:** Public crime data is district/station-level, not pin-precise. Precision comes from fusing this historical baseline with live, source-cited, hyperlocal community reports — a more honest and more useful approach than implying false pin-level government data.

---

## Act 2 — Acting on the Intelligence

### Feature 3: Smart SOS (future)

One tap:
- Share live location
- Share battery level (feature-detected, silently omitted if unsupported)
- Notify trusted emergency contacts (email + in-app real-time push)
- Show nearby police stations and hospitals

### Feature 4: Live Trip Monitoring (future)

For any vehicle — cab, auto, Uber, Ola, or private car:
- User shares trip details and planned route
- Tracked via rider's own phone GPS (watchPosition, high accuracy)
- Trip shared live with trusted contacts
- AI monitors for: unexpected stop (>5 min), route deviation (>300m), entry into high-risk zone
- On flag: Gemini generates plain-language alert → 60-second "Are you okay?" check-in → no response escalates to Smart SOS

**Technical note:** Uber/Ola do not expose real-time trip location via public API. SafeHer tracks from the rider's own device instead — this makes it work for any vehicle, not just app-based cabs.

### Feature 5: Manual Emergency Audio Recording (future)

- User-triggered only (button press), never automatic or covert
- Records the user's own environment (legal under India's one-party consent standard)
- Persistent, non-removable "Recording" indicator on screen
- Auto-deleted after 30 days unless manually flagged as evidence

---

## Real-World Constraints Addressed

| Problem | Resolution |
|---|---|
| Government crime data is coarse | Combined with AI-filtered live news + community reports |
| Fake reports | AI spam detection + embeddings |
| Duplicate news | AI classification + deduplication |
| Irrelevant news | Multi-stage filtering + Gemini classification |
| Explainability | Every hotspot shows contributing factors and recent incidents |

---

## Roadmap (Future Scope)

- Smart SOS
- Trip Monitoring
- Voice Assistant
- Audio Recording
- Trusted Contacts
- Background GPS


## Gemini does two things in this pipeline:
1. Report analysis (analyzeReport in apps/server/src/services/gemini.ts)
- Takes the user's description text
- Sends it to gemini-flash-latest with responseMimeType: "application/json" + a schema, forcing a structured JSON reply
- Returns { summary, category, severity }:
- summary — a concise rewrite of the incident
- category — classified into the Prisma enum (HARASSMENT, THEFT, ASSAULT, etc.)
- severity — a 1–5 risk score
- This replaces manual classification — the AI decides the category/severity from the description
2. Embedding generation (generateEmbedding)
- Takes the aiSummary
- Sends it to gemini-embedding-001
- Returns a 3072-dimension vector (numeric representation of the text's meaning)
- Stored in Report.embedding (pgvector column)
Why it matters: the embeddings enable semantic similarity searches later (e.g., "find other reports with similar wording" or the corroboration/heatmap logic). Currently the embedding is generated and stored but not yet queried against.

When the free-tier quota is exhausted (like now):
What happens per submission:
1. analyzeReport() → Gemini returns HTTP 429 (RESOURCE_EXHAUSTED)
2. Our try/catch catches it → falls back to { summary: <raw description>, category: OTHER, severity: 1 }
3. Report is still saved to PostgreSQL normally (description, lat/lng, timestamps, geohash)
4. Embedding call (separate quota) — if it also fails, it's skipped
5. Response is still 200, no 500, no lost data
The downsides while rate-limited:
- No AI summary/category/severity — everything is OTHER / severity 1
- No embedding stored
- You get a console error log per attempt
When it resets:
- Per-minute limits: recover within ~1 minute
- Per-day limits (20 requests/day): reset at midnight Pacific time
- So real analysis just "comes back" automatically the next day
To avoid hitting it: add billing to the API key (removes the 20/day cap), reduce calls per report, or add caching. For the hackathon demo, the fallback means the app never breaks — it just temporarily loses AI quality.