import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, users, orgMemberships, organizations, accounts } from "@workspace/db";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { LoginBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/session";
import { validateBody } from "../lib/validate";

const router = Router();

// Brute-force / enumeration guard on the credential endpoints only.
// Disabled under test so integration suites can register freely.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test" || process.env.RATE_LIMIT_DISABLED === "1",
  message: { error: "Too many attempts, please try again later" },
});

router.post("/auth/login", authLimiter, validateBody(LoginBody), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

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

  const [membership] = await db
    .select({
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

router.post("/auth/register", authLimiter, async (req, res) => {
  const { name, email, password, companyName } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    companyName?: string;
  };
  if (!name || !email || !password || !companyName) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // User, org, membership, and the seed chart of accounts must land together —
  // a partial failure would strand a user who can log in but has no org/accounts.
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: email.toLowerCase(),
        name: name.trim(),
        passwordHash,
      })
      .returning();

    const [org] = await tx
      .insert(organizations)
      .values({
        name: companyName.trim(),
      })
      .returning();

    await tx.insert(orgMemberships).values({
      userId: user.id,
      organizationId: org.id,
      role: "OWNER",
    });

    await tx.insert(accounts).values([
      {
        organizationId: org.id,
        code: "1000",
        name: "Assets",
        type: "ASSET",
        subtype: "header",
        sortOrder: 100,
      },
      {
        organizationId: org.id,
        code: "1010",
        name: "Checking Account",
        type: "ASSET",
        subtype: "bank",
        sortOrder: 110,
        systemRole: "CASH" as const,
      },
      {
        organizationId: org.id,
        code: "1020",
        name: "Savings Account",
        type: "ASSET",
        subtype: "bank",
        sortOrder: 120,
      },
      {
        organizationId: org.id,
        code: "1100",
        name: "Accounts Receivable",
        type: "ASSET",
        subtype: "receivable",
        sortOrder: 130,
        systemRole: "AR" as const,
      },
      {
        organizationId: org.id,
        code: "1200",
        name: "Inventory",
        type: "ASSET",
        subtype: "inventory",
        sortOrder: 140,
      },
      {
        organizationId: org.id,
        code: "2000",
        name: "Liabilities",
        type: "LIABILITY",
        subtype: "header",
        sortOrder: 200,
      },
      {
        organizationId: org.id,
        code: "2010",
        name: "Accounts Payable",
        type: "LIABILITY",
        subtype: "payable",
        sortOrder: 210,
        systemRole: "AP" as const,
      },
      {
        organizationId: org.id,
        code: "2100",
        name: "Sales Tax Payable",
        type: "LIABILITY",
        subtype: "tax",
        sortOrder: 220,
        systemRole: "SALES_TAX_PAYABLE" as const,
      },
      {
        organizationId: org.id,
        code: "2200",
        name: "Business Credit Card",
        type: "LIABILITY",
        subtype: "credit_card",
        sortOrder: 230,
      },
      {
        organizationId: org.id,
        code: "3000",
        name: "Equity",
        type: "EQUITY",
        subtype: "header",
        sortOrder: 300,
      },
      {
        organizationId: org.id,
        code: "3100",
        name: "Owner's Capital",
        type: "EQUITY",
        subtype: "equity",
        sortOrder: 310,
      },
      {
        organizationId: org.id,
        code: "3200",
        name: "Retained Earnings",
        type: "EQUITY",
        subtype: "retained",
        sortOrder: 320,
        systemRole: "RETAINED_EARNINGS" as const,
      },
      {
        organizationId: org.id,
        code: "4000",
        name: "Income",
        type: "INCOME",
        subtype: "header",
        sortOrder: 400,
      },
      {
        organizationId: org.id,
        code: "4100",
        name: "Services Revenue",
        type: "INCOME",
        subtype: "revenue",
        sortOrder: 410,
      },
      {
        organizationId: org.id,
        code: "4200",
        name: "Product Sales",
        type: "INCOME",
        subtype: "revenue",
        sortOrder: 420,
      },
      {
        organizationId: org.id,
        code: "4300",
        name: "Other Income",
        type: "INCOME",
        subtype: "revenue",
        sortOrder: 430,
      },
      {
        organizationId: org.id,
        code: "5000",
        name: "Expenses",
        type: "EXPENSE",
        subtype: "header",
        sortOrder: 500,
      },
      {
        organizationId: org.id,
        code: "5100",
        name: "Cost of Goods Sold",
        type: "EXPENSE",
        subtype: "cogs",
        sortOrder: 510,
      },
      {
        organizationId: org.id,
        code: "5200",
        name: "Payroll",
        type: "EXPENSE",
        subtype: "payroll",
        sortOrder: 520,
      },
      {
        organizationId: org.id,
        code: "5300",
        name: "Rent",
        type: "EXPENSE",
        subtype: "facilities",
        sortOrder: 530,
      },
      {
        organizationId: org.id,
        code: "5400",
        name: "Utilities",
        type: "EXPENSE",
        subtype: "utilities",
        sortOrder: 540,
      },
      {
        organizationId: org.id,
        code: "5500",
        name: "Software & SaaS",
        type: "EXPENSE",
        subtype: "software",
        sortOrder: 550,
      },
      {
        organizationId: org.id,
        code: "5600",
        name: "Travel & Meals",
        type: "EXPENSE",
        subtype: "travel",
        sortOrder: 560,
      },
      {
        organizationId: org.id,
        code: "5700",
        name: "Marketing",
        type: "EXPENSE",
        subtype: "marketing",
        sortOrder: 570,
      },
      {
        organizationId: org.id,
        code: "5800",
        name: "Professional Services",
        type: "EXPENSE",
        subtype: "professional",
        sortOrder: 580,
      },
      {
        organizationId: org.id,
        code: "5900",
        name: "Bank Fees",
        type: "EXPENSE",
        subtype: "bank_fees",
        sortOrder: 590,
      },
    ]);
  });

  res.status(201).json({ ok: true });
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
