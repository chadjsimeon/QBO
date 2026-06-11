import { describe, it, expect, beforeAll } from "vitest";
import { createTestOrg, type TestOrg } from "./helpers";

describe("tenant isolation", () => {
  let orgA: TestOrg;
  let orgB: TestOrg;
  let invoiceA: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("tenant-a");
    orgB = await createTestOrg("tenant-b");

    const revenue = orgA.accounts.get("4100")!.id;
    const cust = (await orgA.agent.post("/api/customers").send({ name: "A Customer" }).expect(201)).body;
    invoiceA = (await orgA.agent.post("/api/invoices").send({
      contactId: cust.id,
      number: "A-1",
      issueDate: "2026-06-01",
      dueDate: "2026-07-01",
      lines: [{ description: "Work", quantity: 1, unitPriceCents: 5000, accountId: revenue }],
    }).expect(201)).body;
  });

  it("does not list another org's invoices", async () => {
    const listB = (await orgB.agent.get("/api/invoices").expect(200)).body;
    expect(listB.some((i: { id: string }) => i.id === invoiceA.id)).toBe(false);
  });

  it("404s when fetching another org's invoice by id", async () => {
    await orgB.agent.get(`/api/invoices/${invoiceA.id}`).expect(404);
  });

  it("404s when acting on another org's invoice", async () => {
    await orgB.agent.post(`/api/invoices/${invoiceA.id}/issue`).expect(404);
  });

  it("does not leak accounts across orgs", async () => {
    const accountsB = (await orgB.agent.get("/api/accounts").expect(200)).body;
    const idsA = new Set([...orgA.accounts.values()].map(a => a.id));
    expect(accountsB.every((a: { id: string }) => !idsA.has(a.id))).toBe(true);
  });

  it("rejects journal entries that reference another org's accounts", async () => {
    const cashA = orgA.accounts.get("1010")!.id;
    const revB = orgB.accounts.get("4100")!.id;
    await orgB.agent.post("/api/journal-entries").send({
      date: "2026-06-01",
      lines: [
        { accountId: cashA, debitCents: 100 },
        { accountId: revB, creditCents: 100 },
      ],
    }).expect(400);
  });
});
