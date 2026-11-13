import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Real store, except that a test can make the read fail once.
vi.mock("../store/syncStatusStore", async (importOriginal) => {
  const real = await importOriginal<typeof import("../store/syncStatusStore")>();
  return { ...real, getSyncStatusRow: vi.fn(real.getSyncStatusRow) };
});

import { app } from "./index";
import { upsertPlayer } from "../store/playerStore";
import { getSyncStatusRow } from "../store/syncStatusStore";
import { markSyncAttempt, markSyncFailure, markSyncScheduled, markSyncSuccess, resetSyncStatus } from "../jobs/syncStatus";

describe("API", () => {
  it("GET /api/players returns 200 with an array", async () => {
    const res = await request(app).get("/api/players");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/players/999999999 returns 404 for unknown player", async () => {
    const res = await request(app).get("/api/players/999999999");
    expect(res.status).toBe(404);
  });

  it("GET /api/players/:mlbId looks the player up by MLB ID, not row ID", async () => {
    await upsertPlayer({ mlbId: 670970, name: "Adrian Morejon", position: "RP" });
    const res = await request(app).get("/api/players/670970");
    expect(res.status).toBe(200);
    expect(res.body.player).toMatchObject({ mlbId: 670970, name: "Adrian Morejon" });
  });
});

describe("GET /api/sync-status", () => {
  it("returns the recorded sync state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // markSyncFailure logs the full error
    await resetSyncStatus();
    markSyncScheduled(true);
    await markSyncFailure(new Error("Retrosheet down"));
    const res = await request(app).get("/api/sync-status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scheduled: true, lastError: "Retrosheet down", lastSuccessAt: null, ok: false });
    expect(typeof res.body.lastAttemptAt).toBe("string");
  });

  it("reads what a sync wrote, as ISO strings, in the documented shape", async () => {
    await resetSyncStatus();
    markSyncScheduled(true);
    await markSyncAttempt(new Date("2026-11-13T08:00:00Z"));
    await markSyncSuccess(new Date(Date.now() - 60 * 1000));
    const res = await request(app).get("/api/sync-status");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["lastAttemptAt", "lastError", "lastSuccessAt", "ok", "scheduled"]);
    expect(res.body).toMatchObject({ scheduled: true, lastAttemptAt: "2026-11-13T08:00:00.000Z", lastError: null, ok: true });
    expect(new Date(res.body.lastSuccessAt).toISOString()).toBe(res.body.lastSuccessAt);
  });

  it("returns a generic 500 when the status cannot be read", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getSyncStatusRow).mockRejectedValueOnce(new Error("connection refused at db.internal:5432"));
    const res = await request(app).get("/api/sync-status");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Could not read the sync status" });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
