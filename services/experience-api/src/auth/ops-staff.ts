import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { hashRecoveryCode } from "./ops-totp.js";

/**
 * Superadmin-maintained directory of people allowed to use the operator surfaces.
 *
 * The directory is authoritative for the application gate. Cloudflare Access group membership is a
 * sync target, not the source of truth: if the sync fails, the gate still denies the user.
 */

export const OPS_STAFF_ROLES = [
  "super_admin",
  "marketplace_operator",
  "support_operator",
  "finance_operator",
  "erp_operator",
] as const;

export type OpsStaffRole = typeof OPS_STAFF_ROLES[number];

export const OPS_STAFF_STATUSES = ["invited", "active", "disabled"] as const;
export type OpsStaffStatus = typeof OPS_STAFF_STATUSES[number];

const roleSet = new Set<string>(OPS_STAFF_ROLES);
const statusSet = new Set<string>(OPS_STAFF_STATUSES);

export interface OpsStaff {
  id: string;
  email: string;
  name: string;
  roles: OpsStaffRole[];
  status: OpsStaffStatus;
  totpEnrolled: boolean;
  totpConfirmedAt: string | null;
  recoveryCodesRemaining: number;
  failedAttempts: number;
  lockedUntil: string | null;
  createdBy: string;
  createdAt: string;
  lastLoginAt: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
}

interface OpsStaffRow {
  id: string;
  email: string;
  name: string;
  roles: string[];
  status: OpsStaffStatus;
  totp_secret_enc: string | null;
  totp_confirmed_at: Date | string | null;
  totp_last_step: string | null;
  recovery_hashes: string[] | null;
  failed_attempts: number;
  locked_until: Date | string | null;
  created_by: string;
  created_at: Date | string;
  last_login_at: Date | string | null;
  disabled_at: Date | string | null;
  disabled_by: string | null;
}

export interface CreateOpsStaffInput {
  email: string;
  name: string;
  roles: readonly OpsStaffRole[];
  actorEmail: string;
  reason?: string;
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) throw new Error("A valid staff email is required.");
  return normalized;
}

function normalizeRoles(roles: readonly OpsStaffRole[]): OpsStaffRole[] {
  const unique = [...new Set(roles)];
  if (unique.length === 0) throw new Error("At least one staff role is required.");
  for (const role of unique) {
    if (!roleSet.has(role)) throw new Error(`Unknown staff role: ${role}`);
  }
  return unique;
}

function toStaff(row: OpsStaffRow): OpsStaff {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    roles: row.roles as OpsStaffRole[],
    status: row.status,
    totpEnrolled: Boolean(row.totp_confirmed_at),
    totpConfirmedAt: iso(row.totp_confirmed_at),
    recoveryCodesRemaining: row.recovery_hashes?.length ?? 0,
    failedAttempts: Number(row.failed_attempts ?? 0),
    lockedUntil: iso(row.locked_until),
    createdBy: row.created_by,
    createdAt: iso(row.created_at) as string,
    lastLoginAt: iso(row.last_login_at),
    disabledAt: iso(row.disabled_at),
    disabledBy: row.disabled_by,
  };
}

export function decodeOpsEncryptionKey(raw: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new Error("OPS_TOTP_ENCRYPTION_KEY must be 32 bytes encoded as base64.");
  }
  return key;
}

