import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Production customer directory for the customer identity realm.
 *
 * Self-service email sign-in creates a customer on first use. Roles default to `customer`; B2B
 * membership can be added by an operator without giving the customer an ops identity.
 */

export type CustomerStatus = "active" | "disabled";

export interface CustomerIdentity {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: CustomerStatus;
  roles: string[];
  businessAccountId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface CustomerRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: CustomerStatus;
  roles: string[];
  business_account_id: string | null;
  created_at: string;
  last_login_at: string | null;
}

function displayName(email: string): string {
  const local = email.split("@")[0] ?? "Customer";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .slice(0, 80);
}

function toIdentity(row: CustomerRow): CustomerIdentity {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    status: row.status,
    roles: row.roles ?? ["customer"],
    businessAccountId: row.business_account_id,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export class CustomerIdentityStore {
  private pool: pg.Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS customer_identity (
        id                  text PRIMARY KEY,
        email               text NOT NULL UNIQUE,
        name                text NOT NULL,
        phone               text,
        status              text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','disabled')),
        roles               text[] NOT NULL DEFAULT ARRAY['customer']::text[],
        business_account_id text,
        metadata            jsonb,
        created_at          timestamptz NOT NULL DEFAULT now(),
        last_seen_at        timestamptz NOT NULL DEFAULT now(),
        last_login_at       timestamptz
      );
      CREATE UNIQUE INDEX IF NOT EXISTS customer_identity_phone_idx
        ON customer_identity (phone)
        WHERE phone IS NOT NULL;
    `);
  }

  async find(identifier: string): Promise<CustomerIdentity | null> {
    await this.ready;
    const value = identifier.trim().toLowerCase();
    if (!value) return null;
    const result = await this.pool.query(
      `SELECT * FROM customer_identity
        WHERE lower(email) = $1 OR phone = $1
        LIMIT 1`,
      [value],
    );
    const row = result.rows[0] as CustomerRow | undefined;
    return row ? toIdentity(row) : null;
  }

  async get(id: string): Promise<CustomerIdentity | null> {
    await this.ready;
    const result = await this.pool.query("SELECT * FROM customer_identity WHERE id = $1", [id]);
    const row = result.rows[0] as CustomerRow | undefined;
    return row ? toIdentity(row) : null;
  }

  /**
   * Self-service customer creation. An existing disabled identity is never reactivated by a login
   * attempt; it returns null and the route gives a generic response.
   */
  async findOrCreate(email: string): Promise<CustomerIdentity | null> {
    await this.ready;
    const normalized = email.trim().toLowerCase();
    const result = await this.pool.query(
      `INSERT INTO customer_identity (id, email, name, roles, last_seen_at)
       VALUES ($1,$2,$3,ARRAY['customer']::text[],now())
       ON CONFLICT (email) DO UPDATE SET last_seen_at = now()
       RETURNING *`,
      [`cust_${randomUUID()}`, normalized, displayName(normalized)],
    );
    const row = result.rows[0] as CustomerRow | undefined;
    if (!row || row.status !== "active") return null;
    return toIdentity(row);
  }

  async markLogin(id: string): Promise<void> {
    await this.ready;
    await this.pool.query(
      "UPDATE customer_identity SET last_login_at = now(), last_seen_at = now() WHERE id = $1",
      [id],
    );
  }

  async list(limit = 200): Promise<CustomerIdentity[]> {
    await this.ready;
    const result = await this.pool.query(
      "SELECT * FROM customer_identity ORDER BY created_at DESC LIMIT $1",
      [limit],
    );
    return (result.rows as CustomerRow[]).map(toIdentity);
  }

  async setStatus(id: string, status: CustomerStatus): Promise<CustomerIdentity | null> {
    await this.ready;
    const result = await this.pool.query(
      "UPDATE customer_identity SET status = $2 WHERE id = $1 RETURNING *",
      [id, status],
    );
    const row = result.rows[0] as CustomerRow | undefined;
    return row ? toIdentity(row) : null;
  }

  async setAuthorization(
    id: string,
    roles: string[],
    businessAccountId: string | null,
  ): Promise<CustomerIdentity | null> {
    await this.ready;
    const result = await this.pool.query(
      `UPDATE customer_identity
          SET roles = $2, business_account_id = $3
        WHERE id = $1
        RETURNING *`,
      [id, roles, businessAccountId],
    );
    const row = result.rows[0] as CustomerRow | undefined;
    return row ? toIdentity(row) : null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
