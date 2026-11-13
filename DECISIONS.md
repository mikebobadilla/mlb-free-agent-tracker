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
- **Status:** SUPERSEDED by D-027 (stats no longer come from the MLB Stats API; placeholder handling was SUPERSEDED by D-010)
- **Cards:** P1-001
- **Context:** Verified against the live API: rate stats like `era`, `whip`, `inningsPitched` are JSON strings (`"3.20"`), so decoding into `float64` failed and every pitcher was dropped from sync.
- **Decision:** A `FlexFloat` type in `internal/jobs/stats_sync.go` accepts JSON numbers or numeric strings. The API's placeholders for undefined stats (`""`, `"-"`, `".---"`, `"-.--"`, `"*.**"`) decode to `0`.
- **Alternatives:** Decode as `string` and convert at the use site — spreads parsing across the codebase.
- **Consequences:** **Revisit:** mapping placeholders to `0` means a pitcher with 0 IP shows a 0.00 ERA, which reads as "perfect" rather than "no data". Likely fix: make placeholders decode to "not set" (e.g. a `Valid` flag) and store `NULL`.

## D-004 — Show season stats, fall back to the previous season
- **Date:** 2026-10-11
- **Status:** SUPERSEDED by D-027 (latest season Retrosheet has published)
- **Cards:** P1-002
- **Context:** The sync was storing **career** stats, which are never empty — so the "zeros in the offseason" problem in P1-002 only appears once season stats are shown. For free agency, recent performance matters more than career totals.
- **Decision:** Sync stats for the current calendar year's season. If the API returns no splits for that season (verified: `"stats": []`), fetch the previous season instead. Store which season the stats came from in a new `season` column and show it in the UI.
- **Alternatives:** Keep career stats (nothing to fall back from, but less useful); store both season and career (more columns — deferred to P1-003 if wanted).
- **Consequences:** Two-plus API requests per player in the offseason; all requests are rate-limited at 200ms.

## D-005 — Traded players: use the season-total split
- **Date:** 2026-10-11
- **Status:** SUPERSEDED by D-027 (Retrosheet game rows are summed across teams, same result)
- **Cards:** P1-002
- **Context:** Verified against the live API (Chisholm, 2024): a traded player's season returns a total split (no `team`) followed by one split per team.
- **Decision:** Prefer the split without a `team`; fall back to the first split if none.
- **Alternatives:** Always take the first split — works today only because of API ordering.
- **Consequences:** None expected.

## D-006 — Get age from `/people/{id}`
- **Date:** 2026-10-11
- **Status:** SUPERSEDED by D-027 (age from the Chadwick birth date)
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
- **Status:** SUPERSEDED by D-027 (stats from Retrosheet; FIP is still computed the same way)
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

Go-era decisions for P3-001 (signing detection), recorded from the `feature/P3-001-contract-watcher` branch. That branch's Go code was superseded by the TypeScript rewrite (D-021); the feature lives on in `src/jobs/contractWatcher.ts`.

## D-015 — Poll `/transactions?type=FA` for free agent signings
- **Date:** 2026-10-13
- **Status:** ACCEPTED
- **Cards:** P3-001
- **Context:** The transactions endpoint returns ALL transactions for a player (assignments, IL stints, etc.) — 50+ results for a typical player. Need to filter for free agent signings only.
- **Decision:** Use the `type=FA` query parameter to filter server-side. This returns only free agent signings.
- **Alternatives:** Poll without the type filter and filter client-side — more data to transfer and parse. Poll a different endpoint — no other endpoint provides signing info.
- **Consequences:** If the `type` parameter doesn't work as expected, we'll need to filter client-side. Will verify during implementation.

## D-016 — Contract financial terms are NULL (transactions API has no dollar amounts)
- **Date:** 2026-10-13
- **Status:** ACCEPTED
- **Cards:** P3-001
- **Context:** The transactions API gives us the fact of a signing (player, team, date) but no contract value, years, or AAV.
- **Decision:** Create contract records with team and signed_date populated; years, total_value, and aav are stored as NULL. The `contracts` table already supports nullable columns for these fields. The template hides fields that are 0 (not set).
- **Alternatives:** Scrape contract details from a second source (Spotrac, etc.) — adds complexity and another data source. Leave contract creation for a future card — but then the tracker shows "signed" with no contract info, which is confusing.
- **Consequences:** The player detail page will show "Signed to [team]" but no financial terms. A future card can backfill contract values from another source.

