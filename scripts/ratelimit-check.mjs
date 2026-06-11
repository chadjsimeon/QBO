// Quick manual check that the auth rate limiter kicks in (dev env only).
const BASE = process.argv[2] || "http://localhost:8000";
let last = 0;
for (let i = 1; i <= 22; i++) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nobody@x.y", password: "wrongpass" }),
  });
  last = res.status;
  if (res.status === 429) {
    console.log(`429 received at attempt ${i} — rate limiter working`);
    process.exit(0);
  }
}
console.log(`no 429 after 22 attempts (last status ${last}) — rate limiter NOT working`);
process.exit(1);
