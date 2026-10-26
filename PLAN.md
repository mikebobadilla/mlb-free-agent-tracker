# MLB Free Agent Tracker — Feature Plan

Last updated: 2026-10-11

Decisions behind these cards are logged in [DECISIONS.md](DECISIONS.md).

## Board

Active and upcoming work. Update this table in the same commit as any card status change.

| ID | Card | Status | Branch / PR | Decisions |
|----|------|--------|--------|-----------|
| P1-001 | Fix ERA parsing bug | DONE | #1 | D-003 |
| P1-002 | Last-season stats fallback | DONE | #1 | D-004, D-005, D-010, D-012 |
| P1-003 | More stats (OPS, WHIP, IP, FIP, K/9) | DONE | #1 | D-009, D-010, D-013, D-014 |
| P1-004 | Sync player age | DONE | #1 | D-006 |
| P1-005 | Source WAR and wRC+ | GROOMING | — | D-007, D-009 |
| P1-006 | Server startup wipes synced data | DONE | #1 | D-011 |
| P3-005 | Rewrite backend and frontend in Node.js | IN PROGRESS | feature/P3-005-node-rewrite | D-021 |

All other cards (Phases 2–7) are NOT STARTED.

## Status Legend

| Status | Meaning |
|--------|---------|
| NOT STARTED | Card created, not yet groomed |
| GROOMING | Being refined — scope, approach, open questions |
| READY | Has acceptance criteria and no open questions; can be handed to an agent |
| IN PROGRESS | Being built on a feature branch |
| IN REVIEW | Pushed; waiting on PR review/merge |
| BLOCKED | Waiting on a decision or external dependency (say which in the card) |
| DONE | Merged to `main` |

## Workflow

1. **Groom:** fill in the card's Approach, Acceptance criteria and Open questions. Every answered question becomes an entry in DECISIONS.md. Card moves to READY when there are no open questions.
2. **Build:** create or reuse a `feature/<desc>` branch in a git worktree (D-001). Set the card to IN PROGRESS and fill in Branch.
3. **Test:** add tests for the change; `go vet ./...` and `go test ./...` must pass (D-008).
4. **Push:** commit with the card ID in the message, push, and set the card to IN REVIEW. The PR is opened and merged by a human.
5. **Done:** after merge, set the card to DONE.

Cards gain the full template below when they're groomed. Ungroomed cards keep the short form.

```
### [STATUS] Title
- **ID:** PX-NNN
- **Branch / PR:** feature/... / #NN
- **Problem:** / **Impact:** / **Approach:**
- **Acceptance criteria:** checklist of observable outcomes
- **Open questions:** (empty when READY)
- **Decisions:** D-NNN, ...
- **Files:**
```

---

## Phase 1 — Data Quality

### [DONE] Fix ERA parsing bug
- **ID:** P1-001
- **Branch / PR:** `feature/phase1-stats-pipeline` / #1
- **Problem:** MLB Stats API returns ERA (and other rate stats) as JSON strings, causing unmarshal errors in `internal/jobs/stats_sync.go`
- **Impact:** Pitchers (Burnes, Snell, Fried) don't get stats synced
- **Approach:** `FlexFloat` type that accepts JSON numbers or numeric strings
- **Acceptance criteria:**
  - [x] Burnes, Snell, Fried sync with an ERA (verified against live API)
  - [x] Unit tests cover number, string and placeholder inputs
- **Decisions:** D-003
- **Files:** `internal/jobs/stats_sync.go`, `internal/jobs/stats_sync_test.go`

### [DONE] Add last-season stats fallback
- **ID:** P1-002
- **Branch / PR:** `feature/phase1-stats-pipeline` / #1
- **Problem:** The sync stored career stats; season stats are what matter for free agency, and the current season is empty during the offseason
- **Impact:** Dashboard looks empty/broken during the offseason when tracking matters most
- **Approach:** Fetch the current season; if the API returns no splits, fetch the previous season. Use the season-total split for traded players. Store the season in a new `season` column and show it in the UI.
- **Acceptance criteria:**
  - [x] Players with no current-season data show the previous season's stats (fake-API test; can't trigger live until the 2027 season starts)
  - [x] The dashboard and player page show which season the stats are from
  - [x] Traded players show season totals, not one team's split
  - [x] Existing databases get the `season` column without being deleted
  - [x] Tests cover current season, fallback, no data in either season, traded player
