import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Same mocks as src/app.test.ts: the three sync steps and loadPlayers never touch the network or
// players.yaml. The database is the test schema (setupDb.ts), so the status and players routes run for real.
vi.mock("./config/loadPlayers", () => ({ loadPlayers: vi.fn(async () => [{ name: "A", position: "SP", mlb_id: 1 }]) }));
vi.mock("./jobs/statsSync", () => ({ runStatsSync: vi.fn(async () => {}) }));
vi.mock("./jobs/curatedContracts", () => ({ syncCuratedContracts: vi.fn(async () => {}) }));
vi.mock("./jobs/contractWatcher", () => ({ runContractWatch: vi.fn(async () => {}) }));

import handler from "../api/index";
import { app } from "./app";
import { runStatsSync } from "./jobs/statsSync";
import { resetSyncStatus } from "./jobs/syncStatus";

// The Vercel function is the Express app itself (D-036): it is the default export of api/index.ts.
// These tests run the function entry the way Vercel would call it, through supertest.
const SECRET = "vercel-entry-test-secret";

describe("api/index.ts (Vercel function entry)", () => {
  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CRON_SECRET = SECRET;
    await resetSyncStatus();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(runStatsSync).mockClear();
    delete process.env.CRON_SECRET;
  });

  it("default-exports the shared Express app and nothing else is needed", () => {
    expect(handler).toBe(app);
  });

  it("GET /api/players answers 200 with a JSON array", async () => {
    const res = await request(handler).get("/api/players");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/sync-status answers 200 with a JSON object", async () => {
    const res = await request(handler).get("/api/sync-status");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(typeof res.body).toBe("object");
  });

  it("GET /api/cron/sync without the secret answers 401 and syncs nothing", async () => {
    const res = await request(handler).get("/api/cron/sync");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(runStatsSync).not.toHaveBeenCalled();
  });

  it("GET /api/cron/sync with the secret runs the sync and answers 200", async () => {
    const res = await request(handler).get("/api/cron/sync").set("Authorization", `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(runStatsSync).toHaveBeenCalledTimes(1);
  });
});