function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptSecret(value: string, key: Buffer): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported TOTP secret format.");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export class OpsStaffStore {
  private readonly pool: pg.Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string, private readonly encryptionKey: Buffer) {
    if (encryptionKey.length !== 32) {
      throw new Error("The ops staff encryption key must be 32 bytes.");
    }
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ops_staff (
        id                  text PRIMARY KEY,
        email               text NOT NULL,
        name                text NOT NULL,
        roles               text[] NOT NULL DEFAULT ARRAY[]::text[],
        status              text NOT NULL DEFAULT 'invited'
                              CHECK (status IN ('invited','active','disabled')),
        totp_secret_enc     text,
        totp_confirmed_at   timestamptz,
        totp_last_step      bigint,
        recovery_hashes     text[] NOT NULL DEFAULT ARRAY[]::text[],
        failed_attempts     integer NOT NULL DEFAULT 0,
        locked_until        timestamptz,
        created_by          text NOT NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        last_login_at       timestamptz,
        disabled_at         timestamptz,
        disabled_by         text
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ops_staff_email_lower_idx
        ON ops_staff (lower(email));
      CREATE TABLE IF NOT EXISTS ops_staff_audit (
        id          bigserial PRIMARY KEY,
        staff_id    text NOT NULL,
        actor_email text NOT NULL,
        action      text NOT NULL,
        reason      text,
        before      jsonb,
        after       jsonb,
        at          timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ops_staff_audit_staff_idx
        ON ops_staff_audit (staff_id, at DESC);
    `);
  }

  private async audit(
    staffId: string,
    actorEmail: string,
    action: string,
    reason: string | null,
    before: unknown,
    after: unknown,
    client?: pg.PoolClient,
  ): Promise<void> {
    const runner = client ?? this.pool;
    await runner.query(
      `INSERT INTO ops_staff_audit (staff_id, actor_email, action, reason, before, after)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        staffId,
        actorEmail,
        action,
        reason,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
      ],
    );
  }

  async create(input: CreateOpsStaffInput): Promise<OpsStaff> {
    await this.ready;
    const email = normalizeEmail(input.email);
    const roles = normalizeRoles(input.roles);
    const name = input.name.trim() || email.split("@")[0] || "Staff";
    const id = `ops_${randomUUID()}`;
    try {
      const result = await this.pool.query(
        `INSERT INTO ops_staff (id, email, name, roles, status, created_by)
         VALUES ($1,$2,$3,$4,'invited',$5)
         RETURNING *`,
        [id, email, name, roles, input.actorEmail.trim().toLowerCase()],
      );
      const staff = toStaff(result.rows[0] as OpsStaffRow);
      await this.audit(
        staff.id,
        input.actorEmail.trim().toLowerCase(),
        "staff.created",
        input.reason?.trim() || null,
        null,
        { email: staff.email, name: staff.name, roles: staff.roles, status: staff.status },
      );
      return staff;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error("A staff user with that email already exists.");
      }
      throw error;
    }
  }

  async get(email: string): Promise<OpsStaff | null> {
    await this.ready;
    const result = await this.pool.query(
      "SELECT * FROM ops_staff WHERE lower(email) = lower($1) LIMIT 1",
      [email.trim()],
    );
    const row = result.rows[0] as OpsStaffRow | undefined;
    return row ? toStaff(row) : null;
  }

  async list(): Promise<OpsStaff[]> {
    await this.ready;
    const result = await this.pool.query("SELECT * FROM ops_staff ORDER BY created_at ASC");
    return (result.rows as OpsStaffRow[]).map(toStaff);
  }

  async setRoles(
    email: string,
    roles: readonly OpsStaffRole[],
    actorEmail: string,
    reason: string,
  ): Promise<OpsStaff | null> {
    await this.ready;
    const existing = await this.get(email);
    if (!existing) return null;
    const next = normalizeRoles(roles);
    const result = await this.pool.query(
      "UPDATE ops_staff SET roles = $2 WHERE id = $1 RETURNING *",
      [existing.id, next],
    );
    const staff = toStaff(result.rows[0] as OpsStaffRow);
    await this.audit(
      staff.id,
      actorEmail.trim().toLowerCase(),
      "staff.roles_changed",
      reason.trim() || null,
      { roles: existing.roles },
      { roles: staff.roles },
    );
    return staff;
  }

  async setStatus(
    email: string,
    status: OpsStaffStatus,
    actorEmail: string,
    reason: string,
  ): Promise<OpsStaff | null> {
    await this.ready;
    if (!statusSet.has(status)) throw new Error(`Unknown staff status: ${status}`);
    const existing = await this.get(email);
    if (!existing) return null;
    const result = await this.pool.query(
      `UPDATE ops_staff
          SET status = $2,
              disabled_at = CASE WHEN $2 = 'disabled' THEN now() ELSE NULL END,
              disabled_by = CASE WHEN $2 = 'disabled' THEN $3 ELSE NULL END,
              failed_attempts = CASE WHEN $2 = 'disabled' THEN 0 ELSE failed_attempts END,
              locked_until = CASE WHEN $2 = 'disabled' THEN NULL ELSE locked_until END
        WHERE id = $1
        RETURNING *`,
      [existing.id, status, actorEmail.trim().toLowerCase()],
    );
    const staff = toStaff(result.rows[0] as OpsStaffRow);
    await this.audit(
      staff.id,
      actorEmail.trim().toLowerCase(),
      status === "disabled" ? "staff.disabled" : "staff.status_changed",
      reason.trim() || null,
      { status: existing.status },
      { status: staff.status },
    );
    return staff;
  }

  async beginEnrollment(email: string, secret: string): Promise<boolean> {
    await this.ready;
    const staff = await this.get(email);
    if (!staff || staff.status === "disabled" || staff.totpEnrolled) return false;
    const result = await this.pool.query(
      `UPDATE ops_staff SET totp_secret_enc = $2, totp_last_step = NULL
        WHERE id = $1 AND status <> 'disabled' AND totp_confirmed_at IS NULL`,
      [staff.id, encryptSecret(secret, this.encryptionKey)],
    );
    if ((result.rowCount ?? 0) === 0) return false;
    await this.audit(staff.id, staff.email, "staff.enrollment_started", null, null, null);
    return true;
  }

  async confirmEnrollment(
    email: string,
    recoveryCodes: readonly string[],
    actorEmail?: string,
    step?: number | null,
  ): Promise<OpsStaff | null> {
    await this.ready;
    const staff = await this.get(email);
    if (!staff || staff.status === "disabled" || staff.totpEnrolled) return null;
    if (recoveryCodes.length === 0) throw new Error("Recovery codes are required.");
    const hashes = recoveryCodes.map(hashRecoveryCode);
    const result = await this.pool.query(
      `UPDATE ops_staff
          SET totp_confirmed_at = now(),
              status = 'active',
              recovery_hashes = $2,
              totp_last_step = $3,
              failed_attempts = 0,
              locked_until = NULL
        WHERE id = $1 AND status <> 'disabled' AND totp_confirmed_at IS NULL
        RETURNING *`,
      [staff.id, hashes, step ?? null],
    );
    const row = result.rows[0] as OpsStaffRow | undefined;
    if (!row) return null;
    const updated = toStaff(row);
    await this.audit(
      staff.id,
      (actorEmail ?? staff.email).trim().toLowerCase(),
      "staff.enrollment_confirmed",
      null,
      { status: staff.status },
      { status: updated.status, recovery_codes: hashes.length },
    );
    return updated;
  }

  async resetEnrollment(
    email: string,
    actorEmail: string,
    reason: string,
  ): Promise<OpsStaff | null> {
    await this.ready;
    const staff = await this.get(email);
    if (!staff) return null;
    const result = await this.pool.query(
      `UPDATE ops_staff
          SET totp_secret_enc = NULL,
              totp_confirmed_at = NULL,
              totp_last_step = NULL,
              recovery_hashes = ARRAY[]::text[],
              status = CASE WHEN status = 'disabled' THEN status ELSE 'invited' END,
              failed_attempts = 0,
              locked_until = NULL
        WHERE id = $1
        RETURNING *`,
      [staff.id],
    );
    const updated = toStaff(result.rows[0] as OpsStaffRow);
    await this.audit(
      staff.id,
      actorEmail.trim().toLowerCase(),
      "staff.enrollment_reset",
      reason.trim() || null,
      { totp_enrolled: staff.totpEnrolled, status: staff.status },
      { totp_enrolled: updated.totpEnrolled, status: updated.status },
    );
    return updated;
  }

  async getTotpSecret(email: string): Promise<string | null> {
    await this.ready;
    const result = await this.pool.query(
      "SELECT totp_secret_enc FROM ops_staff WHERE lower(email) = lower($1) LIMIT 1",
      [email.trim()],
    );
    const row = result.rows[0] as { totp_secret_enc: string | null } | undefined;
    if (!row?.totp_secret_enc) return null;
    return decryptSecret(row.totp_secret_enc, this.encryptionKey);
  }

  async getTotpState(email: string): Promise<{
    secret: string | null;
    lastStep: number | null;
    status: OpsStaffStatus;
    lockedUntil: string | null;
  } | null> {
    await this.ready;
    const result = await this.pool.query(
      `SELECT status, totp_secret_enc, totp_last_step, locked_until
         FROM ops_staff
        WHERE lower(email) = lower($1)
        LIMIT 1`,
      [email.trim()],
    );
    const row = result.rows[0] as
      | {
          status: OpsStaffStatus;
          totp_secret_enc: string | null;
          totp_last_step: string | null;
          locked_until: Date | string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      secret: row.totp_secret_enc
        ? decryptSecret(row.totp_secret_enc, this.encryptionKey)
        : null,
      lastStep: row.totp_last_step === null ? null : Number(row.totp_last_step),
      status: row.status,
      lockedUntil: iso(row.locked_until),
    };
  }

  /**
   * Accept a TOTP step once. The conditional update makes replay protection atomic across
   * concurrent requests.
   */
  async consumeTotpStep(email: string, step: number): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE ops_staff
          SET totp_last_step = $2,
              last_login_at = now(),
              failed_attempts = 0,
              locked_until = NULL
        WHERE lower(email) = lower($1)
          AND status = 'active'
          AND (totp_last_step IS NULL OR totp_last_step < $2)
        RETURNING id`,
      [email.trim(), step],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async registerFailure(email: string): Promise<{ failedAttempts: number; lockedUntil: string | null }> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE ops_staff
          SET failed_attempts = failed_attempts + 1,
              locked_until = CASE
                WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
                ELSE locked_until
              END
        WHERE lower(email) = lower($1)
        RETURNING failed_attempts, locked_until`,
      [email.trim()],
    );
    const row = result.rows[0] as { failed_attempts: number; locked_until: Date | string | null } | undefined;
    return {
      failedAttempts: Number(row?.failed_attempts ?? 0),
      lockedUntil: iso(row?.locked_until ?? null),
    };
  }

  async clearFailures(email: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      "UPDATE ops_staff SET failed_attempts = 0, locked_until = NULL WHERE lower(email) = lower($1)",
      [email.trim()],
    );
  }

  /**
   * Consume a recovery code exactly once. Returns false for an unknown, used or disabled account.
   */
  async consumeRecoveryCode(email: string, code: string): Promise<boolean> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT id, email, recovery_hashes FROM ops_staff
          WHERE lower(email) = lower($1) AND status = 'active'
          FOR UPDATE`,
        [email.trim()],
      );
      const row = result.rows[0] as
        | { id: string; email: string; recovery_hashes: string[] }
        | undefined;
      if (!row) {
        await client.query("ROLLBACK");
        return false;
      }
      const hash = hashRecoveryCode(code);
      const index = (row.recovery_hashes ?? []).indexOf(hash);
      if (index === -1) {
        await client.query("ROLLBACK");
        return false;
      }
      const remaining = [...row.recovery_hashes];
      remaining.splice(index, 1);
      await client.query(
        `UPDATE ops_staff
            SET recovery_hashes = $2,
                last_login_at = now(),
                failed_attempts = 0,
                locked_until = NULL
          WHERE id = $1`,
        [row.id, remaining],
      );
      await this.audit(
        row.id,
        row.email,
        "staff.recovery_used",
        null,
        null,
        { remaining: remaining.length },
        client,
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async auditTrail(email: string, limit = 50): Promise<Array<Record<string, unknown>>> {
    await this.ready;
    const staff = await this.get(email);
    if (!staff) return [];
    const result = await this.pool.query(
      `SELECT actor_email, action, reason, before, after, at
         FROM ops_staff_audit
        WHERE staff_id = $1
        ORDER BY at DESC
        LIMIT $2`,
      [staff.id, limit],
    );
    return result.rows as Array<Record<string, unknown>>;
  }

  async close(): Promise<void> {
    await this.ready;
    await this.pool.end();
  }
}
