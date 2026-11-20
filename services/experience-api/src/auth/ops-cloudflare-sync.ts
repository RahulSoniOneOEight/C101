/**
 * Cloudflare Access group sync for the ops staff directory.
 *
 * The app directory is authoritative. This keeps the edge allowlist aligned: invited/active staff
 * are added to the Staff or ERP group, disabled staff are removed. Domain rules and unrelated email
 * entries are preserved; only explicit entries for known staff are managed.
 *
 * A sync failure never grants access: the app gate still checks `ops_staff` on every request. The
 * caller logs the failure and can retry through reconciliation.
 */

export type OpsSyncStatus = "invited" | "active" | "disabled";

export interface OpsSyncPerson {
  email: string;
  roles: string[];
  status: OpsSyncStatus;
}

export interface AccessGroupInclude {
  [key: string]: unknown;
}

interface AccessGroup {
  id: string;
  name: string;
  include: AccessGroupInclude[];
  exclude?: AccessGroupInclude[];
  require?: AccessGroupInclude[];
}

export interface OpsSyncResult {
  ok: boolean;
  changed: string[];
  errors: string[];
}

export interface CloudflareAccessGroupSyncOptions {
  accountId: string;
  apiToken: string;
  staffGroupId: string;
  erpGroupId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  log?: (event: Record<string, unknown>) => void;
}

const STAFF_ROLES = new Set(["super_admin", "marketplace_operator", "support_operator"]);
const ERP_ROLES = new Set(["finance_operator", "erp_operator"]);

function emailOf(entry: AccessGroupInclude): string {
  const email = (entry.email as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export class CloudflareAccessGroupSync {
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly staffGroupId: string;
  private readonly erpGroupId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (event: Record<string, unknown>) => void;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: CloudflareAccessGroupSyncOptions) {
    if (!options.accountId || !options.apiToken || !options.staffGroupId || !options.erpGroupId) {
      throw new Error("Cloudflare Access group sync requires account, token, staff and ERP group IDs.");
    }
    this.accountId = options.accountId;
    this.apiToken = options.apiToken;
    this.staffGroupId = options.staffGroupId;
    this.erpGroupId = options.erpGroupId;
    this.baseUrl = (options.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.log =
      options.log ??
      ((event) => {
        console.info(JSON.stringify(event));
      });
  }

  desiredGroupIds(person: Pick<OpsSyncPerson, "roles" | "status">): string[] {
    if (person.status === "disabled") return [];
    const groups: string[] = [];
    if (person.roles.some((role) => STAFF_ROLES.has(role))) groups.push(this.staffGroupId);
    if (person.roles.some((role) => ERP_ROLES.has(role))) groups.push(this.erpGroupId);
    return groups;
  }

  private async request(method: string, path: string, payload?: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => null)) as
      | { success?: boolean; result?: unknown; errors?: unknown }
      | null;
    if (!response.ok || body?.success === false) {
      const detail = body?.errors ? JSON.stringify(body.errors) : `HTTP ${response.status}`;
      throw new Error(`Cloudflare Access API ${method} ${path} failed: ${detail}`);
    }
    return body?.result;
  }

  private async getGroup(groupId: string): Promise<AccessGroup> {
    return (await this.request(
      "GET",
      `/accounts/${this.accountId}/access/groups/${groupId}`,
    )) as AccessGroup;
  }

  private async putGroup(group: AccessGroup): Promise<void> {
    await this.request("PUT", `/accounts/${this.accountId}/access/groups/${group.id}`, {
      name: group.name,
      include: group.include,
      exclude: group.exclude ?? [],
      require: group.require ?? [],
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private applyMembership(group: AccessGroup, email: string, wanted: boolean): boolean {
    const normalized = email.trim().toLowerCase();
    const include = [...group.include];
    const index = include.findIndex((entry) => emailOf(entry) === normalized);
    if (wanted && index === -1) {
      include.push({ email: { email: normalized } });
      group.include = include;
      return true;
    }
    if (!wanted && index !== -1) {
      include.splice(index, 1);
      group.include = include;
      return true;
    }
    return false;
  }

  async syncUser(person: OpsSyncPerson): Promise<OpsSyncResult> {
    return this.enqueue(async () => {
      const wanted = new Set(this.desiredGroupIds(person));
      const changed: string[] = [];
      const errors: string[] = [];
      for (const groupId of [this.staffGroupId, this.erpGroupId]) {
        try {
          const group = await this.getGroup(groupId);
          if (this.applyMembership(group, person.email, wanted.has(groupId))) {
            await this.putGroup(group);
            changed.push(groupId);
          }
        } catch (error) {
          errors.push((error as Error).message);
        }
      }
      const result = { ok: errors.length === 0, changed, errors };
      this.log({
        event: "ops.access_group.sync_user",
        email: person.email,
        status: person.status,
        ok: result.ok,
        changed,
        errors,
      });
      return result;
    });
  }

  /**
   * Align both managed groups with the whole staff list. Only explicit entries whose email belongs
   * to a known staff user are considered; domain rules and unrelated emails are preserved.
   */
  async reconcile(people: OpsSyncPerson[]): Promise<OpsSyncResult> {
    return this.enqueue(async () => {
      const byEmail = new Map(
        people.map((person) => [person.email.trim().toLowerCase(), person] as const),
      );
      const changed: string[] = [];
      const errors: string[] = [];
      for (const groupId of [this.staffGroupId, this.erpGroupId]) {
        try {
          const group = await this.getGroup(groupId);
          const include = [...group.include];
          let mutated = false;
          for (let index = include.length - 1; index >= 0; index -= 1) {
            const email = emailOf(include[index]);
            if (!email) continue;
            const person = byEmail.get(email);
            if (!person) continue;
            if (!this.desiredGroupIds(person).includes(groupId)) {
              include.splice(index, 1);
              mutated = true;
            }
          }
          for (const person of people) {
            if (!this.desiredGroupIds(person).includes(groupId)) continue;
            const email = person.email.trim().toLowerCase();
            if (!include.some((entry) => emailOf(entry) === email)) {
              include.push({ email: { email } });
              mutated = true;
            }
          }
          if (mutated) {
            group.include = include;
            await this.putGroup(group);
            changed.push(groupId);
          }
        } catch (error) {
          errors.push((error as Error).message);
        }
      }
      const result = { ok: errors.length === 0, changed, errors };
      this.log({
        event: "ops.access_group.reconcile",
        people: people.length,
        ok: result.ok,
        changed,
        errors,
      });
      return result;
    });
  }
}
