# MLB Free Agent Tracker

A TypeScript web app for tracking MLB free agents throughout the offseason: Express + Prisma (SQLite) backend, React SPA frontend.

> **LLM Test Project**: This project is a test bed for AI-assisted development. It was scaffolded with the LongCat 2.5 model (model ID: `longcat-2.5-preview-free`, provider: `opencode`) and is now developed with Claude Code running in [omp](https://omp.sh) (model ID: `claude-opus-5-5`, provider: `anthropic`). The entire codebase — from initial scaffolding to templates to documentation — is being generated and iterated on by an LLM agent. This is very much an experiment in AI-assisted development, so expect rough edges, mistakes, and things that would normally be done differently in a human-led project.

## Goal

An exploratory personal project. The owner builds it to learn and to do discovery work on MLB free agents; it is not for profit and has no customers. The owner may publish the site later. Success means the app is useful for following free agents and the agents' workflow is well documented — see [Agents and tools used](#agents-and-tools-used) for who and what has worked on it.

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

## Agents and tools used

A running record of every AI agent, model and tool that has worked on this project, so the work can be shown. Only what the kanban board, Hermes session records and git history show is listed; anything not recorded is marked unknown. Last updated 2026-11-13.

> **Rule:** any agent that adds a new tool or model to the project must update this section in the same commit. The same rule is in the agency docs (`~/dev/agency-docs/README.md`) and decision D-030.

**Phase 1 — scaffold and build (2026-10-10 to 2026-10-30, 34 commits on `main`)**

- Initial Go scaffold, `AGENTS.md`, `PLAN.md` and the worktree convention: LongCat 2.5 (`longcat-2.5-preview-free`, provider `opencode`). Four commits carry its `Co-Authored-By` trailer.
- Everything after that: Claude Code running in [omp](https://omp.sh), model `claude-opus-5-5`, provider `anthropic` (per the notice above). Seven commits carry a `Co-Authored-By: Claude Opus 5.5` trailer. Later commits (the Node/TypeScript rewrite, Retrosheet stats, curated contracts, the 2026-27 class) carry no trailer, so per-commit attribution is unknown. Claude Code worktrees live under `.claude/worktrees/`.

**Phase 2 — Hermes Agent kanban team (2026-11-13 onward, board `mlb-free-agent-tracker`)**

All Hermes profiles run on provider `anthropic`. The model column is each profile's configured default on 2026-11-13. The kanban board does not record the model per run, so the last column lists other models that appear in Hermes session records for this repo.

| Profile | What it has done here | Configured model | Other models seen in session records |
|---|---|---|---|
| `pm` | Discovery lead and synthesis (`agency-docs/discovery/summary.md`), project plan, README sections, this goal and agent log | `claude-sonnet-5-5` | none |
| `researcher` | Product and competitor research; audit of `config/players.yaml` against option decisions (W-02) | `claude-haiku-5-5` | `claude-sonnet-5-5` (early attempts; the board shows them as crashed) |
| `architect` | Codebase, architecture and data-model map | `claude-sonnet-5-5` | `claude-opus-5-5` (an early attempt; crashed) |
| `frontend` | No work on this repo yet | `claude-sonnet-5-5` | none |
| `backend` | Guard against an empty or mis-keyed `players.yaml` wiping the database (W-01, merged via PR #6); vitest exclude for worktrees (merged via PR #5) | `claude-sonnet-5-5` | none |
| `qa` | Test coverage and code-quality baseline | `claude-haiku-5-5` | `claude-sonnet-5-5` (early attempts; crashed) |
| `devops` | Build, deploy and environment assessment | `claude-haiku-5-5` | `claude-sonnet-5-5` (the one recorded session; the profile has since been set to haiku) |
| `writer` | No work on this repo yet | `claude-haiku-5-5` | none |

The model that each completed `researcher`, `architect`, `qa` and `devops` run actually used is not recorded; treat the configured model as likely, not certain.

**Tools**

- [Hermes Agent](https://hermes-agent.nousresearch.com/docs): agent runtime, CLI, dashboard and kanban dispatcher. Cards run in git worktrees under `.worktrees/`. Plans and notes live in `~/dev/agency-docs/`, outside this repo.
- Claude Code in omp ([omp.sh](https://omp.sh)): the Phase 1 build agent.
- opencode: the provider that served LongCat 2.5 for the initial scaffold.
- Anthropic API: provider for every Claude model above.
- Git and GitHub: remote `origin` is `mikebobadilla/mlb-free-agent-tracker`; PRs #1–#3, #5 and #6 were merged there. Agents merge their own verified branches into `main` (D-023).
- Data sources the app uses: Retrosheet, the Chadwick Baseball Bureau Register, the MLB Stats API (daily signings check only) and public news reports for contract terms. See [Data sources](#data-sources).
- Build and test tooling (Node.js, TypeScript, Prisma, Vite, React, Express, vitest) is listed in `AGENTS.md`.

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
- `GET /api/sync-status` — `{ scheduled, lastAttemptAt, lastSuccessAt, lastError, ok }`; the SPA shows a banner when `ok` is false
- Any other path serves the SPA from `dist/`

## Deployment

Run `npm run build`, then `npm start` on any host with Node.js 20+. The app needs `config/players.yaml`, `prisma/schema.prisma` and a writable `data/` directory.
