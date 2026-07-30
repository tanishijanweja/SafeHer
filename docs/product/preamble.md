# SafeHer — Preamble

**Team:** Girls Hack Day, Delhi  
**Problem Statement (PS12):** AI-powered system that identifies unsafe locations based on community reports and public data

## The Idea

SafeHer is an AI-powered system that identifies unsafe locations in real time by fusing public safety data with live community reports — and then acts on that intelligence to actively protect a woman during her actual journey. It doesn't just show where danger is. It watches, explains, and responds.

> "Every safety app tells you where danger is. Ours watches your journey and acts on it in real time."

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
           + 0.4 × recent_weighted_reports 
           + 0.2 × time_of_day_multiplier
```

**Data Sources:**
- data.gov.in — district-wise IPC crime data (NCRB, crimes against women)
- Delhi Police station jurisdiction boundaries (public, geocoded)
- Manually compiled, source-cited incidents from real news archives (~40–50 entries)
- Live reports submitted during build and demo

**Data Honesty:** Public crime data is district/station-level, not pin-precise. Precision comes from fusing this historical baseline with live, source-cited, hyperlocal community reports — a more honest and more useful approach than implying false pin-level government data.

---

## Act 2 — Acting on the Intelligence

### Feature 3: Smart SOS

One tap:
- Share live location
- Share battery level (feature-detected, silently omitted if unsupported)
- Notify trusted emergency contacts (email + in-app real-time push)
- Show nearby police stations and hospitals

### Feature 4: Live Trip Monitoring (Signature Feature)

For any vehicle — cab, auto, Uber, Ola, or private car:
- User shares trip details and planned route
- Tracked via rider's own phone GPS (watchPosition, high accuracy)
- Trip shared live with trusted contacts
- AI monitors for: unexpected stop (>5 min), route deviation (>300m), entry into high-risk zone
- On flag: Gemini generates plain-language alert → 60-second "Are you okay?" check-in → no response escalates to Smart SOS

**Technical note:** Uber/Ola do not expose real-time trip location via public API. SafeHer tracks from the rider's own device instead — this makes it work for any vehicle, not just app-based cabs.

### Feature 5: Manual Emergency Audio Recording

- User-triggered only (button press), never automatic or covert
- Records the user's own environment (legal under India's one-party consent standard)
- Persistent, non-removable "Recording" indicator on screen
- Auto-deleted after 30 days unless manually flagged as evidence

---

## Real-World Constraints Addressed

| Problem | Resolution |
|---|---|
| No street-level crime data exists | Two-layer system: historical (district/station-level) + live community layer |
| Cold-start empty map | Seeded with source-cited real incidents from news archives |
| Fake/malicious reports | Corroboration-based confidence upgrading (3+ independent reports) |
| No Uber/Ola data access | Tracks from rider's own phone GPS — broader use case |
| Battery API unsupported on Safari/Firefox | Feature-detected, gracefully omitted |
| Audio recording legality | One-party consent, manual trigger, visible indicator |

---

## Roadmap (Future Scope)

- Deeper community verification/trust-scoring layer
- Partnership with Delhi Police / Himmat Plus / 112 India
- Native mobile app with proper background GPS
- Expansion beyond Delhi
- IP: integrated system of live sensor data + geospatial anomaly detection (not algorithm alone)
