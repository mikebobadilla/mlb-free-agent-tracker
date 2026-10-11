# MLB Free Agent Tracker — Feature Plan

Last updated: 2026-10-10

## Status Legend

| Status | Meaning |
|--------|---------|
| NOT STARTED | Card created, not yet groomed |
| GROOMING | Being refined — discussing scope, approach, details |
| READY | Groomed and ready to hand off to an agent |
| IN PROGRESS | Agent actively working on it |
| DONE | Shipped |

---

## Phase 1 — Data Quality

### [NOT STARTED] Fix ERA parsing bug
- **ID:** P1-001
- **Problem:** MLB Stats API returns ERA as a string for some pitchers, causing JSON unmarshal errors in `internal/jobs/stats_sync.go`
- **Impact:** Pitchers (Burnes, Snell, Fried) don't get stats synced
- **Approach:** Custom `FlexFloat` type or string-to-float conversion in the stats response struct
- **Files:** `internal/jobs/stats_sync.go`

### [NOT STARTED] Add last-season stats fallback
- **ID:** P1-002
- **Problem:** During offseason, current-season stats are empty — dashboard shows zeros
- **Impact:** Dashboard looks empty/broken during the offseason when tracking matters most
- **Approach:** When current-season stats are empty, fall back to last season's stats. Add a `season` column to distinguish.
- **Files:** `internal/jobs/stats_sync.go`, `internal/db/schema.sql`, `internal/models/models.go`

### [NOT STARTED] Add more stats (OPS, WHIP, IP, FIP, wRC+)
- **ID:** P1-003
- **Problem:** Only WAR and ERA are tracked — not enough for meaningful analysis
- **Impact:** Can't compare players properly on the dashboard
- **Approach:** Expand the stats sync to pull hitting (OBP, SLG, OPS, wRC+) and pitching (WHIP, IP, FIP, K/9) stats. Add columns to schema, update dashboard display.
- **Files:** `internal/jobs/stats_sync.go`, `internal/db/schema.sql`, `internal/models/models.go`, `web/templates/dashboard.html`

---

## Phase 2 — Rumors & News

### [NOT STARTED] RSS feed aggregator for MLB news
- **ID:** P2-001
- **Problem:** No rumor tracking — the tracker is just a stats display
- **Impact:** The tracker doesn't capture the most interesting part of free agency: the rumors
- **Approach:** Build a background job that polls RSS feeds from MLB.com, ESPN, FanGraphs, Spotrac, and The Athletic. Parse articles, detect player names via fuzzy matching, store as rumors with source and confidence.
- **Files:** `internal/jobs/rumor_scraper.go` (new), `internal/store/store.go`, `web/templates/player_detail.html`

### [NOT STARTED] Source reliability scoring
- **ID:** P2-002
- **Problem:** All rumors treated equally — a random Twitter rumor counts the same as a confirmed report
- **Impact:** Hard to know which rumors to trust
- **Approach:** Assign reliability tiers to sources (e.g., Tier 1: MLB insiders like Passan, Nightengale; Tier 2: beat reporters; Tier 3: aggregators). Weight confidence score by source tier.
- **Files:** `internal/jobs/rumor_scraper.go`, `web/templates/player_detail.html`

### [NOT STARTED] Auto-tag player names in articles
- **ID:** P2-003
- **Problem:** Need to link scraped articles to tracked players
- **Impact:** Rumors aren't connected to player profiles
- **Approach:** Fuzzy string matching against curated player list. Match on full name, last name + first initial. Store `player_id` foreign key on each rumor.
- **Files:** `internal/jobs/rumor_scraper.go`, `internal/store/store.go`

---

## Phase 3 — Contract Tracking

### [NOT STARTED] Auto-detect signings via MLB transactions API
- **ID:** P3-001
- **Problem:** No way to know when a tracked player signs without manually checking
- **Impact:** The tracker goes stale as soon as someone signs
- **Approach:** Poll MLB Stats API transactions endpoint for tracked players. When a signing is detected, auto-create a contract record and update player status to "signed".
- **Files:** `internal/jobs/contract_watcher.go` (new), `internal/store/store.go`

### [NOT STARTED] Contract comparison (predicted vs actual)
- **ID:** P3-002
- **Problem:** Predictions exist but there's no way to score them
- **Impact:** Can't improve predictions over time
- **Approach:** When a player signs, compare actual contract to prediction. Calculate error (years off, AAV off). Store accuracy metrics.
- **Files:** `internal/models/models.go`, `internal/store/store.go`, `web/templates/player_detail.html`

### [NOT STARTED] Team payroll tracker
- **ID:** P3-003
- **Problem:** Can't see how signings affect team payroll or luxury tax
- **Impact:** Missing context for contract analysis
- **Approach:** Track team payroll totals, luxury tax thresholds. Update as contracts are logged. Show team payroll summary on dashboard.
- **Files:** `internal/db/schema.sql`, `internal/store/store.go`, `web/templates/dashboard.html` (or new team view)

---

## Phase 4 — Predictions

