# AGENTS.md

This file provides guidance to AI agents working on this project.

## Project Overview

MLB Free Agent Tracker — a Node.js + TypeScript web app for tracking MLB free agents throughout the offseason. Designed to be a read-only dashboard: a curated player list is maintained in YAML, background jobs sync stats from the MLB Stats API, and the web app displays everything.

This is an LLM test project scaffolded by LongCat 2.5 (opencode provider). The codebase may have rough edges — prioritize simplicity and readability over cleverness.

## Tech Stack

- **Language:** TypeScript 5+
- **Database:** SQLite via Prisma ORM (`prisma/schema.prisma`), file at `data/tracker.db`
- **Config:** YAML via `js-yaml` (`config/players.yaml`)
- **Frontend:** React 18 SPA + Vite, built to `dist/` and served by Express (API + static). Dev: Vite dev server with `/api` proxy.
- **HTTP:** Express
- **Deployment:** Node process, listens on `0.0.0.0:8780` via env `PORT`

## Architecture

```
src/server/index.ts      → Express app: mounts /api routes, serves dist/ SPA, starts background jobs
src/routes/api.ts        → Express router (players API)
src/store/               → Prisma query functions (playerStore.ts)
src/jobs/                → statsSync.ts (startup + every 6h), contractWatcher.ts (every 30m), runSync.ts (one-shot CLI)
src/models.ts            → TS types: Player, Contract, Rumor, Prediction, PlayerDashboard
src/db/prisma.ts         → Prisma client singleton
src/config/              → loadPlayers.ts (YAML → config)
src/main.tsx, src/App.tsx → React SPA entry + view switching
src/pages/               → Dashboard.tsx, PlayerDetail.tsx
src/api/client.ts        → SPA fetch client for /api
src/test/setupDb.ts      → vitest setup: per-test-file throwaway SQLite DB
config/players.yaml      → Curated player list (the ONLY file you manually edit)
prisma/schema.prisma     → DB schema
data/tracker.db          → SQLite file (created by `npm run db:push`, git-ignored)
```

## Key Patterns

- **Read-only dashboard:** No forms, no user input. Only background workers write to DB.
- **Curated config:** `config/players.yaml` defines which players to track. Add/remove players there, then run `npm run sync`.
- **Background sync:** `jobs/statsSync` runs on startup + every 6 hours; `jobs/contractWatcher` every 30 minutes. Rate-limited to ~5 req/sec.
- **ORM:** Prisma. Query functions live in `src/store/` — don't scatter Prisma calls across handlers/routes.
- **Frontend:** React SPA + JSON API (Express serves `dist/` in production). Dev via Vite proxy `/api → localhost:8780`.

## Commands

```bash
make server    # Start web server + background jobs
make sync      # One-shot stats sync + contract watch (no server)
make build     # Build frontend to dist/
make clean     # Remove node_modules, dist/ and data/ (database)
```

## Known Issues

- WAR and wRC+ are not available from the MLB Stats API — the WAR column is always empty until a source is picked.

## Conventions

- **Worktree workflow:** All feature work must be done on a new branch in a git worktree. Never work directly on `main`. Branch naming: `feature/<short-description>`.
- **Planning:** `PLAN.md` holds the cards and a status board — follow its Workflow section and update the board in the same commit as any status change.
- **Decisions:** Record every non-obvious decision (scope, approach, data source, workflow, or a discovery that changes a card) as a new entry in `DECISIONS.md`. Never delete entries; supersede them.
- **Tests:** Every change ships with tests. Test API code with vitest + supertest against an in-process Express app, not the live API. `npm test` must pass before pushing.
- **Git:** Agents may commit and push feature branches. Humans open PRs and merge.
- Keep dependencies minimal. npm packages sparingly.
- Prisma queries live in `src/store/` — don't scatter them across routes.
- Background jobs go in `src/jobs/` — each job is a standalone function.
- Frontend: React SPA; API client in `src/api/client.ts`.

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
