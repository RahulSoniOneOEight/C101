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
  phone: string;
  name: string;
}

export const pilotUsers: PilotUser[] = [
  { id: "pilot_01", email: "pilot1@buildkart.test", phone: "+919000000001", name: "Pilot User One" },
  { id: "pilot_02", email: "pilot2@buildkart.test", phone: "+919000000002", name: "Pilot User Two" },
  { id: "pilot_03", email: "pilot3@buildkart.test", phone: "+919000000003", name: "Pilot User Three" },
];

/** Resolve a pilot user by email or phone; undefined when not allowlisted. */
export function findPilotUser(identifier: string): PilotUser | undefined {
  const normalized = identifier.trim().toLowerCase();
  return pilotUsers.find(
    (u) => u.email.toLowerCase() === normalized || u.phone === normalized,
  );
}