## D-017 — Poll every 30 minutes
- **Date:** 2026-10-13
- **Status:** ACCEPTED
- **Cards:** P3-001
- **Context:** Signings are time-sensitive — the value of the tracker drops quickly if we don't detect them promptly.
- **Decision:** Poll every 30 minutes. With 8 tracked players, this is 16 requests/hour — very light API usage.
- **Alternatives:** Every 6 hours (same as stats sync) — too slow for breaking signings. Every 5 minutes — excessive for 8 players.
- **Consequences:** Signings are detected within 30 minutes. During hot stove season, this might increase but still manageable.

## D-018 — Only poll unsigned players
- **Date:** 2026-10-13
- **Status:** ACCEPTED
- **Cards:** P3-001
- **Context:** Once a player is marked signed, polling them again wastes API requests and could create duplicate contracts.
- **Decision:** Skip players whose status is already "signed" (or anything other than "unsigned"). If a player's status is manually changed back to unsigned, polling resumes.
- **Alternatives:** Poll all players always — wastes requests. Track last-checked transaction ID — more complex, not worth it for 8 players.
- **Consequences:** If a player's status is reset to unsigned after being signed, polling resumes and the job will re-detect the signing (but dedup prevents duplicate contracts).

## D-019 — Dedup by checking for existing contract
- **Date:** 2026-10-13
- **Status:** ACCEPTED
- **Cards:** P3-001
- **Context:** The job runs every 30 minutes. Without dedup, it would create a new contract record every run for the same signing.
- **Decision:** Before inserting a contract, check if one already exists for the player using `GetLatestContract`. If one exists, skip. This is simpler than adding a unique constraint or tracking last-checked transaction IDs.
- **Alternatives:** Unique constraint on contracts(player_id) — would prevent multiple contracts per player, but a player could legitimately sign multiple contracts over time. Track last-checked transaction ID — more robust but more complex.
- **Consequences:** If a player signs, is released, and signs again, only the first contract is recorded. A future card can handle this if needed.

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
- **Status:** SUPERSEDED by D-027
- **Cards:** P1-007, P1-005
- **Context:** Every MLB Stats API response points to http://gdx.mlb.com/components/copyright.txt: "Only individual, non-commercial, non-bulk use of the Materials is permitted and any other use of the Materials is prohibited without prior written authorization from MLBAM." A public site arguably isn't "individual" use. Researched open alternatives:
  - Retrosheet allows "any desired use" if a fixed notice is shown prominently. It publishes per-game CSVs (no season tables) about a month after the season: 2024 on 2024-12-03, 2025 on 2025-11-27. 2026 isn't out yet.
  - Lahman (CC BY-SA 3.0) has season tables but lags by 2–9 months (2025 data released 2026-01-02), has no MLBAM ids, and is share-alike.
  - The Chadwick register (ODC-By) maps MLBAM ↔ Retrosheet ids and has birth dates; updated about monthly.
  - Sports Reference forbids building sites "based on data you scrape". No openly licensed WAR exists.
- **Decision:** Keep the MLB Stats API for now and plan the replacement as P1-007 (Retrosheet stats + Chadwick ids/birth dates, with the required attribution notices).
- **Alternatives:** Ask MLBAM for written permission; limit the API to change detection only.
- **Consequences:** Open sources lag the season by about a month, so the dashboard would show 2025 stats until Retrosheet publishes 2026. The contract watcher still depends on MLB transactions, which have no open equivalent.

