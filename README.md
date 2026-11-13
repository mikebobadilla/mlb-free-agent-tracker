# MLB Free Agent Tracker

A TypeScript web app for tracking MLB free agents throughout the offseason: Express + Prisma (SQLite) backend, React SPA frontend.

> **LLM Test Project**: This project is a test bed for AI-assisted development. It was scaffolded with the LongCat 2.5 model (model ID: `longcat-2.5-preview-free`, provider: `opencode`) and is now developed with Claude Code running in [omp](https://omp.sh) (model ID: `claude-opus-5-5`, provider: `anthropic`). The entire codebase — from initial scaffolding to templates to documentation — is being generated and iterated on by an LLM agent. This is very much an experiment in AI-assisted development, so expect rough edges, mistakes, and things that would normally be done differently in a human-led project.

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

## Driving development with the Hermes dashboard

Day-to-day work on this repo is run through [Hermes Agent](https://hermes-agent.nousresearch.com/docs)'s Kanban board rather than by editing code directly. You describe work as cards in the dashboard, and a team of Hermes profiles picks them up. You don't need any of this to run the app itself.

**Setup (once)**

- Install Hermes and create the agency profiles: `pm`, `researcher`, `architect`, `frontend`, `backend`, `qa`, `devops`, `writer` (`hermes profile list` to check).
- This project has its own board, `mlb-free-agent-tracker` (`hermes kanban boards list`; `hermes kanban boards switch mlb-free-agent-tracker` to select it).
- Cards run in git worktrees of this repo under `.worktrees/<task-id>`, on branch `wt/<task-id>`, so `main` stays untouched until a branch is merged.

**Day to day**

1. Start the dashboard: `hermes dashboard` (serves on http://127.0.0.1:9119 and opens a browser; `hermes dashboard --status` / `--stop` to check or stop it).
2. Open the **Kanban** tab and pick the `mlb-free-agent-tracker` board in the board switcher.
3. Create a card with a title and a short body that states what you want and how you'll know it's done. Assign it to `pm` for anything that needs planning or splitting up. Assign it straight to a specialist (for example `backend` or `writer`) for a small, well-defined change.
4. The `pm` profile writes a plan and creates linked cards for the specialists: research, architecture, frontend and backend, QA, devops, docs. A card waits until its parent cards are done.
5. Watch progress in the dashboard. Open a card to read its comments, worker log and handoff summary.
6. Answer blocked cards. A worker that needs a decision only you can make blocks the card with a question. Comment your answer and unblock it.
7. Review finished cards. Code cards come back as "review" with a summary, the branch name and the `npm test` result. Approve to complete, or request changes with a comment.
8. Merge approved branches into `main` once `npm test` passes (see `AGENTS.md` for the git conventions).

Cards are dispatched by the Kanban dispatcher, which runs inside the Hermes gateway. Without a gateway, run `hermes kanban daemon` in a terminal. Everything in the dashboard also works from the CLI: `hermes kanban list`, `hermes kanban create`, `hermes kanban show <id>` and so on.

**Where things live**

- Code and this README: this repo. Agent rules: `AGENTS.md`. Backlog and status board: `PLAN.md`. Decision log: `DECISIONS.md`.
- Agency notes outside the repo: `~/dev/agency-docs/` — `discovery/summary.md` (current findings and risks), `projects/mlb-tracker/plan.md` and `status.md` (the PM's plan and running status), plus `research/`, `specs/` and `decisions/`.

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

1. **Curate**: Add players to `config/players.yaml` with their MLB ID and, once known, their current contract
2. **Sync**: On startup and once a day, the app loads last season's stats from [Retrosheet](https://www.retrosheet.org), applies the curated contracts, and checks MLB transactions for new signings
3. **View**: The dashboard shows each player's stats, status (signed or free agent), contract and the last season under contract

## Data sources

- **Retrosheet** — season stats, summed from its per-game files for the latest season it has published. Free for any use as long as its notice is shown, which the site footer does.
- **Chadwick Baseball Bureau Register** — links MLB player ids to Retrosheet ids and provides birth dates (ODC Attribution License).
- **MLB transactions** — checked once a day only to detect when a tracked player signs.
- **Public news reports** — contract terms, entered by hand with a link to the source.

## Configuration

Edit `config/players.yaml` to add/remove players and record contracts:

```yaml
players:
  - name: Juan Soto
    position: OF
    mlb_id: 665742        # the number in the player's mlb.com URL
    prev_team: Yankees
    contract:             # optional; copy the facts from a public report
      team: New York Mets
      years: 15
      total: 765000000    # guaranteed value in dollars
      first_season: 2025
      signed: 2024-12-11
      source: https://www.mlb.com/news/juan-soto-agrees-to-contract-with-mets
      # opted_out_after: 2029   # if the player opted out
      # notes: free text shown on the player page
```

Contract terms are entered by hand because no source that allows republishing provides them. When the watcher sees a new signing, the dashboard shows "terms not entered" until the `contract:` block is updated. An invalid block stops the server at startup with the player and field named.

Environment (`.env`):

- `DATABASE_URL` — SQLite file, relative to `prisma/` (default `file:../data/tracker.db`)
- `PORT` — HTTP port (default `8780`)

## API

- `GET /api/players` — JSON list of all players with contract, rumors and prediction
- `GET /api/players/{mlbId}` — one player, `404` if not tracked
- Any other path serves the SPA from `dist/`

## Deployment

Run `npm run build`, then `npm start` on any host with Node.js 20+. The app needs `config/players.yaml`, `prisma/schema.prisma` and a writable `data/` directory.
