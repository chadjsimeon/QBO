import { describe, it, expect } from "vitest";
import supertest from "supertest";
import app from "../src/app";

describe("auth", () => {
  it("registers, logs in, reads /me, logs out", async () => {
    const agent = supertest.agent(app);
    const email = `auth-${Date.now()}@test.local`;

    await agent
      .post("/api/auth/register")
      .send({ name: "A", email, password: "password123", companyName: "AuthCo" })
      .expect(201);

    const login = await agent
      .post("/api/auth/login")
      .send({ email, password: "password123" })
      .expect(200);
    expect(login.body.organizationId).toBeTruthy();

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.email).toBe(email);

    await agent.post("/api/auth/logout").expect(200);
    await agent.get("/api/auth/me").expect(401);
  });

  it("rejects a wrong password with 401", async () => {
    const agent = supertest.agent(app);
    const email = `auth-wrong-${Date.now()}@test.local`;
    await agent
      .post("/api/auth/register")
      .send({ name: "A", email, password: "password123", companyName: "AuthCo" })
      .expect(201);
    await agent.post("/api/auth/login").send({ email, password: "not-the-password" }).expect(401);
  });

  it("rejects a duplicate email with 409", async () => {
    const agent = supertest.agent(app);
    const email = `auth-dup-${Date.now()}@test.local`;
    const body = { name: "A", email, password: "password123", companyName: "AuthCo" };
    await agent.post("/api/auth/register").send(body).expect(201);
    await agent.post("/api/auth/register").send(body).expect(409);
  });

  it("rejects short passwords with 400", async () => {
    await supertest(app)
      .post("/api/auth/register")
      .send({
        name: "A",
        email: `short-${Date.now()}@test.local`,
        password: "short",
        companyName: "X",
      })
      .expect(400);
  });

  it("returns JSON 401 for unauthenticated API access", async () => {
    const res = await supertest(app).get("/api/invoices").expect(401);
    expect(res.body.error).toBeTruthy();
  });

  it("returns JSON 400 for malformed JSON bodies", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json")
      .expect(400);
    expect(res.body.error).toBe("Malformed JSON body");
  });
});
