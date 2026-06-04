import session from "express-session";

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

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "ledgerly-dev-secret-change-in-prod",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
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
