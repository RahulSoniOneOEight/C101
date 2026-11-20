import { createHash, randomBytes } from "node:crypto";
import { RedisClient } from "bun";

/**
 * Opaque ops sessions, issued only after TOTP verification.
 *
 * The value carries the Cloudflare-verified email and the staff roles at login time. The gate still
 * re-reads `ops_staff` on every request, so a disable takes effect even while a token is live.
 */

export interface OpsSession {
  email: string;
  name: string;
  roles: string[];
  accessSub: string | null;
  totpAt: string;
  createdAt: string;
}

export class OpsSessionStore {
  private readonly redis: RedisClient;
  private readonly ready: Promise<void>;

  constructor(
    redisUrl: string,
    private readonly prefix = "bazarbee:ops-realm",
    private readonly ttlSeconds = 8 * 60 * 60,
  ) {
    this.redis = new RedisClient(redisUrl, {
      connectionTimeout: 5000,
      maxRetries: 3,
      enableOfflineQueue: false,
    });
    this.ready = this.redis.connect();
  }

  private key(token: string): string {
    return `${this.prefix}:session:${createHash("sha256").update(token).digest("hex")}`;
  }

  async issueSession(
    input: Omit<OpsSession, "createdAt">,
  ): Promise<{ session_token: string; expires_in_seconds: number }> {
    await this.ready;
    const token = randomBytes(32).toString("base64url");
    const value: OpsSession = { ...input, createdAt: new Date().toISOString() };
    await this.redis.set(this.key(token), JSON.stringify(value), "EX", this.ttlSeconds);
    return { session_token: token, expires_in_seconds: this.ttlSeconds };
  }

  async resolveSession(token: string | null): Promise<OpsSession | null> {
    if (!token) return null;
    await this.ready;
    const raw = await this.redis.get(this.key(token));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<OpsSession>;
      if (!parsed.email || !Array.isArray(parsed.roles)) return null;
      return {
        email: parsed.email,
        name: parsed.name ?? parsed.email,
        roles: parsed.roles.map(String),
        accessSub: parsed.accessSub ?? null,
        totpAt: parsed.totpAt ?? "",
        createdAt: parsed.createdAt ?? "",
      };
    } catch {
      return null;
    }
  }

  async revokeSession(token: string | null): Promise<boolean> {
    if (!token) return false;
    await this.ready;
    return (await this.redis.del(this.key(token))) > 0;
  }

  async ping(): Promise<boolean> {
    await this.ready;
    return (await this.redis.send("PING", [])) === "PONG";
  }
}
