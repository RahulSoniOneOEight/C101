import type { PilotUser } from "./pilot-users.js";

export const PILOT_ROLES = [
  "customer",
  "b2b_buyer",
  "b2b_account_admin",
  "b2b_approver",
  "seller_admin",
  "seller_catalog_manager",
  "seller_order_manager",
  "support_operator",
  "marketplace_operator",
  "erp_operator",
  "finance_operator",
  "super_admin",
] as const;

export type PilotRole = typeof PILOT_ROLES[number];

export interface PilotAuthorization {
  userId: string;
  roles: PilotRole[];
  businessAccountId?: string;
  sellerId?: string;
}

const roleSet = new Set<string>(PILOT_ROLES);

export function loadPilotAuthorizations(
  raw: string | undefined,
  users: PilotUser[],
  requireEveryUser: boolean,
): Map<string, PilotAuthorization> {
  const knownUsers = new Set(users.map((user) => user.id));
  const fallback = users.map((user) => ({ userId: user.id, roles: ["customer"] as PilotRole[] }));
  let values: unknown = fallback;
  if (raw?.trim()) {
    try {
      values = JSON.parse(raw);
    } catch {
      throw new Error("PILOT_ROLE_ASSIGNMENTS_JSON must be a valid JSON array.");
    }
  }
  if (!Array.isArray(values)) throw new Error("PILOT_ROLE_ASSIGNMENTS_JSON must be a JSON array.");

  const assignments = new Map<string, PilotAuthorization>();
  for (const [index, entry] of values.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Role assignment ${index} must be an object.`);
    }
    const item = entry as Record<string, unknown>;
    const userId = typeof item.userId === "string" ? item.userId.trim() : "";
    if (!knownUsers.has(userId)) throw new Error(`Role assignment references unknown user: ${userId || index}`);
    if (assignments.has(userId)) throw new Error(`Duplicate role assignment for ${userId}.`);
    if (!Array.isArray(item.roles) || item.roles.length < 1) {
      throw new Error(`Role assignment for ${userId} requires at least one role.`);
    }
    const roles = item.roles.map((role) => String(role)) as PilotRole[];
    for (const role of roles) {
      if (!roleSet.has(role)) throw new Error(`Unknown pilot role for ${userId}: ${role}`);
    }
    const businessAccountId = typeof item.businessAccountId === "string" && item.businessAccountId.trim()
      ? item.businessAccountId.trim()
      : undefined;
    const sellerId = typeof item.sellerId === "string" && item.sellerId.trim()
      ? item.sellerId.trim()
      : undefined;
    if (roles.some((role) => role.startsWith("b2b_")) && !businessAccountId) {
      throw new Error(`B2B role assignment for ${userId} requires businessAccountId.`);
    }
    if (roles.some((role) => role.startsWith("seller_")) && !sellerId) {
      throw new Error(`Seller role assignment for ${userId} requires sellerId.`);
    }
    assignments.set(userId, { userId, roles: [...new Set(roles)], businessAccountId, sellerId });
  }
  if (requireEveryUser && assignments.size !== users.length) {
    const missing = users.filter((user) => !assignments.has(user.id)).map((user) => user.id);
    throw new Error(`Every hosted pilot user requires a role assignment; missing: ${missing.join(", ")}`);
  }
  return assignments;
}

export function hasAnyRole(authorization: PilotAuthorization, allowed: readonly PilotRole[]): boolean {
  return authorization.roles.some((role) => allowed.includes(role));
}