### [NOT STARTED] Comparable player algorithm
- **ID:** P4-001
- **Problem:** Predictions are manual — no data-driven baseline
- **Impact:** Hard to know what a contract "should" be
- **Approach:** Find comparable players by age, position, WAR, and key stats. Use their recent contracts as a baseline. Store comps alongside predictions.
- **Files:** `internal/jobs/prediction_engine.go` (new), `internal/store/store.go`

### [NOT STARTED] Simple projection model
- **ID:** P4-002
- **Problem:** No automated contract projection
- **Impact:** Can't generate predictions at scale
- **Approach:** WAR-based contract model (e.g., $/WAR * WAR * age adjustment * position adjustment). Generate a baseline prediction for every unsigned player.
- **Files:** `internal/jobs/prediction_engine.go`

### [NOT STARTED] Prediction accuracy tracking
- **ID:** P4-003
- **Problem:** No feedback loop for predictions
- **Impact:** Can't improve the model over time
- **Approach:** Track prediction vs actual for all signed players. Display accuracy stats (mean error, hit rate). Use to tune model weights.
- **Files:** `web/templates/dashboard.html`, `internal/store/store.go`

---

## Phase 5 — Dashboard Enhancements

### [NOT STARTED] Timeline view
- **ID:** P5-001
- **Problem:** No chronological view of events
- **Impact:** Hard to follow the narrative of the offseason
- **Approach:** New page showing all signings, rumors, and events in reverse chronological order. Filterable by player, team, or date range.
- **Files:** `web/templates/timeline.html` (new), `internal/handlers/handlers.go`, `internal/store/store.go`

### [NOT STARTED] Team needs analyzer
- **ID:** P5-002
- **Problem:** Can't see which teams need which positions
- **Impact:** Missing strategic context for rumors and predictions
- **Approach:** Show each team's current roster needs (positions of weakness). Filter free agents by team need.
- **Files:** `web/templates/team_needs.html` (new), `internal/handlers/handlers.go`

### [NOT STARTED] Player comparison tool
- **ID:** P5-003
- **Problem:** Can't compare players side-by-side
- **Impact:** Hard to evaluate which player fits a team's needs
- **Approach:** Select 2-3 players → side-by-side stats, contract status, rumors, predictions.
- **Files:** `web/templates/compare.html` (new), `internal/handlers/handlers.go`

### [NOT STARTED] Dark mode
- **ID:** P5-004
- **Problem:** Light theme only
- **Impact:** Eye strain for late-night offseason browsing
- **Approach:** CSS variables + toggle button. Store preference in localStorage.
- **Files:** `web/static/style.css`, all templates

---

## Phase 6 — Community & Sharing

### [NOT STARTED] Deploy to Fly.io / Railway
- **ID:** P6-001
- **Problem:** Only accessible via Tailscale or local network
- **Impact:** Can't share with people outside your Tailnet
- **Approach:** Build binary, deploy to Fly.io free tier. Set up CI to auto-deploy on push.
- **Files:** `Dockerfile`, `.github/workflows/deploy.yml` (new)

### [NOT STARTED] Weekly digest email
- **ID:** P6-002
- **Problem:** No way to get updates without visiting the site
- **Impact:** People forget to check
- **Approach:** Email signup → weekly cron job compiles top news/signings → sends email. Use a simple SMTP service or email API.
- **Files:** `internal/jobs/digest.go` (new), `web/templates/signup.html` (new)

### [NOT STARTED] RSS feed of tracker updates
- **ID:** P6-003
- **Problem:** No machine-readable feed of tracker activity
- **Impact:** Can't integrate with RSS readers or other tools
- **Approach:** Generate an RSS feed from the same data that powers the timeline.
- **Files:** `internal/handlers/handlers.go` (add `/feed.xml` route)

---

## Phase 7 — Advanced

### [NOT STARTED] ML contract prediction
- **ID:** P7-001
- **Problem:** Rule-based predictions are limited
- **Impact:** Predictions miss nuance
- **Approach:** Train a model on historical contract data (age, WAR, position, stats → contract $). Integrate as an alternative projection method.
- **Files:** New `ml/` directory, `internal/jobs/prediction_engine.go`

### [NOT STARTED] Discord/Telegram bot
- **ID:** P7-002
- **Problem:** No real-time alerts
- **Impact:** Miss breaking news
- **Approach:** Bot listens for new signings/rumors → posts to Discord/Telegram channel.
- **Files:** `internal/jobs/bot.go` (new), `cmd/bot/main.go` (new)

### [NOT STARTED] Mobile app / PWA
- **ID:** P7-003
- **Problem:** No mobile experience
- **Impact:** Hard to check on the go
- **Approach:** Progressive Web App (PWA) with offline support. No native app needed.
- **Files:** `web/static/manifest.json`, `web/static/sw.js` (new)

### [NOT STARTED] Multi-sport support
- **ID:** P7-004
- **Problem:** MLB only
- **Impact:** Can't track NFL/NBA/NHL free agency with the same tool
- **Approach:** Abstract the data model to support multiple leagues. Add league field to players. Sport-specific stats modules.
- **Files:** `internal/models/models.go`, `internal/db/schema.sql`, `config/` (restructure)
