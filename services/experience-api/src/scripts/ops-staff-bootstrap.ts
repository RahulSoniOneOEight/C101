import { loadConfig } from "../config.js";
import { decodeOpsEncryptionKey, OpsStaffStore, type OpsStaffRole } from "../auth/ops-staff.js";

/**
 * Seed the first superadmin (or another staff user) before the `/ops/staff` UI exists.
 *
 *   docker exec -e EXPERIENCE_DATABASE_URL=... buildkart-hosted-pilot-experience-api-1 \
 *     bun run src/scripts/ops-staff-bootstrap.ts gobazarbee@gmail.com "Owner" super_admin
 *
 * The user still has to enrol TOTP at /ops/enroll. No secret is printed.
 */

const email = process.argv[2]?.trim();
const name = process.argv[3]?.trim();
const rolesArg = process.argv[4]?.trim() || "super_admin";

if (!email) {
  console.error("usage: bun run src/scripts/ops-staff-bootstrap.ts <email> [name] [roles]");
  process.exit(2);
}

const config = loadConfig(process.env);
if (config.opsTotpGate === "off" || !config.opsTotpEncryptionKey) {
  console.error("OPS_TOTP_GATE and OPS_TOTP_ENCRYPTION_KEY must be configured.");
  process.exit(2);
}

const roles = rolesArg
  .split(",")
  .map((role) => role.trim())
  .filter(Boolean) as OpsStaffRole[];

const store = new OpsStaffStore(
  config.experienceDatabaseUrl,
  decodeOpsEncryptionKey(config.opsTotpEncryptionKey),
);

try {
  const existing = await store.get(email);
  if (existing) {
    console.log(
      `exists id=${existing.id} email=${existing.email} status=${existing.status} roles=${existing.roles.join(",")}`,
    );
  } else {
    const created = await store.create({
      email,
      name: name || email.split("@")[0] || "Staff",
      roles,
      actorEmail: "bootstrap",
      reason: "first ops staff bootstrap",
    });
    console.log(
      `created id=${created.id} email=${created.email} status=${created.status} roles=${created.roles.join(",")}`,
    );
  }
} finally {
  await store.close();
}
