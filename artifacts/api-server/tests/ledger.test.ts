import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, journalEntries, journalLines } from "@workspace/db";
import { postEntry } from "../src/lib/ledger";
import { createTestOrg, type TestOrg } from "./helpers";

describe("postEntry", () => {
  let org: TestOrg;
  let cash: string;
  let revenue: string;

  beforeAll(async () => {
    org = await createTestOrg("ledger");
    cash = org.accounts.get("1010")!.id;
    revenue = org.accounts.get("4100")!.id;
  });

  it("posts a balanced entry with header and lines", async () => {
    const entry = await postEntry({
      organizationId: org.organizationId,
      date: new Date("2026-01-15"),
      memo: "test sale",
      sourceType: "MANUAL",
      lines: [
        { accountId: cash, debitCents: 12345, creditCents: 0 },
        { accountId: revenue, debitCents: 0, creditCents: 12345 },
      ],
    });
    expect(entry.id).toBeTruthy();
    const lines = await db.select().from(journalLines).where(eq(journalLines.journalEntryId, entry.id));
    expect(lines).toHaveLength(2);
    const debits = lines.reduce((s, l) => s + l.debitCents, 0);
    const credits = lines.reduce((s, l) => s + l.creditCents, 0);
    expect(debits).toBe(credits);
  });

  it("rejects an unbalanced entry", async () => {
    await expect(
      postEntry({
        organizationId: org.organizationId,
        date: new Date(),
        sourceType: "MANUAL",
        lines: [
          { accountId: cash, debitCents: 500, creditCents: 0 },
          { accountId: revenue, debitCents: 0, creditCents: 300 },
        ],
      }),
    ).rejects.toThrow(/Unbalanced/);
  });

  it("rejects an entry with fewer than 2 non-empty lines", async () => {
    await expect(
      postEntry({
        organizationId: org.organizationId,
        date: new Date(),
        sourceType: "MANUAL",
        lines: [
          { accountId: cash, debitCents: 0, creditCents: 0 },
          { accountId: revenue, debitCents: 0, creditCents: 0 },
        ],
      }),
    ).rejects.toThrow(/>= 2 lines/);
  });

  it("is atomic: a failing lines insert leaves no orphan header", async () => {
    const before = await db.select().from(journalEntries)
      .where(eq(journalEntries.organizationId, org.organizationId));

    // Second line violates the FK on journal_lines.account_id, which fails
    // AFTER the header insert succeeded — the transaction must roll it back.
    await expect(
      postEntry({
        organizationId: org.organizationId,
        date: new Date(),
        memo: "orphan probe",
        sourceType: "MANUAL",
        lines: [
          { accountId: cash, debitCents: 700, creditCents: 0 },
          { accountId: "00000000-0000-0000-0000-000000000000", debitCents: 0, creditCents: 700 },
        ],
      }),
    ).rejects.toThrow();

    const after = await db.select().from(journalEntries)
      .where(eq(journalEntries.organizationId, org.organizationId));
    expect(after.length).toBe(before.length);
  });
});
