import supertest from "supertest";
import app from "../src/app";

export interface TestOrg {
  agent: ReturnType<typeof supertest.agent>;
  email: string;
  organizationId: string;
  /** Seeded chart of accounts, keyed by code (e.g. "1010" checking, "4100" revenue). */
  accounts: Map<string, { id: string; code: string; name: string; type: string }>;
}

let seq = 0;

// Register + log in a fresh org through the real API so each test gets an
// isolated tenant with the seeded chart of accounts and a session cookie.
export async function createTestOrg(label = "org"): Promise<TestOrg> {
  const email = `${label}-${Date.now()}-${seq++}@test.local`;
  const agent = supertest.agent(app);

  await agent
    .post("/api/auth/register")
    .send({ name: "Test User", email, password: "password123", companyName: `Test ${label}` })
    .expect(201);

  const login = await agent
    .post("/api/auth/login")
    .send({ email, password: "password123" })
    .expect(200);

  const res = await agent.get("/api/accounts").expect(200);
  const accounts = new Map(
    (res.body as Array<{ id: string; code: string; name: string; type: string }>).map(a => [a.code, a]),
  );

  return { agent, email, organizationId: login.body.organizationId, accounts };
}