- **Decisions:** D-004, D-005, D-010, D-012
- **Files:** `internal/jobs/stats_sync.go`, `internal/db/`, `internal/models/models.go`, `internal/store/store.go`, `web/templates/`

### [DONE] Add more stats (OPS, WHIP, IP, FIP, K/9)
- **ID:** P1-003
- **Branch / PR:** `feature/phase1-stats-pipeline` / #1
- **Problem:** Only WAR and ERA are tracked — not enough for meaningful analysis
- **Impact:** Can't compare players properly on the dashboard
- **Approach:** Hitting: OBP, SLG, OPS from the MLB API. Pitching: WHIP, IP, K/9 from the MLB API; FIP computed from HR, BB, HBP, K, IP. WAR and wRC+ are split out to P1-005.
- **Acceptance criteria:**
  - [x] Hitters show OBP / SLG / OPS; pitchers show ERA / WHIP / IP / K/9 / FIP
  - [x] Undefined stats show `-`, not `0`
  - [x] FIP computation has unit tests
- **Decisions:** D-009, D-010, D-013, D-014
- **Files:** `internal/jobs/stats_sync.go`, `internal/db/schema.sql`, `internal/models/models.go`, `internal/store/store.go`, `web/templates/`

### [DONE] Sync player age
- **ID:** P1-004
- **Branch / PR:** `feature/phase1-stats-pipeline` / #1
- **Problem:** Age was read from the stats response, which doesn't include it — always 0
- **Approach:** Fetch `currentAge` from `/people/{id}`
- **Acceptance criteria:**
  - [x] All tracked players show a non-zero age after sync
  - [x] Unit test against a fake API server
- **Decisions:** D-006
- **Files:** `internal/jobs/stats_sync.go`

### [GROOMING] Source WAR and wRC+
- **ID:** P1-005
- **Problem:** The MLB Stats API has no WAR or wRC+; the WAR column is always empty
- **Impact:** WAR is the most common single-number comparison for free agents
- **Approach:** TBD — needs a second data source
- **Open questions:**
  - Which source: FanGraphs (unofficial JSON), Baseball-Reference (scraping), or a manual `war` field in `players.yaml`?
  - fWAR or bWAR?
  - Is an unofficial/undocumented dependency acceptable?
- **Decisions:** D-007, D-009
- **Files:** TBD

### [DONE] Server startup wipes synced data
- **ID:** P1-006
- **Branch / PR:** `feature/phase1-stats-pipeline` / #1
- **Problem:** `cmd/server/main.go` upserts YAML players through `UpsertPlayer`, resetting age, stats and status on every restart
- **Impact:** A player marked signed flips back to unsigned whenever the server restarts
- **Approach:** Separate store function that inserts new players and updates only config fields (name, position, prev_team)
- **Acceptance criteria:**
  - [x] Restarting the server keeps age, stats and status
  - [x] New players added to the YAML still appear before the first sync
  - [x] Store test against a temporary SQLite DB
  - [x] Blank statuses written by older versions are repaired to `unsigned`
- **Decisions:** D-011
- **Files:** `cmd/server/main.go`, `internal/store/store.go`

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

### [IN PROGRESS] Rewrite backend and frontend in Node.js
- **ID:** P3-005
- **Branch / PR:** feature/P3-005-node-rewrite / —
- **Problem:** The maintainer does not understand Go and wants the tracker built in Node.js with Prisma.
- **Impact:** The Go codebase blocks further work for the maintainer; the project has rough edges.
- **Approach:** Full rewrite of the app in TypeScript + Express + Prisma (SQLite) with a React SPA + JSON API frontend. Preserve behavior: curated YAML config, stats sync job, contract watcher, dashboard, player detail, API endpoints, tests.
- **Acceptance criteria:**
  - [ ] Express + TypeScript + Prisma backend boots and serves the JSON API
  - [ ] Prisma schema mirrors the Go schema (players, contracts, rumors, predictions)
  - [ ] Stats sync job runs (rate-limited, season fallback) and writes stats
  - [ ] Contract watcher runs and detects signings
  - [ ] React SPA serves dashboard and player detail via the API
  - [ ] Tests use vitest + supertest (replacing go vet/go test)
  - [ ] Go code removed from branch at end of rewrite
- **Open questions:** (empty)
- **Decisions:** D-021
- **Files:** `package.json`, `prisma/schema.prisma`, `src/**`, `web/**`, `config/players.yaml`, `AGENTS.md`, `DECISIONS.md`

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
