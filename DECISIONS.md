# Decision Log

Every non-obvious decision about this project, newest last. Decisions are never
deleted — if one is reversed, add a new entry that supersedes it and mark the
old one `SUPERSEDED by D-XXX`.

**When to add an entry:** any time a choice was made between real alternatives
(scope, approach, data source, workflow), or something was discovered that
changes how a card should be built. If you had to explain it in a PR or chat,
it belongs here.

**Format:**

```
## D-XXX — Short title
- **Date:** YYYY-MM-DD
- **Status:** ACCEPTED | SUPERSEDED by D-XXX | REVISIT
- **Cards:** P1-001, ...
- **Context:** What prompted the decision.
- **Decision:** What we chose.
- **Alternatives:** What we didn't choose, and why.
- **Consequences:** Follow-ups, trade-offs, things to watch.
```

---

## D-001 — Feature work on branches in git worktrees
- **Date:** 2026-10-10
- **Status:** ACCEPTED
- **Cards:** —
- **Context:** Multiple agents/sessions may work on the repo at once.
- **Decision:** All feature work happens on a `feature/<short-description>` branch checked out in a git worktree (sibling directory, e.g. `../mlb-tracker-<desc>`). Nothing is committed directly to `main`.
- **Alternatives:** Plain branches in one checkout — rejected, parallel sessions would step on each other.
- **Consequences:** Check `git worktree list` before starting; an existing worktree may already hold in-progress work.

## D-002 — One branch and one PR for Phase 1
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-001, P1-002, P1-003, P1-004, P1-005
- **Context:** A worktree `feature/phase1-stats-pipeline` already existed with uncommitted P1-001 work.
- **Decision:** Continue in that worktree. All Phase 1 cards land on `feature/phase1-stats-pipeline`, pushed incrementally to a single open PR, one commit per card.
- **Alternatives:** One branch per card — cleaner history per change, but more PR overhead for small, tightly coupled changes to the same file (`stats_sync.go`).
- **Consequences:** The PR grows over time; commit messages must reference card IDs so individual changes stay reviewable.

## D-003 — Decode MLB stats with a string-or-number `FlexFloat` type
- **Date:** 2026-10-11
- **Status:** ACCEPTED (placeholder handling SUPERSEDED by D-010)
- **Cards:** P1-001
- **Context:** Verified against the live API: rate stats like `era`, `whip`, `inningsPitched` are JSON strings (`"3.20"`), so decoding into `float64` failed and every pitcher was dropped from sync.
- **Decision:** A `FlexFloat` type in `internal/jobs/stats_sync.go` accepts JSON numbers or numeric strings. The API's placeholders for undefined stats (`""`, `"-"`, `".---"`, `"-.--"`, `"*.**"`) decode to `0`.
- **Alternatives:** Decode as `string` and convert at the use site — spreads parsing across the codebase.
- **Consequences:** **Revisit:** mapping placeholders to `0` means a pitcher with 0 IP shows a 0.00 ERA, which reads as "perfect" rather than "no data". Likely fix: make placeholders decode to "not set" (e.g. a `Valid` flag) and store `NULL`.

## D-004 — Show season stats, fall back to the previous season
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-002
- **Context:** The sync was storing **career** stats, which are never empty — so the "zeros in the offseason" problem in P1-002 only appears once season stats are shown. For free agency, recent performance matters more than career totals.
- **Decision:** Sync stats for the current calendar year's season. If the API returns no splits for that season (verified: `"stats": []`), fetch the previous season instead. Store which season the stats came from in a new `season` column and show it in the UI.
- **Alternatives:** Keep career stats (nothing to fall back from, but less useful); store both season and career (more columns — deferred to P1-003 if wanted).
- **Consequences:** Two-plus API requests per player in the offseason; all requests are rate-limited at 200ms.

## D-005 — Traded players: use the season-total split
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-002
- **Context:** Verified against the live API (Chisholm, 2024): a traded player's season returns a total split (no `team`) followed by one split per team.
- **Decision:** Prefer the split without a `team`; fall back to the first split if none.
- **Alternatives:** Always take the first split — works today only because of API ordering.
- **Consequences:** None expected.

## D-006 — Get age from `/people/{id}`
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-004
- **Context:** Age was read from the stats response, which doesn't include it, so age was always 0.
- **Decision:** Fetch `currentAge` from `/people/{id}` (one extra rate-limited request per player).
- **Alternatives:** `hydrate` stats onto the people call (one request instead of two) — fewer requests but a more complex response shape; can switch later if sync time matters.
- **Consequences:** None expected.

