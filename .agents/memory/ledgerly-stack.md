---
name: Ledgerly stack
description: Port layout, proxy config, auth pattern, and key decisions for the Ledgerly accounting app
---

# Ledgerly Stack

## Port layout
- Frontend (Vite+React): artifact-managed workflow uses auto-assigned port (e.g. 21074); Vite proxies `/api` → `http://localhost:8000`
- API (Express): PORT=8000
- Separate "Start application" workflow also runs frontend on PORT=5000 for dev convenience
- External port 80 maps to artifact router which proxies to the artifact-managed frontend port

## Auth
- Session-based (express-session + bcryptjs), `credentials: "include"` on all fetches
- Session middleware in `artifacts/api-server/src/lib/session.ts`
- CORS: `{ origin: true, credentials: true }` in app.ts
- A seeded demo account exists; see `scripts/seed.ts` for credentials (not stored here)

## Key decisions
- Removed all Next.js lib files from `artifacts/ledgerly/src/lib/` and `src/app/` — they caused TS errors referencing @prisma/client, next-auth, next/navigation
- Payment direction enum: `RECEIVED` / `SENT` (not INBOUND/OUTBOUND)
- BASE_PATH defaults to `/` in vite.config.ts if not provided; PORT is still required
- Search route is in `artifacts/api-server/src/routes/dashboard.ts` (not a separate file)

**Why:** Vite proxy avoids CORS issues with session cookies. Removing Next.js files was necessary because pnpm workspace TS project picked them up despite being unused.
