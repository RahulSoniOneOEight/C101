import type { AccessJwtVerifier } from "./ops-access-jwt.js";
import type { OpsSessionStore } from "./ops-session.js";
import type { OpsStaffStore } from "./ops-staff.js";

/**
 * The ops gate decision.
 *
 * `204` lets nginx serve the request. `401` sends the user to TOTP login/enrolment. `403` denies a
 * non-staff or disabled identity. `423` marks a locked account.
 *
 * In `shadow` mode every decision is still evaluated, but only `204` is returned; the would-be
 * denial is logged so enforcement can be enabled after evidence is collected.
 */

export type OpsGateMode = "off" | "shadow" | "enforce";

export const OPS_SESSION_COOKIE = "bz_ops_session";

export interface OpsGateDecision {
  status: number;
  next?: "/ops/login" | "/ops/enroll";
  reason: string;
  shadow?: {
    wouldBeStatus: number;
    wouldBeNext?: string;
    reason: string;
  };
}

export interface OpsGateInput {
  accessJwt: string | null;
  sessionToken: string | null;
}

export interface OpsGateDependencies {
  mode: OpsGateMode;
  staff: Pick<OpsStaffStore, "get">;
  sessions: Pick<OpsSessionStore, "resolveSession">;
  verifier: Pick<AccessJwtVerifier, "verify">;
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

export class OpsGate {
  private readonly mode: OpsGateMode;
  private readonly staff: OpsGateDependencies["staff"];
  private readonly sessions: OpsGateDependencies["sessions"];
  private readonly verifier: OpsGateDependencies["verifier"];
  private readonly now: () => number;
  private readonly log: (event: Record<string, unknown>) => void;

  constructor(dependencies: OpsGateDependencies) {
    this.mode = dependencies.mode;
    this.staff = dependencies.staff;
    this.sessions = dependencies.sessions;
    this.verifier = dependencies.verifier;
    this.now = dependencies.now ?? (() => Date.now());
    this.log = dependencies.log ?? ((event) => console.info(JSON.stringify(event)));
  }

  private async decide(input: OpsGateInput): Promise<OpsGateDecision> {
    const verified = await this.verifier.verify(input.accessJwt);
    if (!verified.ok) {
      return { status: 401, reason: `access-jwt-${verified.reason}` };
    }
    const staff = await this.staff.get(verified.claims.email);
    if (!staff) {
      return { status: 403, reason: "staff-unknown" };
    }
    if (staff.status === "disabled") {
      return { status: 403, reason: "staff-disabled" };
    }
    if (staff.lockedUntil && new Date(staff.lockedUntil).getTime() > this.now()) {
      return { status: 423, reason: "staff-locked" };
    }
    if (!staff.totpEnrolled) {
      return { status: 401, next: "/ops/enroll", reason: "enrollment-required" };
    }
    const session = await this.sessions.resolveSession(input.sessionToken);
    if (!session || session.email !== staff.email) {
      return { status: 401, next: "/ops/login", reason: "totp-required" };
    }
    return { status: 204, reason: "allowed" };
  }

  async evaluate(input: OpsGateInput): Promise<OpsGateDecision> {
    if (this.mode === "off") return { status: 204, reason: "gate-off" };
    const decision = await this.decide(input);
    if (this.mode === "shadow" && decision.status !== 204) {
      this.log({
        event: "ops.gate.shadow_denial",
        reason: decision.reason,
        would_be_status: decision.status,
        would_be_next: decision.next ?? null,
      });
      return {
        status: 204,
        reason: "shadow",
        shadow: {
          wouldBeStatus: decision.status,
          wouldBeNext: decision.next,
          reason: decision.reason,
        },
      };
    }
    return decision;
  }
}
