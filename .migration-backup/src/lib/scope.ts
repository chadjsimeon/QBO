/**
 * Pure tenant-scoping helpers — no auth/session imports, so they're safe to use
 * from tests and any runtime. The session-aware wrappers live in `tenant.ts`.
 */

/**
 * Assert that a fetched record belongs to the given org. Use after any read
 * that could, in principle, target another tenant's row id.
 */
export function assertOrg<T extends { organizationId: string }>(
  record: T | null,
  organizationId: string
): T {
  if (!record || record.organizationId !== organizationId) {
    throw new Error("Not found");
  }
  return record;
}
