import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The three sync steps are mocked so the real runSyncCycle (and its status recording) runs
// without network or file I/O; loadPlayers is mocked so the route never reads players.yaml.
vi.mock("./config/loadPlayers", () => ({ loadPlayers: vi.fn(async () => [{ name: "A", position: "SP", mlb_id: 1 }]) }));
vi.mock("./jobs/statsSync", () => ({ runStatsSync: vi.fn(async () => {}) }));
vi.mock("./jobs/curatedContracts", () => ({ syncCuratedContracts: vi.fn(async () => {}) }));
vi.mock("./jobs/contractWatcher", () => ({ runContractWatch: vi.fn(async () => {}) }));
vi.mock("./store/playerStore", async (importOriginal) => {
  const real = await importOriginal<typeof import("./store/playerStore")>();
  return { ...real, getDashboardData: vi.fn(real.getDashboardData) };
});

import { app } from "./app";
import { loadPlayers } from "./config/loadPlayers";
import { runStatsSync } from "./jobs/statsSync";
import { runContractWatch } from "./jobs/contractWatcher";
import { getSyncStatus, markSyncAttempt, markSyncSuccess, resetSyncStatus } from "./jobs/syncStatus";
import { getDashboardData } from "./store/playerStore";

const SECRET = "test-secret-value";
const auth = (value: string) => ({ Authorization: value });

