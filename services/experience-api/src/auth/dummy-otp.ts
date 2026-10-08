import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { RedisClient } from "bun";

/**
 * Simulated OTP flow for the pilot. No provider, no real SMS. A fixed test code is accepted for any
 * allowlisted pilot user. Challenges and sessions are stored in Redis so they survive API restarts
 * and are shared across replicas. This remains dummy identity and must be replaced by a real
 * IdP/OTP provider before production.
 */

interface Challenge {
  code: string;
  userId: string;
  expiresAt: number;
}

const PREFIX = "buildkart:pilot-auth:v1";

function sessionKey(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `${PREFIX}:session:${digest}`;
}

function safeCodeMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class PilotAuthStore {
  private readonly redis: RedisClient;
  private readonly ready: Promise<void>;

  constructor(
    redisUrl: string,
    private readonly otpCode: string,
    private readonly challengeTtlSeconds: number,
    private readonly sessionTtlSeconds: number,
  ) {
    this.redis = new RedisClient(redisUrl, {
      connectionTimeout: 5000,
      maxRetries: 3,
      enableOfflineQueue: false,
    });
    this.ready = this.redis.connect();
  }

  async issueChallenge(userId: string): Promise<{ challenge_id: string; expires_in_seconds: number }> {
    await this.ready;
    const challengeId = randomUUID();
    const challenge: Challenge = {
      code: this.otpCode,
      userId,
      expiresAt: Date.now() + this.challengeTtlSeconds * 1000,
    };
    await this.redis.set(
      `${PREFIX}:challenge:${challengeId}`,
      JSON.stringify(challenge),
      "EX",
      this.challengeTtlSeconds,
    );
    return { challenge_id: challengeId, expires_in_seconds: this.challengeTtlSeconds };
  }

  async verifyChallenge(
    challengeId: string,
    code: string,
  ): Promise<{ session_token: string; user_id: string; expires_in_seconds: number } | null> {
    await this.ready;
    // GETDEL makes every verification attempt single-use across API replicas.
    const raw = await this.redis.getdel(`${PREFIX}:challenge:${challengeId}`);
    if (!raw) return null;
    const challenge = JSON.parse(raw) as Challenge;
    if (challenge.expiresAt < Date.now() || !safeCodeMatch(challenge.code, code)) {
      return null;
    }
    const token = randomBytes(32).toString("base64url");
    await this.redis.set(sessionKey(token), challenge.userId, "EX", this.sessionTtlSeconds);
    return {
      session_token: token,
      user_id: challenge.userId,
      expires_in_seconds: this.sessionTtlSeconds,
    };
  }

  async resolveSession(token: string): Promise<string | null> {
    if (!token) return null;
    await this.ready;
    return this.redis.get(sessionKey(token));
  }

  async revokeSession(token: string): Promise<boolean> {
    if (!token) return false;
    await this.ready;
    return (await this.redis.del(sessionKey(token))) > 0;
  }

  async ping(): Promise<boolean> {
    await this.ready;
    return (await this.redis.send("PING", [])) === "PONG";
  }

  close(): void {
    this.redis.close();
  }
}
