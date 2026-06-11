import { describe, it, expect, beforeAll } from "vitest";
import { createTestOrg, type TestOrg } from "./helpers";

describe("request validation", () => {
  let org: TestOrg;

  beforeAll(async () => {
    org = await createTestOrg("validation");
  });

  it("rejects an invoice body with missing fields and reports the issues", async () => {
    const res = await org.agent.post("/api/invoices").send({ number: "X-1" }).expect(400);
    expect(res.body.error).toBe("Invalid request");
    expect(res.body.details.fieldErrors).toHaveProperty("contactId");
    expect(res.body.details.fieldErrors).toHaveProperty("lines");
  });

  it("rejects wrongly-typed line fields", async () => {
    const revenue = org.accounts.get("4100")!.id;
    const res = await org.agent
      .post("/api/invoices")
      .send({
        contactId: "00000000-0000-0000-0000-000000000000",
        number: "X-2",
        issueDate: "2026-06-01",
        dueDate: "2026-07-01",
        lines: [{ description: "Work", quantity: "two", unitPriceCents: 100, accountId: revenue }],
      })
      .expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("rejects a login body without a password", async () => {
    const res = await org.agent.post("/api/auth/login").send({ email: "x@y.z" }).expect(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("rejects a customer without a name", async () => {
    await org.agent.post("/api/customers").send({ email: "a@b.c" }).expect(400);
  });

  it("strips unknown fields instead of persisting them", async () => {
    const res = await org.agent
      .post("/api/customers")
      .send({ name: "Strip Test", organizationId: "evil-org-override" })
      .expect(201);
    expect(res.body.organizationId).toBe(org.organizationId);
  });
});
