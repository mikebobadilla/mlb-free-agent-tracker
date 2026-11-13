import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./index";
import { upsertPlayer } from "../store/playerStore";
import { markSyncFailure, markSyncScheduled, resetSyncStatus } from "../jobs/syncStatus";

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
    resetSyncStatus();
    markSyncScheduled(true);
    markSyncFailure(new Error("Retrosheet down"));
    const res = await request(app).get("/api/sync-status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scheduled: true, lastError: "Retrosheet down", lastSuccessAt: null, ok: false });
    expect(typeof res.body.lastAttemptAt).toBe("string");
  });
});