## D-007 — WAR is not available from the MLB Stats API
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-005
- **Context:** Verified against the live API: no `war` field exists in hitting or pitching stats. WAR has always been 0.
- **Decision:** Leave the WAR column in place (it shows `-`), and track sourcing WAR as its own card (P1-005) instead of blocking P1-002.
- **Alternatives:** Remove WAR from the UI until it has a source.
- **Consequences:** Needs a second data source (FanGraphs or Baseball-Reference), which conflicts with the "MLB Stats API is the primary source" assumption — decide in P1-005 grooming.

## D-008 — Every change ships with tests
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** all
- **Context:** The scaffold had no tests at all.
- **Decision:** Each card adds tests for what it changes. API code is tested against an `httptest` server (the API base URL is a package variable so tests can override it), never the live API. `go vet ./...` and `go test ./...` must pass before pushing.
- **Alternatives:** A dedicated "add test coverage" card up front — slower to deliver value; coverage grows naturally card by card instead.
- **Consequences:** Live-API checks are still done manually (`make sync`) and noted in the PR.

## D-009 — Phase 1 stats come from the MLB Stats API only; FIP is computed
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-003, P1-005
- **Context:** Of the stats P1-003 asked for, WAR, wRC+ and FIP are not in the MLB Stats API.
- **Decision:** P1-003 ships what the API provides (OBP, SLG, OPS, WHIP, IP, K/9) and computes FIP from counting stats: `FIP = (13·HR + 3·(BB+HBP) − 2·K) / IP + C`. WAR and wRC+ move to P1-005, which stays in GROOMING until a data source is chosen.
- **Alternatives:** FanGraphs' unofficial JSON endpoints (undocumented, can break without notice); dropping WAR from the UI.
- **Consequences:** The FIP constant `C` varies by season (~3.1); use a fixed constant for now and note it on the dashboard. Revisit if P1-005 adds a source that provides real FIP.

## D-010 — Undefined stats are stored as NULL and shown as "-"
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-002, P1-003
- **Context:** D-003 decoded API placeholders (`"-.--"`, `"*.**"`, …) to `0`, so a pitcher with 0 IP showed a "perfect" 0.00 ERA.
- **Decision:** Placeholders decode to "not set"; rate stats are stored as `NULL` and the UI shows `-`.
- **Alternatives:** Keep `0` (misleading).
- **Consequences:** Stat fields that can be undefined are nullable in the model (pointer or `Valid` flag), matching how `ERA *float64` already works.

## D-011 — Server startup must not overwrite synced data
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-006
- **Context:** On startup the server upserts every player from `players.yaml` through the same `UpsertPlayer` the sync uses, so age, stats and **status** are reset to blank on every restart — a signed player would flip back to unsigned.
- **Decision:** Add a separate store function for config fields (name, position, prev_team) that inserts new players but never touches synced fields or status on existing rows. Found while building: the stats sync's `UpsertPlayer` *also* overwrote status with the blank YAML value, so the sync no longer writes status at all — status changes only through `UpdatePlayerStatus`. The migration repairs blank statuses to `unsigned`.
- **Alternatives:** Remove the startup upsert entirely — but then new YAML players wouldn't appear until the first sync completes.
- **Consequences:** None expected.

