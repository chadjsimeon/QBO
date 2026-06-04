import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, users, orgMemberships, organizations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user?.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [membership] = await db.select({
    id: orgMemberships.id,
    organizationId: orgMemberships.organizationId,
    role: orgMemberships.role,
    orgName: organizations.name,
  })
    .from(orgMemberships)
    .innerJoin(organizations, eq(orgMemberships.organizationId, organizations.id))
    .where(eq(orgMemberships.userId, user.id))
    .limit(1);

  if (!membership) {
    res.status(401).json({ error: "No organization membership" });
    return;
  }

  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.name = user.name;
  req.session.organizationId = membership.organizationId;
  req.session.organizationName = membership.orgName;
  req.session.role = membership.role;

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    organizationId: membership.organizationId,
    organizationName: membership.orgName,
    role: membership.role,
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({
    id: req.session.userId,
    email: req.session.email,
    name: req.session.name,
    organizationId: req.session.organizationId,
    organizationName: req.session.organizationName,
    role: req.session.role,
  });
});

export default router;