## D-027 — Stats from Retrosheet + Chadwick; MLB transactions checked once a day
- **Date:** 2026-10-29
- **Status:** ACCEPTED
- **Cards:** P1-007
- **Context:** D-026 found that MLB Stats API terms don't clearly allow a public site. The maintainer chose to switch stats to Retrosheet and check MLB transactions nightly.
- **Decision:**
  - **Stats:** download `https://www.retrosheet.org/downloads/<season>/<season>csvs.zip` (~10 MB) for the last completed season (`upcomingSeason − 1`), falling back one season while Retrosheet hasn't published it (on 2026-10-29: 2026 → 404, 2025 used). Sum regular-season `value` rows per player from `batting.csv`/`pitching.csv` and compute OBP, SLG, OPS, ERA, WHIP, IP (baseball notation), K/9 and FIP (fixed constant 3.1). Checked against the MLB API for 2025: Soto .396/.525/.921 and Snell 61.1 IP, 2.35 ERA, 1.26 WHIP, 10.57 K/9 match exactly.
  - **IDs and age:** read Retrosheet ids and birth dates from the Chadwick register, keyed by MLB id, only for players missing them, and cache them on `Player.retroId`/`birthDate`. Age is computed from the birth date.
  - **Schedule:** one cycle runs at startup and then every 24 hours: stats, then curated contracts, then the transactions check. That check is the only remaining MLB Stats API call: 11 requests a day, used to detect signings.
  - **Attribution:** the site footer shows the Retrosheet notice word for word, the ODC-By notice for Chadwick, and credits MLB Advanced Media for signing dates.
  - New dependency: `fflate` for unzipping, with no dependencies of its own.
- **Alternatives:**
  - Lahman: share-alike, lags by months, no MLB ids.
  - Ask MLBAM for permission: still possible, and would let us drop the remaining transactions check.
  - Rely only on curated contracts with no MLB calls at all.
- **Consequences:**
  - Stats show the last completed season Retrosheet has published, never the season in progress.
  - The nightly transactions check still falls under MLB's "individual, non-commercial, non-bulk use" terms. It's limited to detecting signings and showing team and date, but it isn't explicitly permitted.
  - The first sync downloads up to 16 Chadwick files (~4 MB each); later syncs skip them unless a new player is added.
  - The MLB player-stats code (FlexFloat, `/people` age lookup) is gone.

## D-028 — Track the 2026-27 free-agent class: MLB.com top 30 + pending player options
- **Date:** 2026-10-30
- **Status:** ACCEPTED
- **Cards:** P3-007
- **Context:** The original 11 players were mostly under long contracts (Soto through 2039). The maintainer only cares about players who are free agents or have a player decision this offseason. MLB.com's position-by-position list has 247 free agents (2026-10-29), too many to curate contracts for by hand.
- **Decision:**
  - **Who's tracked:** MLB.com's "top 30 names to watch in free agency" (2026-10-26), plus every player with a 2027 player option or opt-out still pending on 2026-10-29 (MLB.com options tracker): 34 players.
  - **Left out:** Teruaki Sato and Kaima Taira have no MLB id until they're posted from Japan.
  - **Contract blocks:** entered only where they decide status. Pending opt-outs (Burnes, Berríos, Matsui, Pagán, Wandy Peralta, Severino) need their current deals so they show as signed until they decide. King and Holmes have reported opt-outs, and Morejón and France keep their expired deals. Free agents without a block show as free agents.
  - **Which stats show:** pitchers (`P`/`SP`/`RP`) show pitching stats only and everyone else hitting stats only. A pitcher's interleague at-bats (Trevor Rogers, .000 OPS) or a position player's mop-up inning (Jake Bauers, 3.60 ERA) aren't representative.
- **Alternatives:** Only the 4 relevant original players (misses most of the market); the whole class of 247 (too many signings to enter by hand).
- **Consequences:**
  - After the 2026-11-02 option deadline, players who opt in should be dropped and players who opt out lose their "signed" status (add `opted_out_after`).
  - Two-way players would lose one side of their stats.
  - Foster Griffin has no stats yet: he pitched in Japan in 2025, and Retrosheet's 2026 season isn't out.

## D-030 — Personal exploratory project; README keeps an agent and tool log
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** t_0a33b0d9 (Hermes kanban)
- **Context:** The owner asked for the project goal to be written down and for a record of every AI agent and tool used, so the work can be shown.
- **Decision:**
  - The project is exploratory and personal: for learning and discovery work on MLB free agents, not for profit, no customers or client decisions, possible public site later. Success = useful for following free agents and a well-documented agent workflow.
  - Everything may be merged to `main`. Agents merge their own finished, verified work in small commits (extends D-023).
  - README "Agents and tools used" lists each Hermes profile, its model/provider where known, and the external tools. Only facts from the board, session records and git history; unknowns are marked unknown.
  - Any agent that adds a tool or model updates that section in the same commit.
