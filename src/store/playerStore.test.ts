import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma";
import { setContractExpiry, upsertPlayer } from "./playerStore";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("upsertPlayer", () => {
  it("keeps status and contract expiry when stats are re-synced", async () => {
    const created = await upsertPlayer({ mlbId: 1, name: "Test Player", position: "SS", war: 1 });
    await prisma.player.update({ where: { id: created.id }, data: { status: "signed" } });
    await setContractExpiry(created.id, 2026);

    await upsertPlayer({ mlbId: 1, name: "Test Player", position: "SS", war: 2.5 });

    const after = await prisma.player.findUniqueOrThrow({ where: { id: created.id } });
    expect(after).toMatchObject({ status: "signed", contractExpiry: 2026, war: 2.5 });
  });
});
