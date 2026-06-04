---
name: Ledgerly stack
description: Port layout, proxy config, auth pattern, seed credentials, and key decisions for the Ledgerly accounting app
---

# Ledgerly Stack

## Port layout
- Frontend (Vite+React): PORT=3000, BASE_PATH=/
- API (Express): PORT=5000
- Vite proxies `/api` → `http://localhost:5000` so cookies flow correctly
- External port 80 maps to port 5000 in .replit (original API mapping) — preview sees port 3000 via Replit's per-port preview

## Auth
- Session-based (express-session + bcryptjs), `credentials: "include"` on all fetches
- Session middleware in `artifacts/api-server/src/lib/session.ts`
- CORS: `{ origin: true, credentials: true }` in app.ts
- Seed: owner@acme.test / password123, org "Acme Corp"

## Key decisions
- Removed all Next.js lib files from `artifacts/ledgerly/src/lib/` and `src/app/` — they caused TS errors referencing @prisma/client, next-auth, next/navigation
- Payment direction enum: `RECEIVED` / `SENT` (not INBOUND/OUTBOUND)
- BASE_PATH is required by vite.config.ts; workflow passes `BASE_PATH=/`
- Search route is in `artifacts/api-server/src/routes/dashboard.ts` (not a separate file)

**Why:** Vite proxy avoids CORS issues with session cookies. Removing Next.js files was necessary because pnpm workspace TS project picked them up despite being unused.
