import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { RedisClient } from "bun";

/**
 * Email code and magic-link challenges for the staging pilot.
 *
 * Codes/tokens are stored as hashes in Redis, are single-use and expire. The sender is injected by
 * the route (Resend in configured environments, a staging preview otherwise). This store never
 * emails anything itself.
 */

const PREFIX = "buildkart:email-auth:v1";

interface CodeChallenge {
  userId: string;
  codeHash: string;
  attempts: number;
  expiresAt: number;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeHashMatch(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class EmailAuthStore {
  private readonly redis: RedisClient;
  private readonly ready: Promise<void>;

  constructor(
    redisUrl: string,
    private readonly codeTtlSeconds = 600,
    private readonly magicTtlSeconds = 900,
    private readonly maxAttempts = 5,
    private readonly cooldownSeconds = 60,
  ) {
    this.redis = new RedisClient(redisUrl, {
      connectionTimeout: 5000,
      maxRetries: 3,
      enableOfflineQueue: false,
    });
    this.ready = this.redis.connect();
  }

  private codeKey(challengeId: string): string {
    return `${PREFIX}:code:${challengeId}`;
  }

  private magicKey(token: string): string {
    return `${PREFIX}:magic:${digest(token)}`;
  }

  private cooldownKey(email: string): string {
    return `${PREFIX}:cooldown:${digest(email.trim().toLowerCase())}`;
  }

  /** Returns false when the same email requested another code inside the cooldown window. */
  async beginRequest(email: string): Promise<boolean> {
    await this.ready;
    const key = this.cooldownKey(email);
    if (await this.redis.get(key)) return false;
    await this.redis.set(key, "1", "EX", this.cooldownSeconds);
    return true;
  }

  async issueCode(userId: string): Promise<{
    challengeId: string;
    code: string;
    expiresInSeconds: number;
  }> {
    await this.ready;
    const challengeId = randomUUID();
    const code = String(randomInt(100000, 1000000));
    const challenge: CodeChallenge = {
      userId,
      codeHash: digest(`${challengeId}:${code}`),
      attempts: 0,
      expiresAt: Date.now() + this.codeTtlSeconds * 1000,
    };
    await this.redis.set(
      this.codeKey(challengeId),
      JSON.stringify(challenge),
      "EX",
      this.codeTtlSeconds,
    );
    return { challengeId, code, expiresInSeconds: this.codeTtlSeconds };
  }

  async verifyCode(challengeId: string, code: string): Promise<string | null> {
    await this.ready;
    const key = this.codeKey(challengeId);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    const challenge = JSON.parse(raw) as CodeChallenge;
    if (challenge.expiresAt < Date.now() || challenge.attempts >= this.maxAttempts) {
      await this.redis.del(key);
      return null;
    }
    const matches = safeHashMatch(challenge.codeHash, digest(`${challengeId}:${code.trim()}`));
    if (!matches) {
      challenge.attempts += 1;
      if (challenge.attempts >= this.maxAttempts) {
        await this.redis.del(key);
      } else {
        const remaining = Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
        await this.redis.set(key, JSON.stringify(challenge), "EX", remaining);
      }
      return null;
    }
    await this.redis.del(key);
    return challenge.userId;
  }

  async issueMagicToken(userId: string): Promise<{
    token: string;
    expiresInSeconds: number;
  }> {
    await this.ready;
    const token = randomBytes(32).toString("base64url");
    await this.redis.set(this.magicKey(token), userId, "EX", this.magicTtlSeconds);
    return { token, expiresInSeconds: this.magicTtlSeconds };
  }

  async consumeMagicToken(token: string): Promise<string | null> {
    await this.ready;
    if (!token.trim()) return null;
    return this.redis.getdel(this.magicKey(token.trim()));
  }

  async ping(): Promise<boolean> {
    await this.ready;
    return (await this.redis.send("PING", [])) === "PONG";
  }

  close(): void {
    this.redis.close();
  }
}