describe("GET /api/cron/sync", () => {
  beforeEach(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.CRON_SECRET = SECRET;
    await resetSyncStatus();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(loadPlayers).mockClear();
    vi.mocked(runStatsSync).mockClear();
    delete process.env.CRON_SECRET;
  });

  describe("authorization", () => {
    it("401 with no Authorization header", async () => {
      const res = await request(app).get("/api/cron/sync");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
      expect(runStatsSync).not.toHaveBeenCalled();
    });

    it("401 with the wrong secret, a prefix of it, or no Bearer scheme", async () => {
      for (const header of ["Bearer wrong", `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, SECRET, `bearer ${SECRET}`]) {
        const res = await request(app).get("/api/cron/sync").set(auth(header));
        expect(res.status, header).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized" });
      }
      expect(runStatsSync).not.toHaveBeenCalled();
    });

    it("401 when CRON_SECRET is unset or empty, whatever the header says (fails closed)", async () => {
      for (const value of [undefined, ""]) {
        if (value === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = value;
        for (const header of ["Bearer ", "Bearer undefined", "Bearer", "Bearer null", ""]) {
          const res = await request(app).get("/api/cron/sync").set(auth(header));
          expect(res.status, `${JSON.stringify(value)} / ${JSON.stringify(header)}`).toBe(401);
          expect(res.body).toEqual({ error: "Unauthorized" });
        }
        expect((await request(app).get("/api/cron/sync")).status).toBe(401);
      }
      expect(runStatsSync).not.toHaveBeenCalled();
    });

    it("answers only GET: POST is not routed", async () => {
      const res = await request(app).post("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect([404, 405]).toContain(res.status);
      expect(runStatsSync).not.toHaveBeenCalled();
    });
  });

  describe("running the sync", () => {
    it("awaits the sync before responding, then 200 { ok, durationMs }", async () => {
      const events: string[] = [];
      vi.mocked(runStatsSync).mockImplementationOnce(async () => {
        await new Promise((r) => setTimeout(r, 60));
        events.push("sync finished");
      });
      vi.mocked(runContractWatch).mockImplementationOnce(async () => {
        events.push("last step finished");
      });
      const res = await request(app)
        .get("/api/cron/sync")
        .set(auth(`Bearer ${SECRET}`))
        .then((r) => {
          events.push("response received");
          return r;
        });
      expect(events).toEqual(["sync finished", "last step finished", "response received"]);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["durationMs", "ok"]);
      expect(res.body.ok).toBe(true);
      expect(res.body.durationMs).toBeGreaterThanOrEqual(50);
      // The success is already stored when the response goes out.
      const status = await getSyncStatus();
      expect(status.lastSuccessAt).not.toBeNull();
      expect(status.lastError).toBeNull();
    });

    it("500 { ok: false } with no error text when the sync throws, and the status shows the failure", async () => {
      vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("Retrosheet exploded at db.internal"));
      const res = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ ok: false });
      expect(JSON.stringify(res.body)).not.toContain("Retrosheet");
      expect(console.error).toHaveBeenCalledWith("Cron sync failed:", expect.objectContaining({ message: "Retrosheet exploded at db.internal" }));
      const status = await getSyncStatus();
      expect(status.lastError).toBe("Retrosheet exploded at db.internal");
      expect(status.lastSuccessAt).toBeNull();
      expect(status.ok).toBe(false);
    });

    it("500 { ok: false } and records the failure when loadPlayers fails (D-029 guard)", async () => {
      vi.mocked(loadPlayers).mockRejectedValueOnce(new Error("config/players.yaml: expected a non-empty list"));
      const res = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ ok: false });
      expect(runStatsSync).not.toHaveBeenCalled();
      const status = await getSyncStatus();
      expect(status.lastError).toContain("expected a non-empty list");
      expect(status.lastAttemptAt).not.toBeNull();
    });
  });

  describe("overlap guard", () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

    it("skips when an attempt started 9 minutes ago", async () => {
      await markSyncAttempt(minutesAgo(9));
      const res = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, skipped: true });
      expect(loadPlayers).not.toHaveBeenCalled();
      expect(runStatsSync).not.toHaveBeenCalled();
    });

    it("runs when the last attempt started 11 minutes ago", async () => {
      await markSyncAttempt(minutesAgo(11));
      const res = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.skipped).toBeUndefined();
      expect(runStatsSync).toHaveBeenCalledTimes(1);
    });

    it("runs when nothing was ever recorded", async () => {
      const res = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect(res.body.ok).toBe(true);
      expect(runStatsSync).toHaveBeenCalledTimes(1);
    });

    it("a second delivery right after a run is skipped", async () => {
      const first = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      const second = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect(first.body.durationMs).toBeDefined();
      expect(second.body).toEqual({ ok: true, skipped: true });
      expect(runStatsSync).toHaveBeenCalledTimes(1);
    });

    it("a failed run also blocks an immediate retry for 10 minutes", async () => {
      await markSyncSuccess(minutesAgo(60 * 24));
      vi.mocked(runStatsSync).mockRejectedValueOnce(new Error("boom"));
      const failed = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      const retry = await request(app).get("/api/cron/sync").set(auth(`Bearer ${SECRET}`));
      expect(failed.status).toBe(500);
      expect(retry.body).toEqual({ ok: true, skipped: true });
    });
  });
});

describe("other /api 500 responses", () => {
  it("log the error and return a generic body, never the thrown message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getDashboardData).mockRejectedValue(new Error("password authentication failed for user postgres at db.internal:5432"));
    for (const path of ["/api/players", "/api/players/670970"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(500);
      expect(res.body, path).toEqual({ error: "Internal error" });
      expect(res.text).not.toContain("password");
    }
    expect(consoleError).toHaveBeenCalledTimes(2);
    vi.mocked(getDashboardData).mockReset();
    consoleError.mockRestore();
  });
});

describe("importing src/app.ts", () => {
  it("starts no server, no timer, and loads no config", async () => {
    vi.resetModules();
    const express = (await import("express")).default;
    const listen = vi.spyOn(express.application, "listen");
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    vi.mocked(loadPlayers).mockClear();
    try {
      const mod = await import("./app");
      expect(typeof mod.app).toBe("function");
      expect(listen).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(loadPlayers).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      listen.mockRestore();
      setIntervalSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });

  it("serves no static files or SPA fallback: unknown paths are 404, not index.html", async () => {
    const res = await request(app).get("/some/spa/path");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("<div id=\"root\"");
  });
});
