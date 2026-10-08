/**
 * Pilot user allowlist — dummy identity for select-user testing.
 *
 * OTP, payment and delivery are simulated for the pilot; this module seeds a fixed set of pilot
 * buyers and gates authentication to them. This is not a real identity system and must be replaced
 * by a real IdP before production.
 */

export interface PilotUser {
  id: string;
  email: string;
  username?: string;
  phone?: string;
  name: string;
}

export const syntheticPilotUsers: PilotUser[] = [
  { id: "pilot_01", email: "pilot1@buildkart.test", phone: "+919000000001", name: "Pilot User One" },
  { id: "pilot_02", email: "pilot2@buildkart.test", phone: "+919000000002", name: "Pilot User Two" },
  { id: "pilot_03", email: "pilot3@buildkart.test", phone: "+919000000003", name: "Pilot User Three" },
];

function requiredString(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`PILOT_USERS_JSON entry ${index} requires non-empty ${field}.`);
  }
  return value.trim();
}

/**
 * Parse the deployment-supplied pilot allowlist. The synthetic three-user list remains the local
 * default; hosted staging sets PILOT_USERS_JSON and PILOT_EXPECTED_USER_COUNT=20 without committing
 * tester identities to Git.
 */
export function loadPilotUsers(raw: string | undefined, expectedCount?: number): PilotUser[] {
  let users = syntheticPilotUsers;
  if (raw?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("PILOT_USERS_JSON must be a valid JSON array.");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("PILOT_USERS_JSON must be a JSON array.");
    }
    users = parsed.map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`PILOT_USERS_JSON entry ${index} must be an object.`);
      }
      const value = entry as Record<string, unknown>;
      const email = requiredString(value.email, "email", index).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error(`PILOT_USERS_JSON entry ${index} has an invalid email.`);
      }
      return {
        id: requiredString(value.id, "id", index),
        email,
        name: requiredString(value.name, "name", index),
        ...(typeof value.username === "string" && value.username.trim()
          ? { username: value.username.trim().toLowerCase() }
          : {}),
        ...(typeof value.phone === "string" && value.phone.trim()
          ? { phone: value.phone.trim() }
          : {}),
      };
    });
  }

  if (users.length < 1 || users.length > 20) {
    throw new Error(`Pilot allowlist must contain between 1 and 20 users; received ${users.length}.`);
  }
  if (expectedCount !== undefined && users.length !== expectedCount) {
    throw new Error(`Pilot allowlist must contain exactly ${expectedCount} users; received ${users.length}.`);
  }

  const identifiers = new Set<string>();
  for (const user of users) {
    for (const identifier of [user.id, user.email, user.username, user.phone].filter(Boolean) as string[]) {
      const normalized = identifier.toLowerCase();
      if (identifiers.has(normalized)) {
        throw new Error(`Duplicate pilot identifier: ${identifier}`);
      }
      identifiers.add(normalized);
    }
  }
  return users.map((user) => ({ ...user }));
}

export class PilotUserDirectory {
  private readonly byUserId: Map<string, PilotUser>;

  constructor(readonly users: PilotUser[]) {
    this.byUserId = new Map(users.map((user) => [user.id, user]));
  }

  /** Resolve a pilot user by email, username or phone; undefined when not allowlisted. */
  find(identifier: string): PilotUser | undefined {
    const normalized = identifier.trim().toLowerCase();
    return this.users.find(
      (user) =>
        user.email.toLowerCase() === normalized ||
        user.username?.toLowerCase() === normalized ||
        user.phone?.toLowerCase() === normalized,
    );
  }

  get(userId: string): PilotUser | undefined {
    return this.byUserId.get(userId);
  }
}
