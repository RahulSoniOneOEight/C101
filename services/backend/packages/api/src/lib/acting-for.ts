import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MedusaError } from "@medusajs/framework/utils";
import { canActForSeller, isSellerScoped } from "./rbac";

export interface ActingForInput {
  acting_for_seller_id?: string | null;
  reason?: string | null;
  reference?: string | null;
  expected_version?: string | null;
}

export interface ActingForContext {
  actorUserId: string;
  actorRole: string;
  sellerId: string;
  reason: string;
  reference: string | null;
  correlationId: string;
  expectedVersion: string | null;
}

export function requestCorrelationId(
  req: AuthenticatedMedusaRequest,
  fallback?: string,
): string {
  const header = req.headers["x-correlation-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const body = (req.body ?? {}) as { correlation_id?: string };
  if (typeof body.correlation_id === "string" && body.correlation_id.trim()) {
    return body.correlation_id.trim();
  }
  return fallback ?? `c101_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function resolveActingFor(
  scope: AuthenticatedMedusaRequest["scope"],
  req: AuthenticatedMedusaRequest,
  input: ActingForInput,
): Promise<ActingForContext | null> {
  const requestedSeller = input.acting_for_seller_id?.trim() || null;
  if (!requestedSeller) return null;

  if (isSellerScoped(req)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "A seller user cannot act for another seller.",
    );
  }
  if (!canActForSeller(req)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Acting for a seller is not permitted for this actor.",
    );
  }
  const reason = input.reason?.trim() || "";
  if (!reason) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A reason is required when acting for a seller.",
    );
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "deleted_at"],
    filters: { id: requestedSeller },
  });
  const seller = sellers?.[0] as
    | { id: string; name?: string; deleted_at?: string | null }
    | undefined;
  if (!seller || seller.deleted_at) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The selected acting-for seller is not active.",
    );
  }

  const auth = req.auth_context as { actor_id?: string; actor_type?: string };
  return {
    actorUserId: auth?.actor_id ?? "admin_console",
    actorRole: auth?.actor_type ?? "user",
    sellerId: requestedSeller,
    reason,
    reference: input.reference?.trim() || null,
    correlationId: requestCorrelationId(req),
    expectedVersion: input.expected_version?.trim() || null,
  };
}

export function assertExpectedVersion(
  actual: string | null | undefined,
  expected: string | null | undefined,
): void {
  if (!expected) return;
  if (!actual || actual !== expected) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "The entity was modified by another request. Reload and retry.",
    );
  }
}
