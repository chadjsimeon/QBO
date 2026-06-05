import session from "express-session";
import pgSession from "connect-pg-simple";

declare module "express-session" {
  interface SessionData {
    userId: string;
    email: string;
    name: string | null;
    organizationId: string;
    organizationName: string;
    role: string;
  }
}

const isProd = process.env.NODE_ENV === "production";

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required in production");
}

const PgStore = pgSession(session);

export const sessionMiddleware = session({
  store: new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: true,
    ttl: 7 * 24 * 60 * 60,
  }),
  secret: process.env.SESSION_SECRET || "ledgerly-dev-secret-do-not-use-in-prod",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

export function requireAuth(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
