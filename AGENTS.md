# AGENTS.md

This file provides guidance to AI agents working on this project.

## Project Overview

MLB Free Agent Tracker — a Go + SQLite web app for tracking MLB free agents throughout the offseason. Designed to be a read-only dashboard: a curated player list is maintained in YAML, background jobs sync stats from the MLB Stats API, and the web app displays everything.

This is an LLM test project scaffolded by LongCat 2.5 (opencode provider). The codebase may have rough edges — prioritize simplicity and readability over cleverness.

## Tech Stack

- **Language:** Go 1.21+
- **Database:** SQLite via `modernc.org/sqlite` (pure Go, no CGO)
- **Config:** YAML via `gopkg.in/yaml.v3`
- **Templates:** Go `html/template` (standalone per-page, no layout inheritance)
- **HTTP:** Standard library `net/http` (no router framework)
- **Deployment:** Single binary, listens on `0.0.0.0:8080`

## Architecture

```
cmd/server/main.go     → Entry point: loads config, opens DB, starts jobs + HTTP server
cmd/sync/main.go       → One-shot CLI: runs stats sync without starting the server
config/players.yaml    → Curated player list (the ONLY file you manually edit)
internal/db/           → SQLite connection + schema.sql migrations
internal/models/       → Structs: Player, Contract, Rumor, Prediction
internal/jobs/         → Background workers (stats_sync.go — runs every 6h)
internal/handlers/     → HTTP handlers (Dashboard, PlayerDetail, APIPlayers)
internal/store/        → SQL queries (UpsertPlayer, GetDashboardData, etc.)
web/templates/         → One standalone HTML file per page (no shared layout)
web/static/            → CSS
data/tracker.db        → SQLite file (auto-created, git-ignored)
```

## Key Patterns

- **Read-only dashboard:** No forms, no user input. Only background workers write to DB.
- **Curated config:** `config/players.yaml` defines which players to track. Add/remove players there, then run `make sync` or restart the server.
- **Background sync:** `jobs.StartBackgroundSync` runs on startup + every 6 hours. Rate-limited to ~5 req/sec (200ms delay between requests).
- **No ORM:** Raw SQL in `internal/store/store.go`. Keep it simple.
- **Template style:** Each `.html` file in `web/templates/` is a complete standalone page. No `{{define}}` or `{{template}}` inheritance — just duplicate the boilerplate.

## Commands

```bash
make server    # Start web server + background sync
make sync      # One-shot stats sync (no server)
make build     # Build binary to bin/tracker
make clean      # Remove binary + database
```

## Known Issues

- MLB Stats API returns ERA as a string for some pitchers — causes JSON unmarshal error. Needs a custom type or string-to-float conversion.
- No last-season fallback: during offseason, stats show as zero since the API returns no current-season data.
- `repeat` template func is defined in `cmd/server/main.go` — if you add new template functions, put them there.

## Conventions

- **Worktree workflow:** All feature work must be done on a new branch in a git worktree. Never work directly on `main`. Branch naming: `feature/<short-description>`.
- Keep dependencies minimal. Standard library first, add packages sparingly.
- SQL queries live in `internal/store/store.go` — don't scatter SQL across handlers.
- Background jobs go in `internal/jobs/` — each job is a standalone function.
- Templates are standalone HTML — no shared layout inheritance (intentional, keeps things simple).
- The `funcMap` for templates lives in `cmd/server/main.go`.

## Data Sources

- **MLB Stats API** (`statsapi.mlb.com`): Primary source for player stats. Free, no auth, rate-limited.
- **Curated YAML**: Player list maintained manually in `config/players.yaml`.

## Future Phases (see README for full roadmap)

1. Fix ERA parsing + add last-season stats
2. RSS rumor scraper
3. Auto-detect signings via MLB transactions API
4. Contract prediction algorithm
5. Dashboard enhancements (timeline, team needs, dark mode)
6. Public sharing (deploy, email digest, RSS feed)
