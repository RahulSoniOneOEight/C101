import { randomUUID } from "node:crypto";

/**
 * Simulated OTP flow for the pilot. No provider, no real SMS. A fixed test code is accepted for any
 * allowlisted pilot user, and a short-lived in-memory session is returned on verify. This is dummy
 * identity and must be replaced by a real IdP/OTP provider before production.
 */

const FIXED_CODE = "123456";

interface Challenge {
  code: string;
  userId: string;
  expiresAt: number;
}

interface Session {
  userId: string;
  expiresAt: number;
}

const challenges = new Map<string, Challenge>();
const sessions = new Map<string, Session>();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;

export function issueChallenge(userId: string): { challenge_id: string; code: string; expires_in_seconds: number } {
  const challengeId = randomUUID();
  challenges.set(challengeId, {
    code: FIXED_CODE,
    userId,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return { challenge_id: challengeId, code: FIXED_CODE, expires_in_seconds: CHALLENGE_TTL_MS / 1000 };
}

export function verifyChallenge(
  challengeId: string,
  code: string,
): { session_token: string; user_id: string } | null {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.expiresAt < Date.now()) {
    challenges.delete(challengeId);
    return null;
  }
  if (challenge.code !== code) {
    return null;
  }
  challenges.delete(challengeId);
  const token = randomUUID();
  sessions.set(token, { userId: challenge.userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return { session_token: token, user_id: challenge.userId };
}

export function resolveSession(token: string): string | null {
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.userId;
}