- **Alternatives:** Keep the log in `agency-docs` only (outside the repo, so not visible to anyone viewing the project).
- **Consequences:** The kanban board does not store the model per run, so the table gives each profile's configured model plus other models seen in Hermes session records. It will drift unless agents follow the rule.

## D-029 — An empty or mis-keyed players.yaml is an error, never "track nobody"
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** W-01
- **Context:** `loadPlayers` returned `[]` for an empty file, a wrong top-level key, or `players: []`. `syncCuratedContracts` then called `removeUntrackedPlayers([])`, and `notIn: []` matches every row, so the sync deleted every player plus their contracts, rumors and predictions. QA reproduced it at runtime (finding D-1).
- **Decision:**
  - `loadPlayers` throws when `players` is missing, null, not a list, or empty. The message names the file and the `players` key.
  - `removeUntrackedPlayers` refuses an empty tracked list as a second guard: it logs an error and returns without touching the database.
  - The guard is in two places because the store function is also the last line of defence for any future caller that builds the list some other way.
- **Alternatives:** Guard only in `loadPlayers` (leaves the store function dangerous for other callers); guard only in the store (the sync would still log and carry on with stats for zero players); add an explicit "track nobody" flag (nobody has asked for it).
- **Consequences:**
  - Deliberately emptying the tracked list now takes a manual database clear (delete `data/tracker.db`, then sync), not a YAML edit.
  - A bad `players.yaml` now makes `npm run sync` and server startup fail with this error. Keeping the server up in that case is W-03, not this card.

## D-031 — A failed startup sync or config load never takes the server down
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** W-03 (kanban t_f18ac26f)
- **Context:** The initial sync ran before the 24h timer was created, and `main()` exited the process on any error. An upstream outage at boot (Retrosheet, Chadwick, MLB) killed a server whose database was fine, and the daily timer never started (discovery risk R2).
- **Decision:**
  - The server keeps serving stored data whatever happens in sync or config loading; the sync path never calls `process.exit`.
  - `startNightlySync` logs a failed initial run and always starts the 24h timer.
  - If `loadPlayers` throws at boot (including the D-029 guard), the error is logged and no sync is scheduled; fixing the YAML needs a restart, as before.
  - Fetch timeouts, an overlap guard and a sync-status record are separate cards.
- **Alternatives:** Keep exiting and rely on a supervisor to restart (there is none, and a restart loop does not fix an upstream outage); reload players on every scheduled run (bigger change, not needed yet).
- **Consequences:** A broken boot is now visible only in the logs until a sync-status record or `/healthz` exists (W-08a).

## D-032 — Sync status is one in-memory record, shown in the API and as a banner
- **Date:** 2026-11-13
- **Status:** ACCEPTED (where it is stored is SUPERSEDED by D-037)
- **Cards:** W-08a (kanban t_3ca9615d)
- **Context:** D-029 and D-031 mean a bad config or failed sync only logs to the console while the server keeps serving old data (the consequence D-031 noted).
- **Decision:**
  - `src/jobs/syncStatus.ts` holds `scheduled`, `lastAttemptAt`, `lastSuccessAt`, `lastError`; `ok` is derived (scheduled and no error). It is set only from `runSyncCycle`, `startNightlySync` and `startBackgroundJobs`.
  - It lives in memory and resets on restart; every boot runs a sync, so persisting it to the database adds nothing for a single-owner app.
  - `GET /api/sync-status` returns it. The SPA shows a banner when `ok` is false and hides it otherwise (also when the status request itself fails).
  - `startNightlySync` creates the timer before the first run, so `scheduled` is true while the first sync is still running.
  - A `loadPlayers` failure counts as an attempt and sets `lastError`, so the banner shows the YAML error text.
- **Alternatives:** Persist in a database table (migration, no benefit); a `/healthz` for external monitoring (separate card, nobody monitors yet).
- **Consequences:** Status is per process: `npm run sync` runs in another process and does not update a running server. The error text is shown to anyone who can open the page; fine for a personal tool, but revisit before public hosting.

