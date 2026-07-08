import { describe, it, expect, beforeAll } from "vitest";
import { createTestOrg, type TestOrg } from "./helpers";

interface BankAccount {
  id: string;
  accountName: string | null;
  institutionName: string;
  accountId: string;
}

describe("trial balance import — bank account designation", () => {
  let org: TestOrg;

  beforeAll(async () => {
    org = await createTestOrg("tb-import");
    await org.agent
      .post("/api/trial-balance/import/commit")
      .send({
        effectiveDate: "2026-06-01",
        fileName: "tb.csv",
        duplicateStrategy: "balances",
        rows: [
          {
            accountNumber: "1990",
            accountName: "Imported Operating Bank",
            debitCents: 500000,
            creditCents: 0,
            accountType: "ASSET",
            subtype: "bank",
          },
          {
            accountNumber: "1991",
            accountName: "Imported Prepaid Rent",
            debitCents: 100000,
            creditCents: 0,
            accountType: "ASSET",
            subtype: "general",
          },
        ],
      })
      .expect(201);
  });

  it("auto-connects an imported account flagged as a bank subtype", async () => {
    const banks = (await org.agent.get("/api/bank-accounts").expect(200)).body as BankAccount[];
    const imported = banks.find((b) => b.accountName === "Imported Operating Bank");
    expect(imported).toBeTruthy();
    expect(imported!.institutionName).toBe("Imported Operating Bank");
  });

  it("persists the chosen subtype on the created account", async () => {
    const accounts = (await org.agent.get("/api/accounts").expect(200)).body as Array<{
      code: string;
      subtype: string;
    }>;
    expect(accounts.find((a) => a.code === "1990")?.subtype).toBe("bank");
    expect(accounts.find((a) => a.code === "1991")?.subtype).toBe("general");
  });

  it("does not register a non-banking subtype in the Banking tab", async () => {
    const banks = (await org.agent.get("/api/bank-accounts").expect(200)).body as BankAccount[];
    expect(banks.some((b) => b.accountName === "Imported Prepaid Rent")).toBe(false);
  });
});
