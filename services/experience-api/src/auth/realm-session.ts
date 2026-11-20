import { createHash, randomBytes } from "node:crypto";
import { RedisClient } from "bun";

/**
 * Opaque, realm-scoped session tokens.
 *
 * Each realm has its own Redis prefix and TTL, so a customer token can never be resolved by the
 * seller/admin realm even if a token value were reused.
 */
export class RealmSessionStore {
  private readonly redis: RedisClient;
  private readonly ready: Promise<void>;

  constructor(
    redisUrl: string,
    private readonly prefix: string,
    private readonly ttlSeconds: number,
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

  async issueSession(userId: string): Promise<{
    session_token: string;
    expires_in_seconds: number;
  }> {
    await this.ready;
    const token = randomBytes(32).toString("base64url");
    await this.redis.set(this.key(token), userId, "EX", this.ttlSeconds);
    return { session_token: token, expires_in_seconds: this.ttlSeconds };
  }

  async resolveSession(token: string): Promise<string | null> {
    if (!token) return null;
    await this.ready;
    return this.redis.get(this.key(token));
  }

  async revokeSession(token: string): Promise<boolean> {
    if (!token) return false;
    await this.ready;
    return (await this.redis.del(this.key(token))) > 0;
  }

  async ping(): Promise<boolean> {
    await this.ready;
    return (await this.redis.send("PING", [])) === "PONG";
  }
}