## D-033 — Host on Vercel (Hobby) with Supabase Postgres (Free)
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-01 to H-08 (kanban t_a6f82b2c is the plan)
- **Context:** The owner chose to host the app on Vercel with Supabase Postgres, for personal, non-commercial use (D-030). The app was built as one long-running Node process: SQLite file, `setInterval` sync, `express.static` for the SPA. None of those work on Vercel functions.
- **Decision:**
  - Vercel Hobby for hosting and cron, Supabase Free for the database. Both free tiers are for non-commercial use: if the site is ever monetised, Vercel must move to Pro (confirm the terms before any monetisation).
  - Supersedes P6-001 (Fly.io / Railway). A Fly.io draft (`Dockerfile`, `fly.toml`, `.dockerignore`, README steps) sits on the unmerged branch `feature/fly-deploy` (devops, commit a3ef91a, worktree `.worktrees/fly-deploy`); it must not be merged and the owner may delete the branch.
  - Limits read from the Vercel and Supabase docs on 2026-11-13: Hobby cron runs at most once a day, fires anywhere inside the scheduled hour, is best-effort, may fire twice, and is not retried; Hobby function duration is 300 s (default and maximum); an Express app deploys as one function with a 250 MB bundle limit, and `express.static` is ignored (static files come from the CDN); Supabase Free pauses projects with low activity over 7 days, and a paused project can be restored for 1 year.
- **Alternatives:** Keep the Node process on Fly.io/Railway (the owner chose otherwise); Vercel with Neon or Vercel's own Postgres (the owner named Supabase).
- **Consequences:** The limits above are quoted from docs, not tested; H-06 re-checks the ones the app depends on. The README gets a Supabase restart step (H-07).

