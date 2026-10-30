import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../db/prisma";
import { parseRegister } from "./playerIds";
import { runStatsSync, seasonStats } from "./statsSync";

const battingHeader = "gid,id,team,stattype,b_pa,b_ab,b_h,b_d,b_t,b_hr,b_sf,b_hbp,b_w,gametype";
const pitchingHeader = "gid,id,team,stattype,p_ipouts,p_er,p_h,p_w,p_hbp,p_hr,p_k,gametype";

// Hitter traded mid-season (two teams) plus a postseason game that must not count.
const batting = [
  battingHeader,
  "G1,hitr001,NYA,value,5,4,2,1,0,1,0,0,1,regular",
  "G2,hitr001,SDN,value,5,5,1,0,1,0,1,1,0,regular",
  "G3,hitr001,SDN,value,4,4,4,0,0,4,0,0,0,worldseries",
].join("\n");

const pitching = [
  pitchingHeader,
  "G1,pitc001,LAN,value,17,2,5,1,0,1,7,regular",
  "G2,pitc001,LAN,value,10,1,3,2,1,0,4,regular",
].join("\n");

describe("seasonStats", () => {
  it("sums regular-season games across teams and derives rate stats", () => {
    const stats = seasonStats(batting, pitching, new Set(["hitr001", "pitc001"]));

    // H 3, BB 1, HBP 1, AB 9, SF 1; TB = 3 + 1 (2B) + 2 (3B) + 3 (HR)
    const h = stats.get("hitr001")!;
    expect(h.obp).toBeCloseTo(5 / 12);
    expect(h.slg).toBeCloseTo(9 / 9);
    expect(h.era).toBeNull();

    // 27 outs = 9 IP; ER 3, H 8, BB 3, HBP 1, HR 1, K 11
    const p = stats.get("pitc001")!;
    expect(p.ip).toBe(9);
    expect(p.era).toBeCloseTo(3);
    expect(p.whip).toBeCloseTo(11 / 9);
    expect(p.k9).toBeCloseTo(11);
    expect(p.fip).toBeCloseTo((13 * 1 + 3 * 4 - 2 * 11) / 9 + 3.1);
    expect(p.obp).toBeNull();
  });

  it("writes partial innings in baseball notation", () => {
    const one = [pitchingHeader, "G1,pitc001,LAN,value,128,0,0,0,0,0,0,regular"].join("\n");
    expect(seasonStats(battingHeader, one, new Set(["pitc001"])).get("pitc001")!.ip).toBe(42.2);
  });
});

describe("parseRegister", () => {
  it("handles quoted fields and maps MLB ids to Retrosheet ids and birth dates", () => {
    const csv = [
      "key_person,key_mlbam,key_retro,name_first,birth_year,birth_month,birth_day",
      'x1,,"tejada000jr,",Pedro,,,',
      "x2,665742,sotoj001,Juan,1998,10,25",
      "x3,999,nobd001,No Birthday,,,",
    ].join("\n");
    const ids = parseRegister(csv, new Set([665742, 999]));
    expect(ids.get(665742)).toEqual({ retroId: "sotoj001", birthDate: new Date(Date.UTC(1998, 9, 25)) });
    expect(ids.get(999)).toEqual({ retroId: "nobd001", birthDate: null });
  });
});

describe("runStatsSync", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await prisma.player.deleteMany();
  });

  it("uses the latest published Retrosheet season and caches Chadwick ids", async () => {
    const zip = zipSync({
      "2025batting.csv": strToU8([battingHeader, "G1,sotoj001,NYN,value,4,3,1,0,0,1,0,0,1,regular"].join("\n")),
      "2025pitching.csv": strToU8(pitchingHeader),
    });
    const register = "key_mlbam,key_retro,birth_year,birth_month,birth_day\n665742,sotoj001,1998,10,25\n";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("chadwickbureau")) return new Response(register);
      if (url.endsWith("/2025/2025csvs.zip")) return new Response(zip);
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const soto = [{ name: "Juan Soto", position: "OF", mlb_id: 665742 }];
    const today = new Date("2026-10-29T12:00:00Z");
    await runStatsSync(soto, today);

    const row = await prisma.player.findUniqueOrThrow({ where: { mlbId: 665742 } });
    expect(row).toMatchObject({ retroId: "sotoj001", age: 28, season: 2025 });
    expect(row.obp).toBeCloseTo(2 / 4);
    expect(row.slg).toBeCloseTo(4 / 3);
    expect(fetchMock.mock.calls.map(([u]) => u)).toContain("https://www.retrosheet.org/downloads/2026/2026csvs.zip");

    fetchMock.mockClear();
    await runStatsSync(soto, today);
    expect(fetchMock.mock.calls.some(([u]) => u.includes("chadwickbureau"))).toBe(false);
  });

  it("keeps hitting stats for hitters and pitching stats for pitchers", async () => {
    const zip = zipSync({
      "2025batting.csv": strToU8(
        [battingHeader, "G1,bauej001,MIL,value,4,4,1,0,0,0,0,0,0,regular", "G2,roget003,BAL,value,2,2,0,0,0,0,0,0,0,regular"].join("\n"),
      ),
      "2025pitching.csv": strToU8(
        [pitchingHeader, "G1,bauej001,MIL,value,3,1,2,0,0,0,0,regular", "G2,roget003,BAL,value,18,2,4,1,0,0,6,regular"].join("\n"),
      ),
    });
    const register = "key_mlbam,key_retro,birth_year,birth_month,birth_day\n641343,bauej001,1995,10,6\n669432,roget003,1997,11,13\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("chadwickbureau")) return new Response(register);
        if (url.endsWith("/2025/2025csvs.zip")) return new Response(zip);
        return new Response("not found", { status: 404 });
      }),
    );

    await runStatsSync(
      [
        { name: "Jake Bauers", position: "1B", mlb_id: 641343 },
        { name: "Trevor Rogers", position: "SP", mlb_id: 669432 },
      ],
      new Date("2026-10-29T12:00:00Z"),
    );

    const hitter = await prisma.player.findUniqueOrThrow({ where: { mlbId: 641343 } });
    expect(hitter.ops).not.toBeNull();
    expect(hitter).toMatchObject({ era: null, ip: null });
    const pitcher = await prisma.player.findUniqueOrThrow({ where: { mlbId: 669432 } });
    expect(pitcher.ip).toBe(6);
    expect(pitcher).toMatchObject({ obp: null, ops: null });
  });
});
