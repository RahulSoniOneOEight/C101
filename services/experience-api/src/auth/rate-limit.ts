import { createHash } from "node:crypto";
import { RedisClient } from "bun";

/**
 * Fixed-window auth rate limiter backed by Redis.
 *
 * Keys are hashed so an IP/device value never appears in Redis logs. The limiter fails closed at
 * the route layer when Redis is unavailable.
 */
export class AuthRateLimiter {
  private readonly redis: RedisClient;
  private readonly ready: Promise<void>;

  constructor(redisUrl: string) {
    this.redis = new RedisClient(redisUrl, {
      connectionTimeout: 5000,
      maxRetries: 3,
      enableOfflineQueue: false,
    });
    this.ready = this.redis.connect();
  }

  async hit(
    bucket: string,
    subject: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    await this.ready;
    const key = `bazarbee:auth-rate:${bucket}:${createHash("sha256")
      .update(subject)
      .digest("hex")}`;
    const count = Number(await this.redis.send("INCR", [key]));
    if (count === 1) {
      await this.redis.send("EXPIRE", [key, String(windowSeconds)]);
    }
    const ttl = Number(await this.redis.send("TTL", [key]));
    return {
      allowed: count <= limit,
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  async ping(): Promise<boolean> {
    await this.ready;
    return (await this.redis.send("PING", [])) === "PONG";
  }
}
