import type { Config } from "../config.js";

/**
 * Minimal Tryton JSON-RPC client for the staging ERP integration.
 *
 * Protocol notes:
 * - Login via `common.db.login` with `[username, { password }]`, returning `[userid, token]`.
 * - Subsequent calls send `Authorization: Session <base64(username:userid:token)>`.
 * - Model methods are `model.<model>.<method>` with params `[args..., context]`.
 */
export class TrytonClient {
  private userid = 0;
  private token = "";
  private authHeader = "";
  private context: Record<string, unknown> = {};

  constructor(private readonly config: Config) {}

  setContext(context: Record<string, unknown>): void {
    this.context = context;
  }

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    const body = JSON.stringify({ method, params, id: 1 });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authHeader) {
      headers.Authorization = this.authHeader;
    }
    const response = await fetch(
      `${this.config.trytonBaseUrl}/${this.config.trytonDatabase}/rpc/`,
      { method: "POST", headers, body },
    );
    const data = (await response.json()) as {
      result?: unknown;
      error?: [string, unknown];
    };
    if (data.error) {
      throw new Error(`Tryton ${method}: ${JSON.stringify(data.error)}`);
    }
    return data.result;
  }

  async login(): Promise<void> {
    const result = (await this.rpc("common.db.login", [
      this.config.trytonUsername,
      { password: this.config.trytonPassword },
    ])) as [number, string];
    this.userid = result[0];
    this.token = result[1];
    const encoded = Buffer.from(
      `${this.config.trytonUsername}:${this.userid}:${this.token}`,
    ).toString("base64");
    this.authHeader = `Session ${encoded}`;
  }

  async call(method: string, params: unknown[]): Promise<unknown> {
    if (!this.authHeader) {
      await this.login();
    }
    return this.rpc(method, params);
  }

  async search(model: string, domain: unknown[] = [], limit = 20): Promise<number[]> {
    const result = (await this.call(`model.${model}.search`, [
      domain,
      0,
      limit,
      null,
      this.context,
    ])) as number[];
    return result ?? [];
  }

  async read(model: string, ids: number[], fields: string[]): Promise<Record<string, unknown>[]> {
    const result = (await this.call(`model.${model}.read`, [
      ids,
      fields,
      this.context,
    ])) as Record<string, unknown>[];
    return result ?? [];
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    const result = (await this.call(`model.${model}.create`, [
      [values],
      this.context,
    ])) as number[];
    return result[0];
  }

  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<void> {
    await this.call(`model.${model}.write`, [ids, values, this.context]);
  }
}
