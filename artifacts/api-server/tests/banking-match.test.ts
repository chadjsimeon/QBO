import { describe, it, expect, beforeAll } from "vitest";
import { createTestOrg, type TestOrg } from "./helpers";

async function createIssuedInvoice(org: TestOrg, number: string, cents: number) {
  const revenue = org.accounts.get("4100")!.id;
  const cust = (
    await org.agent
      .post("/api/customers")
      .send({ name: `Cust ${number}` })
      .expect(201)
  ).body;
  const inv = (
    await org.agent
      .post("/api/invoices")
      .send({
        contactId: cust.id,
        number,
        issueDate: "2026-06-01",
        dueDate: "2026-07-01",
        lines: [{ description: "Work", quantity: 1, unitPriceCents: cents, accountId: revenue }],
      })
      .expect(201)
  ).body;
  await org.agent.post(`/api/invoices/${inv.id}/issue`).expect(200);
  return inv;
}

async function importTxn(org: TestOrg, bankAccountId: string, csvLine: string) {
  await org.agent
    .post(`/api/bank-accounts/${bankAccountId}/transactions`)
    .send({ csv: csvLine })
    .expect(200);
  const txns = (
    await org.agent
      .get(`/api/bank-accounts/${bankAccountId}/transactions?status=FOR_REVIEW`)
      .expect(200)
  ).body;
  return txns[txns.length - 1];
}

describe("bank transaction match", () => {
  let org: TestOrg;
  let bankAccountId: string;

  beforeAll(async () => {
    org = await createTestOrg("banking");
    const checking = org.accounts.get("1010")!.id;
    bankAccountId = (
      await org.agent.post("/api/bank-accounts/ensure").send({ accountId: checking }).expect(200)
    ).body.id;
  });

  it("pays an invoice down to PAID on an exact match", async () => {
    const inv = await createIssuedInvoice(org, "INV-100", 10000);
    const txn = await importTxn(org, bankAccountId, "2026-06-05,FULL PAYMENT,100.00");

    const matched = (
      await org.agent
        .post(`/api/bank-transactions/${txn.id}/match`)
        .send({ kind: "invoice", documentId: inv.id })
        .expect(200)
    ).body;
    expect(matched.status).toBe("CATEGORIZED");
    expect(matched.journalEntryId).toBeTruthy();

    const after = (await org.agent.get(`/api/invoices/${inv.id}`).expect(200)).body;
    expect(after.status).toBe("PAID");
    expect(after.balanceCents).toBe(0);
  });

  it("marks a partial match PARTIAL", async () => {
    const inv = await createIssuedInvoice(org, "INV-101", 10000);
    const txn = await importTxn(org, bankAccountId, "2026-06-06,PART PAYMENT,40.00");

    await org.agent
      .post(`/api/bank-transactions/${txn.id}/match`)
      .send({ kind: "invoice", documentId: inv.id })
      .expect(200);

    const after = (await org.agent.get(`/api/invoices/${inv.id}`).expect(200)).body;
    expect(after.status).toBe("PARTIAL");
    expect(after.balanceCents).toBe(6000);
  });

  it("rejects matching against an already-paid invoice with 409 and posts nothing", async () => {
    const inv = await createIssuedInvoice(org, "INV-102", 5000);
    const t1 = await importTxn(org, bankAccountId, "2026-06-07,PAY ONE,50.00");
    await org.agent
      .post(`/api/bank-transactions/${t1.id}/match`)
      .send({ kind: "invoice", documentId: inv.id })
      .expect(200);

    const t2 = await importTxn(org, bankAccountId, "2026-06-08,PAY TWICE,50.00");
    await org.agent
      .post(`/api/bank-transactions/${t2.id}/match`)
      .send({ kind: "invoice", documentId: inv.id })
      .expect(409);

    const after = (await org.agent.get(`/api/invoices/${inv.id}`).expect(200)).body;
    expect(after.balanceCents).toBe(0); // not driven negative
  });

  it("rejects an over-balance match with 409", async () => {
    const inv = await createIssuedInvoice(org, "INV-103", 3000);
    const txn = await importTxn(org, bankAccountId, "2026-06-09,TOO BIG,50.00");
    await org.agent
      .post(`/api/bank-transactions/${txn.id}/match`)
      .send({ kind: "invoice", documentId: inv.id })
      .expect(409);
  });

  it("undo restores the invoice balance and reopens the transaction", async () => {
    const inv = await createIssuedInvoice(org, "INV-104", 8000);
    const txn = await importTxn(org, bankAccountId, "2026-06-10,UNDO ME,80.00");
    await org.agent
      .post(`/api/bank-transactions/${txn.id}/match`)
      .send({ kind: "invoice", documentId: inv.id })
      .expect(200);

    const undone = (await org.agent.post(`/api/bank-transactions/${txn.id}/undo`).expect(200)).body;
    expect(undone.status).toBe("FOR_REVIEW");
    expect(undone.journalEntryId).toBeNull();

    const after = (await org.agent.get(`/api/invoices/${inv.id}`).expect(200)).body;
    expect(after.status).toBe("SENT");
    expect(after.balanceCents).toBe(8000);
  });

  it("categorize posts to the ledger and undo reverses it", async () => {
    const fees = org.accounts.get("5900")!.id;
    const txn = await importTxn(org, bankAccountId, "2026-06-11,BANK FEE,-12.50");

    const cat = (
      await org.agent
        .post(`/api/bank-transactions/${txn.id}/categorize`)
        .send({ accountId: fees })
        .expect(200)
    ).body;
    expect(cat.status).toBe("CATEGORIZED");
    expect(cat.journalEntryId).toBeTruthy();

    await org.agent.post(`/api/bank-transactions/${txn.id}/undo`).expect(200);
    const list = (
      await org.agent
        .get(`/api/bank-accounts/${bankAccountId}/transactions?status=FOR_REVIEW`)
        .expect(200)
    ).body;
    expect(list.some((t: { id: string }) => t.id === txn.id)).toBe(true);
  });
});
