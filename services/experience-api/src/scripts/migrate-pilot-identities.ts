import pg from "pg";
import { CustomerIdentityStore } from "../auth/customer-identity.js";

/**
 * Staging-only migration: copy the pilot allowlist and role assignments into customer_identity so
 * directory mode can be enabled without losing B2B roles. Production starts from an empty directory.
 */
const raw = process.env.PILOT_USERS_JSON;
if (!raw?.trim()) throw new Error("PILOT_USERS_JSON is required for this migration.");
const users = JSON.parse(raw) as Array<{ id: string; email: string; name: string; phone?: string }>;
const store = new CustomerIdentityStore(process.env.EXPERIENCE_DATABASE_URL!);
const pool = new pg.Pool({ connectionString: process.env.EXPERIENCE_DATABASE_URL! });

let migrated = 0;
for (const user of users) {
  const identity = await store.findOrCreate(user.email);
  if (!identity) {
    console.log("skipped disabled", user.email);
    continue;
  }
  const assignment = await pool.query(
    "SELECT roles, business_account_id FROM pilot_access_assignment WHERE user_id = $1",
    [user.id],
  );
  const row = assignment.rows[0] as
    | { roles: unknown; business_account_id: string | null }
    | undefined;
  const roles = Array.isArray(row?.roles)
    ? row!.roles.filter((role): role is string => typeof role === "string")
    : ["customer"];
  await store.setAuthorization(
    identity.id,
    roles.length ? roles : ["customer"],
    row?.business_account_id ?? null,
  );
  migrated += 1;
  console.log("migrated", user.email, roles.join(","), row?.business_account_id ?? "-");
}
await pool.end();
await store.close();
console.log("total", migrated);
