import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./index";

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
});
