// End-to-end smoke test for Phase 1 (transactions + error middleware).
// Run against a TEST database only: node scripts/smoke-test.mjs [baseUrl]
const BASE = process.argv[2] || "http://localhost:8000";
let cookie = "";

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function check(label, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  -> " + JSON.stringify(detail)}`);
  if (!cond) process.exitCode = 1;
}

const email = `smoke${Date.now()}@test.com`;

// error middleware
let r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad json" });
check("malformed JSON -> 400 JSON error", r.status === 400 && (await r.json()).error === "Malformed JSON body");

// register + login (register is one transaction)
r = await api("POST", "/auth/register", { name: "Smoke", email, password: "password123", companyName: "SmokeCo" });
check("register 201", r.status === 201, r);
r = await api("POST", "/auth/login", { email, password: "password123" });
check("login 200", r.status === 200, r);

const accts = (await api("GET", "/accounts")).data;
const income = accts.find(a => a.code === "4100");
const checking = accts.find(a => a.code === "1010");
check("seed chart of accounts present", !!income && !!checking && accts.length >= 26, accts.length);

// unbalanced manual JE -> 400 (postEntry validation), not 500/orphan
r = await api("POST", "/journal-entries", { date: "2026-06-01", lines: [
  { accountId: checking.id, debitCents: 500 }, { accountId: income.id, creditCents: 300 }] });
check("unbalanced JE rejected 400", r.status === 400, r);

// invoice -> issue -> bank match -> undo
const cust = (await api("POST", "/customers", { name: "Acme" })).data;
r = await api("POST", "/invoices", { contactId: cust.id, number: "INV-1", issueDate: "2026-06-01", dueDate: "2026-07-01",
  lines: [{ description: "Work", quantity: 1, unitPriceCents: 10000, accountId: income.id }] });
check("create invoice 201", r.status === 201, r);
const invId = r.data.id;
r = await api("POST", `/invoices/${invId}/issue`);
check("issue invoice 200", r.status === 200 && r.data.status === "SENT", r);

const ba = (await api("POST", "/bank-accounts/ensure", { accountId: checking.id })).data;
await api("POST", `/bank-accounts/${ba.id}/transactions`, { csv: "2026-06-05,ACME PAYMENT,100.00" });
const txns = (await api("GET", `/bank-accounts/${ba.id}/transactions?status=FOR_REVIEW`)).data;
check("txn imported", txns.length === 1, txns);

r = await api("POST", `/bank-transactions/${txns[0].id}/match`, { kind: "invoice", documentId: invId });
check("match 200 CATEGORIZED", r.status === 200 && r.data.status === "CATEGORIZED", r);
r = await api("GET", `/invoices/${invId}`);
check("invoice PAID, balance 0", r.data.status === "PAID" && r.data.balanceCents === 0, r.data);

// double-match guard
r = await api("POST", `/bank-transactions/${txns[0].id}/match`, { kind: "invoice", documentId: invId });
check("re-match rejected 409", r.status === 409, r);

r = await api("POST", `/bank-transactions/${txns[0].id}/undo`);
check("undo 200 FOR_REVIEW", r.status === 200 && r.data.status === "FOR_REVIEW", r);
r = await api("GET", `/invoices/${invId}`);
check("balance restored after undo", r.data.status === "SENT" && r.data.balanceCents === 10000, r.data);

console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED");
