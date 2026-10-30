# MLB Free Agent Tracker

A TypeScript web app for tracking MLB free agents throughout the offseason: Express + Prisma (SQLite) backend, React SPA frontend.

> **LLM Test Project**: This project is being developed as a test bed for the LongCat 2.5 model (model ID: `longcat-2.5-preview-free`, provider: `opencode`). The entire codebase — from initial scaffolding to templates to documentation — is being generated and iterated on by an LLM agent. This is very much an experiment in AI-assisted development, so expect rough edges, mistakes, and things that would normally be done differently in a human-led project.

## Quick Start

```bash
npm install
cp .env.example .env    # DATABASE_URL for the SQLite file
npm run db:push         # create data/tracker.db from prisma/schema.prisma
npm run build           # build the SPA to dist/
make server             # API + SPA on :8780, plus background sync
```

Then open http://localhost:8780

Other commands:

```bash
make sync               # one-shot stats sync + contract watch, no server
npm run dev             # Vite dev server on :5173, proxies /api to :8780 (run make server alongside)
npm test                # vitest
```

## Project Structure

```
mlb-tracker/
├── config/players.yaml        # Your curated player list
├── prisma/schema.prisma       # DB schema
├── src/
│   ├── server/index.ts        # Express app: /api + dist/, starts background jobs
│   ├── routes/api.ts          # JSON API
│   ├── store/                 # Prisma queries
│   ├── jobs/                  # statsSync, contractWatcher, runSync (CLI)
│   ├── config/                # YAML loader
│   ├── db/                    # Prisma client
│   ├── models.ts              # Shared types
│   ├── App.tsx, main.tsx      # React SPA
│   ├── pages/                 # Dashboard, PlayerDetail
│   └── api/client.ts          # SPA fetch client
└── data/tracker.db            # SQLite database (git-ignored)
```

## How It Works

1. **Curate**: Add players to `config/players.yaml` with their MLB ID
2. **Sync**: The stats sync fetches stats from the MLB Stats API on startup and every 6 hours; the contract watcher checks MLB transactions for signings every 30 minutes
3. **View**: The dashboard shows all tracked players, their status, and details

## Configuration

Edit `config/players.yaml` to add/remove players:

```yaml
players:
  - name: Juan Soto
    position: OF
    mlb_id: 665742        # Find on baseball-reference.com or mlb.com
    prev_team: Yankees
```

Environment (`.env`):

- `DATABASE_URL` — SQLite file, relative to `prisma/` (default `file:../data/tracker.db`)
- `PORT` — HTTP port (default `8780`)

## API

- `GET /api/players` — JSON list of all players with contract, rumors and prediction
- `GET /api/players/{mlbId}` — one player, `404` if not tracked
- Any other path serves the SPA from `dist/`

## Deployment

Run `npm run build`, then `npm start` on any host with Node.js 20+. The app needs `config/players.yaml`, `prisma/schema.prisma` and a writable `data/` directory.