## D-034 — Postgres through Prisma: pooled runtime URL, direct migration URL, first migration, per-file test schemas
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-01, H-02, H-06
- **Context:** `schema.prisma` uses `sqlite`, has no raw SQL and no SQLite-only features (checked), so the provider switch is small. There are no migration files (the project used `db push`), and `src/test/setupDb.ts` builds a `file:` SQLite URL per test file.
- **Decision:**
  - `provider = "postgresql"`; `url = env("DATABASE_URL")` (runtime) and `directUrl = env("DIRECT_URL")` (schema changes).
  - On Supabase, `DATABASE_URL` is the transaction pooler (port 6543) with `?pgbouncer=true&connection_limit=1`; `DIRECT_URL` is the session pooler (port 5432, works from IPv4-only machines) or the direct connection.
  - Production schema comes from a committed first migration, `prisma/migrations/0_init`, applied with `prisma migrate deploy` run by hand from a machine that has `DIRECT_URL`. It is not run in the Vercel build, so a preview build can never change the database.
  - Tests keep using `prisma db push`, into a throwaway schema per test file (`?schema=test_<random>`) in the database named by `TEST_DATABASE_URL`, dropped in `afterAll`. A `db:check` script fails when `schema.prisma` and the migrations disagree.
  - Local Postgres is a plain `postgres:17` container from `docker-compose.yml`, host port **54330**, databases `mlb_tracker` and `mlb_tracker_test`, user and password `postgres`. Not `supabase start`: another local project already holds ports 54321 and 54322, and the full stack is far more than the app needs.
  - Env var names, fixed for every card: `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, `CRON_SECRET`.
- **Alternatives:** `db push` in production (no history, silent data loss on drift); `supabase start` for tests (port clash, heavy); PGlite for tests (new dependency, differs from production Postgres); SQLite for tests and Postgres in production (tests would not exercise the production dialect).
- **Consequences:** `npm test` now needs Docker running (`npm run db:up`). `prisma` moves to `dependencies` and `postinstall` runs `prisma generate`, because Vercel caches `node_modules`. Existing `data/tracker.db` files are ignored from here on.

## D-035 — Do not migrate data/tracker.db; re-sync into Supabase
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-06
- **Context:** `data/tracker.db` holds 34 players, 14 contracts, 0 rumors and 0 predictions.
- **Decision:**
  - Nothing is copied. After `migrate deploy`, one sync against Supabase fills the database. A cold sync into an empty database took 24 s locally (34 players, 33 with stats, 10 curated contracts).
  - The 4 extra contracts in the old file are leftovers from before D-025 (`origin = transaction`, no transaction id, signing dates in 2014 to 2016); a fresh sync correctly does not create them.
  - Every row derives from `config/players.yaml` plus the sync sources.
- **Alternatives:** Export and import the SQLite rows (copies the stale rows, needs a one-off script).
- **Consequences:** If rumors or predictions ever hold hand-entered data, this changes. The old SQLite file stays on the owner's disk as a backup.

## D-036 — Vercel shape: SPA from the CDN, one Express function for /api, sync as a cron route
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-04, H-05, H-06
- **Context:** `src/server/index.ts` builds the Express app, serves `dist/` with `express.static`, calls `app.listen`, and starts the `setInterval` sync. The SPA switches views with React state, not URL paths, so it only needs `/`.
- **Decision:**
  - Split the app in two: `src/app.ts` holds the Express app and its `/api` routes and does nothing on import (no listen, no static, no timers). `src/server/index.ts` stays the local and Node-host entry: it imports the app, adds `express.static` and the SPA fallback, listens, and starts the in-process sync, so `npm start` and the W-03 behaviour keep working.
  - Vercel entry: `api/index.ts` default-exports the app. `vercel.json` sends `/api/*` to it, builds the SPA with `npm run build` into `dist/` (served by the CDN), includes `config/**` in the function bundle (`loadPlayers` reads `config/players.yaml` from the working directory), and defines the cron.
  - Cron: `GET /api/cron/sync`, scheduled `0 12 * * *` (once a day; Hobby fires it any time from 12:00 to 12:59 UTC). It answers 401 unless `CRON_SECRET` is set and the request carries `Authorization: Bearer <CRON_SECRET>` (fails closed when the variable is missing). It awaits `runSyncCycle(await loadPlayers())` and returns 200 `{ ok: true, durationMs }`, or 500 `{ ok: false }` with the error recorded in sync status. No timer runs on Vercel.
  - The sync is upserts, so a duplicate delivery is safe. An overlap guard skips a run when an attempt started under 10 minutes ago (200 `{ ok: true, skipped: true }`).
  - No `maxDuration` override: the Hobby default and maximum is 300 s and the sync takes about 25 s.
  - `/api` 500 responses stop returning `String(err)` (the site is now public); the error is logged instead.
- **Alternatives:** Vercel's zero-config Express preset (`express.static` is ignored, so the SPA would have to be built into `public/`); an external scheduler calling the route (a second service); keeping `setInterval` (never fires on serverless).
- **Consequences:** H-05 cannot fully prove the config without a Vercel login; H-06 verifies it on a real deploy. A missed or doubled cron run is possible (Hobby cron is best-effort); D-037 makes a missed run visible.

## D-037 — Sync status lives in the database (supersedes where D-032 keeps it)
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-03
- **Context:** D-032 kept sync status in memory because the server ran every sync itself. On Vercel the cron run and each `/api/sync-status` request are different function instances, so an in-memory record would always read "never ran" and the banner would never clear.
- **Decision:**
  - A one-row `SyncStatus` table (`id` always 1) holds `lastAttemptAt`, `lastSuccessAt`, `lastError`. The functions in `src/jobs/syncStatus.ts` become async and read and write it.
  - `scheduled` is true when `process.env.VERCEL` is set (the cron is the schedule) or when the in-process timer has started; that part stays per process.
  - `ok` is also false when `lastSuccessAt` is missing or more than 48 hours old, so a cron that never fires shows the banner.
  - `lastError` is capped at 300 characters before it is stored, because the status endpoint is now public. The full error goes to the function logs.
  - The response shape of `GET /api/sync-status` does not change, so the SPA does not change.
- **Alternatives:** Keep it in memory (wrong on serverless); show the Vercel cron log instead (the SPA cannot see it).
- **Consequences:** An empty database right after first deploy shows the banner until the first sync succeeds. That is accurate.

## D-038 — A failed sync or config load retries by itself; no manual trigger
- **Date:** 2026-11-13
- **Status:** ACCEPTED (pending PM review; implemented on feature/sync-retry, QA finding 3 of t_9ca4f6f7, kanban t_2a921614)
- **Cards:** t_2a921614
- **Context:** After a bad `players.yaml` at boot or a failed upstream sync, recovery needed a restart or the next 24h tick. D-031 said a config load failure schedules nothing and "fixing the YAML needs a restart". QA confirmed that restoring the config or network on a running server recovered nothing. The app is a read-only dashboard (AGENTS.md), so a write endpoint is a poor fit.
- **Decision:**
  - Every attempt re-reads `config/players.yaml`, then runs the sync cycle. Boot, the 24h tick and retries all use the same path (`startNightlySync` in `src/jobs/syncCycle.ts`).
  - After a failed attempt (config load or sync) the next attempt is in 15 min, then 30 min, then 60 min, and every 60 min after that, until one succeeds. Then the 24h cadence resumes. Worst-case time to recover once the cause is fixed: 60 min; typically 15.
  - Attempts are chained with `setTimeout` after each run finishes, so they never overlap.
  - A config load failure no longer sets `scheduled: false`: a retry is always pending, so `scheduled` stays `true` and the banner reads "The last data sync failed." with the YAML error. `scheduled: false` is now only the pre-boot state.
  - No `POST /api/sync` and no new endpoint. `npm run sync` stays the manual way to force a sync from the CLI, but it runs in another process and does not update a running server's status (D-032).
- **Alternatives:** `POST /api/sync` (breaks the read-only constraint, needs an auth story, and the app is unauthenticated); a fixed 15 min retry (up to 96 Retrosheet downloads a day during a long outage, hence the cap at 1 h); a file watcher on `players.yaml` (more moving parts, doesn't help network failures); a CLI that signals the running server (needs IPC, not worth it for one owner).
- **Consequences:** Supersedes the "no sync is scheduled / needs a restart" part of D-031. A changed `players.yaml` is also picked up at the next daily tick without a restart (side effect of re-reading each attempt). A persistent failure (for example a player that always errors) now retries hourly forever; the status API and banner show it. If a manual trigger is wanted later, add it as a CLI command, not an HTTP route. The in-process retry applies only to the local long-running server. It does not carry over to the serverless deployment (D-036, D-037), where sync runs as a Vercel cron route and no timer survives between invocations; the H-cards need their own retry story (the cron cadence, for example a more frequent schedule plus the overlap guard).

## D-039 — With status in the database, a CLI sync updates it; the banner names a stale sync
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-03
- **Context:** D-037 moved the sync status into the `SyncStatus` row. Two side effects follow that D-037 did not spell out.
- **Decision:**
  - `npm run sync` runs `runSyncCycle`, which writes the same row, so a CLI sync now updates the status that a running server or the deployed site reports. This replaces the last clause of D-038 ("does not update a running server's status"). It does not set `scheduled`, which stays per process.
  - `ok` is false when the last success is missing or 48 hours old even with no error, so the banner can show with `lastError` null. `SyncBanner` then reads "The data sync has not succeeded recently." instead of "The last data sync failed." (one copy tweak in `src/App.tsx`; the response shape and the component's logic are otherwise unchanged).
  - A status write that fails is logged (`Could not record sync status:`) and swallowed; a status read that fails returns a 500 with a generic body and logs the error.
- **Alternatives:** Keep the CLI out of the status (it would then disagree with the data it just refreshed); leave the "failed" copy (wrong when nothing failed, the cron simply did not run).
- **Consequences:** `markSyncFailure` logs the full error, and callers (`startNightlySync`, `runSync.ts`) also log it, so a failed sync appears twice in the logs.

## D-040 — Cron route details: digest compare, a failed attempt also arms the overlap guard
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-04
- **Context:** D-036 fixed the route's contract. Building it left a few details open.
- **Decision:**
  - The `Authorization` header is compared by SHA-256 digest with `crypto.timingSafeEqual`, so the buffers are always the same length and neither the secret's length nor a matching prefix leaks. An unset or empty `CRON_SECRET` is always 401.
  - The overlap guard reads `lastAttemptAt`, which `markSyncAttempt` and `markSyncFailure` both set. So a failed run (including a failed `loadPlayers`) also blocks a second call for 10 minutes, and that call answers `{ ok: true, skipped: true }`. A retry after a failure is therefore the next cron tick or a call after 10 minutes, not an immediate redelivery. A `lastAttemptAt` in the future (clock skew) does not count as recent.
  - If the status read for the guard fails, the route answers 500 `{ ok: false }` and does not sync; it cannot tell whether a sync is running.
  - `/api/cron` is mounted before `/api` in `src/app.ts`; `src/server/index.ts` adds static files and the `*` fallback after both, so `POST /api/cron/sync` is a 404 and never reaches the SPA fallback.
- **Alternatives:** `===` on the strings (timing leak); syncing anyway when the guard's read fails (could double-run).
- **Consequences:** Supersedes nothing. D-038's retry story for serverless still needs its own card.
- **Addendum (file-name clash):** `src/app.ts` and the SPA's `src/App.tsx` differ only in case and extension. On a case-insensitive disk (macOS default), the extensionless `./App` import in `src/main.tsx` resolved to `app.ts`, which broke `tsc` and `vite build`. `main.tsx` now imports `./App.tsx` with the extension, and `tsconfig.json` sets `allowImportingTsExtensions` (valid with `noEmit`). The Express module keeps the name `src/app.ts` that D-036 and H-05 use. Do not add another extensionless `./App` or `./app` import under `src/`.

## D-041 — Vercel config for the function and the cron: what is checked offline, what only a deploy proves
- **Date:** 2026-11-13
- **Status:** ACCEPTED
- **Cards:** H-05 (config), H-06 (deploy and the open items below)
- **Context:** D-036 fixed the shape. H-05 writes the config, and it can run no real Vercel build without a login.
- **Decision:**
  - `api/index.ts` is `import { app } from "../src/app"; export default app;`, with no other code.
  - `vercel.json` has `$schema`, `buildCommand: npm run build`, `outputDirectory: dist`, a rewrite of `/api/(.*)` to `/api`, `functions["api/index.ts"].includeFiles = "config/**"` (no `maxDuration`, so the Hobby default of 300 s applies), and `crons` with `/api/cron/sync` on `0 12 * * *`.
  - `tsconfig.json` includes `api` as well as `src`, so `tsc --noEmit` checks the entry.
  - `.vercelignore` leaves out `node_modules/`, `data/`, `.worktrees/`, `.claude/`, `bin/`, `docker/`, `dist/`, `.vercel/`, `.git/`, `*.db` and the `.env` files. The source tree is about 0.2 MB, far under the 250 MB limit. `.gitignore` adds `.vercel/`.
  - `loadPlayers` is unchanged and still reads `config/players.yaml` from `process.cwd()`. `includeFiles` puts the file in the bundle.
- **Verified offline (2026-11-13):**
  - `npx tsc --noEmit` passes with `api` included. `npm test` passes 91/91 (86 before, plus 5 in `src/vercelEntry.test.ts`, which imports `api/index` and checks `/api/players`, `/api/sync-status` and `/api/cron/sync` with and without the secret).
  - The cron is `0 12 * * *`: fixed minute and hour, every other field `*`, so once a day.
  - Every key in `vercel.json` exists in Vercel's published schema (`https://openapi.vercel.sh/vercel.json`) with a matching type. Schema validation with ajv does not work: ajv rejects the published draft-04 schema itself, so the keys were checked by script instead.
  - The import graph of `api/index.ts`, compiled to CommonJS, loads under `node` with `DATABASE_URL` set. The default export is a function. Loading starts no timer and no listener.
- **Not verified; H-06 must check on the deployed URL:**
  - `npx vercel build` needs a login (`login_required`) and cannot run offline. Owner-supervised H-06 run only; no `vercel login` by agents.
  - **Rewrite path:** `/api/(.*)` to `/api` may or may not keep the original path in `req.url` for the Express app. If `GET /api/players` returns 404 or the wrong route, change the rewrite or the routing, not the app.
  - **cwd:** whether the function's `process.cwd()` contains `config/players.yaml`. If the first sync fails with ENOENT, make `loadPlayers` resolve from the module location and keep its tests green (D-036).
  - **Prisma engine:** the engine must match Vercel's Linux runtime. Git-based builds run `prisma generate` on Vercel and should pick it up. A prebuilt deploy from macOS (`vercel build` or `deploy --prebuilt` run locally) would ship the Darwin engine and must not be used. Add `binaryTargets` in `schema.prisma` only if the runtime reports a missing engine.
  - Whether nft tracing includes the Prisma engine file in the function bundle.
- **Alternatives:** a `maxDuration` of 300 (the default already is); a cron more often than daily (rejected by Hobby, D-036); running `prisma migrate deploy` in the build (D-034 forbids it).
- **Consequences:** `vercel.json` is the single place for cron and function settings. Changing the schedule means editing it and redeploying.
