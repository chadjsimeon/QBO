// Refuse to run against anything but the throwaway test database. The real
// `ledgerly` DB holds live company data; see DATABASE.md.
const url = process.env.DATABASE_URL ?? "";
if (!url.includes("ledgerly_test")) {
  throw new Error(
    `Tests require DATABASE_URL to point at ledgerly_test, got: ${url.replace(/:[^:@/]+@/, ":***@")}`,
  );
}