## D-012 — Embed the schema and add columns with ALTER TABLE
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-002, P1-003
- **Context:** `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so new columns never reached existing databases. It was also read from disk with a relative path, which breaks the single-binary deploy and tests.
- **Decision:** Embed `schema.sql` with `go:embed`. New `players` columns go in both `schema.sql` (fresh DBs) and an `addedColumns` list in `internal/db/db.go`; `Migrate` adds any that are missing. Safe to run on every start.
- **Alternatives:** A migration tool (golang-migrate, goose) — more than we need for additive columns, and AGENTS.md asks for minimal dependencies. Telling users to `make clean` — loses contracts/rumors/predictions.
- **Consequences:** Only additive changes are supported. Renames, type changes or data moves will need a real versioned migration — revisit then.

## D-013 — Store innings pitched as given; compute FIP from outs
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-003
- **Context:** Verified against the live API: `inningsPitched` is in baseball notation (`"42.2"` = 42⅔ innings), so it can't be used in math.
- **Decision:** Store `ip` exactly as the API gives it, for display. Compute FIP from the `outs` field (`outs / 3` = true innings).
- **Alternatives:** Convert to true innings on sync and back for display — two conversions for no benefit.
- **Consequences:** Anyone doing math on `ip` must use outs instead (noted in AGENTS.md Known Issues).

## D-014 — Nullable stats render through template funcs, never `printf`
- **Date:** 2026-10-11
- **Status:** ACCEPTED
- **Cards:** P1-002, P1-003
- **Context:** Verified: the old dashboard rendered ERA as `%!f(*float64=0x...)`, because `printf` in a template doesn't dereference a `*float64`.
- **Decision:** Template funcs in `cmd/server/main.go`: `stat "<format>" <ptr>` (e.g. ERA `3.20`) and `avg <ptr>` (rate stats without the leading zero, `.908`). Both render `-` when the value is nil. Render tests in `cmd/server/main_test.go` fail if a pointer or format error appears in the output.
- **Alternatives:** Store stats as plain `float64` and use `0` for "no data" — rejected by D-010.
- **Consequences:** New stat columns must use these funcs in templates.

## D-020 — Contract expiry is a DB-only year set through the store
- **Date:** 2026-10-13
- **Status:** SUPERSEDED by D-025 (expiry is now derived from the current contract)
- **Cards:** P3-004
- **Context:** P3-004 needs each player's contract expiration year. P3-004 cited this entry but it was never written; backfilled on 2026-10-29 from commits `bea9c24` and `c41a161`. (D-015 to D-019 are used by the unmerged P3-001 branches, which is why main skips them.)
- **Decision:** Store the year as a nullable integer `contract_expiry` on `players`, written only through `SetContractExpiry(playerID, year)`, not via `players.yaml`. The Go sync CLI set 2026 for Morejon, King and France.
- **Alternatives:** None recorded.
- **Consequences:** The value exists only in the database, so `make clean` loses it and the stats sync must never overwrite it. The Node rewrite (D-021) did not port the sync-CLI step, so nothing calls `setContractExpiry` on main yet.

## D-021 — Rewrite the app in TypeScript + Express + Prisma + SQLite, frontend in React
- **Date:** 2026-10-25
- **Status:** ACCEPTED
- **Cards:** P3-005
- **Context:** The maintainer does not understand Go and wants the tracker built in Node.js with Prisma; the Go codebase has rough edges and the project is an LLM-test scaffold.
- **Decision:** Full rewrite of the app in TypeScript + Express + Prisma (SQLite) with a React SPA + JSON API frontend. Preserve behavior (curated YAML config, stats sync job, contract watcher, dashboard, player detail, API). Replace Go entirely on branch `feature/P3-005-node-rewrite`; Go code is deleted on this branch once the rewrite reaches parity.
- **Alternatives:** Stay in Go; Express + plain JavaScript; Next.js; EJS server-rendered UI; keep Go alongside for reference.
- **Consequences:** The rewrite must port all behavior (sync, watcher, store, jobs, API, tests, config). Prisma + SQLite keeps a single-file database story. React SPA moves UI state/fetching into the client. The Go implementation is dropped rather than parallel-run.

## D-022 — Tests run against a throwaway SQLite database per test file
- **Date:** 2026-10-29
- **Status:** ACCEPTED
- **Cards:** P3-005
- **Context:** The API tests read `data/tracker.db`, so they passed only where a synced dev database already existed. In a fresh worktree they returned 500. A store test that writes rows would also have changed real data. Separately, vitest picked up the copies of the tests inside `.claude/worktrees/`.
- **Decision:** vitest `setupFiles` runs `src/test/setupDb.ts`, which creates a temp directory, points `DATABASE_URL` at it and runs `prisma db push --skip-generate` before the test file loads the Prisma client. The directory is deleted after the file finishes. vitest also excludes `.claude/**`.
- **Alternatives:** A shared test database cleaned between tests couples test files to each other. Mocking Prisma would not exercise the queries.
- **Consequences:** Each test file adds about half a second for `db push`. Tests start from an empty database and must create the rows they need.

## D-023 — Agents merge feature branches into main
- **Date:** 2026-10-29
- **Status:** ACCEPTED
- **Cards:** all
- **Context:** AGENTS.md and the PLAN workflow said humans open PRs and merge. The maintainer said agents can merge to `main` on this project.
- **Decision:** Feature work still happens on `feature/*` branches in worktrees (D-001). Once `npm test` passes, the agent merges the branch into `main`, pushes, and sets the card to DONE. A PR is optional.
- **Alternatives:** Keep human-only merges, which leaves finished work sitting on branches.
- **Consequences:** `npm test` is the only gate before `main`, so the tests have to catch regressions.

## D-024 — Contract terms are curated in players.yaml from public reporting
- **Date:** 2026-10-29
- **Status:** ACCEPTED
- **Cards:** P3-006, P3-004
- **Context:** The maintainer wants each player's current contract. This is a public project, so data must be legal to republish. Checked: the MLB Stats API has no terms (`/people` hydrates `contract`/`contracts`/`currentContract` return nothing; transactions only say "New York Mets signed free agent RF Juan Soto."). FanGraphs' RosterResource has the terms, but its ToS says "Any unauthorized reproduction, publication, further distribution or public exhibition … is strictly prohibited". Cot's Contracts sits behind an anti-bot wall, Spotrac returns 403, and the FanGraphs Excel export is members-only.
- **Decision:** Each player in `config/players.yaml` may carry a `contract:` block (team, years, total, first_season, signed, source URL, optional opted_out_after and notes), entered by hand from public news or team press releases. `source` is required and shown on the player page. Only the facts are copied, never article text.
- **Alternatives:** Scrape FanGraphs/Spotrac/Cot's (terms or access controls forbid it); show signings without terms (loses the main thing the maintainer wants).
- **Consequences:** Terms update when someone edits the YAML. The contract watcher still records signings, and the UI shows "terms not entered" until the YAML catches up. P1-005's FanGraphs and Baseball-Reference options are ruled out for the same reason.

## D-025 — Current contract, status and expiry are derived in one place
- **Date:** 2026-10-29
- **Status:** ACCEPTED
- **Cards:** P3-006, P3-004, P3-001
- **Context:** Contracts now come from two places (curated YAML and MLB transactions). The old watcher marked every player signed using their first-ever transaction (e.g. Morejon "signed" with the Padres in 2016), and `getDashboardData` showed an arbitrary contract row.
- **Decision:** `src/contracts.ts` holds the rules. The offseason starts Oct 1, after which signings and status refer to next season. The current contract is the one starting in the latest season; for the same season, curated terms beat a bare transaction. Expiry is the opt-out season, else first_season + years − 1. Status is `signed` if the current contract covers the upcoming season, otherwise `unsigned` (shown as "free agent"). `refreshContractState` is the only writer of `status` and `contractExpiry`. The watcher only records `SFA` transactions dated since the offseason started, once per transaction id, and logs per-player failures instead of crashing. Players removed from `players.yaml` are deleted with their contracts, rumors and predictions on sync.
- **Alternatives:** Keep a hand-set expiry (D-020), which drifts from the contract; let the watcher set status directly, which reintroduced the 2016-signing bug.
- **Consequences:** The manual `negotiating` status has no writer and would be overwritten. Old watcher rows without a transaction id stay in existing databases but never win, because they start in long-past seasons.

## D-026 — MLB Stats API terms restrict public use; open replacement identified
- **Date:** 2026-10-29
- **Status:** REVISIT
- **Cards:** P1-007, P1-005
- **Context:** Every MLB Stats API response points to http://gdx.mlb.com/components/copyright.txt: "Only individual, non-commercial, non-bulk use of the Materials is permitted and any other use of the Materials is prohibited without prior written authorization from MLBAM." A public site arguably isn't "individual" use. Researched open alternatives:
  - Retrosheet allows "any desired use" if a fixed notice is shown prominently. It publishes per-game CSVs (no season tables) about a month after the season: 2024 on 2024-12-03, 2025 on 2025-11-27. 2026 isn't out yet.
  - Lahman (CC BY-SA 3.0) has season tables but lags by 2–9 months (2025 data released 2026-01-02), has no MLBAM ids, and is share-alike.
  - The Chadwick register (ODC-By) maps MLBAM ↔ Retrosheet ids and has birth dates; updated about monthly.
  - Sports Reference forbids building sites "based on data you scrape". No openly licensed WAR exists.
- **Decision:** Keep the MLB Stats API for now and plan the replacement as P1-007 (Retrosheet stats + Chadwick ids/birth dates, with the required attribution notices).
- **Alternatives:** Ask MLBAM for written permission; limit the API to change detection only.
- **Consequences:** Open sources lag the season by about a month, so the dashboard would show 2025 stats until Retrosheet publishes 2026. The contract watcher still depends on MLB transactions, which have no open equivalent.
