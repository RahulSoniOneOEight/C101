import { randomUUID } from "node:crypto";
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import {
  CmsUnavailableError,
  type CmsContentType,
} from "../../../../integrations/cms/client";

type OperationsRole = "operations_admin" | "merchandiser" | "merchandising_approver" | "auditor";
type CmsPermission = "content.view" | "content.edit" | "content.publish" | "audit.view";

const permissionsByRole: Record<OperationsRole, ReadonlySet<CmsPermission>> = {
  operations_admin: new Set(["content.view", "content.edit", "content.publish", "audit.view"]),
  merchandiser: new Set(["content.view", "content.edit"]),
  merchandising_approver: new Set(["content.view", "content.publish", "audit.view"]),
  auditor: new Set(["content.view", "audit.view"]),
};

const CONTENT_TYPES = new Set<CmsContentType>([
  "banners",
  "campaigns",
  "curated-collections",
  "storefront-layouts",
]);

export function cmsContentType(value: string): CmsContentType {
  if (!CONTENT_TYPES.has(value as CmsContentType)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Unsupported merchandising content type.");
  }
  return value as CmsContentType;
}

function actorRoles(actorId: string): OperationsRole[] {
  const serialized = process.env.BUILDKART_ADMIN_ROLE_ASSIGNMENTS_JSON?.trim();
  if (!serialized) return [];
  try {
    const assignments = JSON.parse(serialized) as Record<string, unknown>;
    const roles = assignments[actorId];
    if (!Array.isArray(roles)) return [];
    return roles.filter((role): role is OperationsRole =>
      typeof role === "string" && role in permissionsByRole,
    );
  } catch {
    return [];
  }
}

export function assertCmsPermission(
  req: AuthenticatedMedusaRequest,
  permission: CmsPermission,
): void {
  const actorId = req.auth_context.actor_id;
  if (!actorId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "An authenticated operator is required.");
  }
  const allowed = actorRoles(actorId).some((role) => permissionsByRole[role].has(permission));
  if (!allowed) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      `Operator does not have the required ${permission} permission.`,
    );
  }
}

export function cmsCommandContext(
  req: AuthenticatedMedusaRequest<{ reason: string; idempotency_key: string }>,
) {
  return {
    commandId: req.validatedBody.idempotency_key,
    correlationId: String(req.headers["x-correlation-id"] ?? randomUUID()),
    actorId: req.auth_context.actor_id,
    reason: req.validatedBody.reason,
  };
}

export function rethrowCmsError(error: unknown): never {
  if (error instanceof CmsUnavailableError) {
    const type = error.status === 404 ? MedusaError.Types.NOT_FOUND : MedusaError.Types.UNEXPECTED_STATE;
    throw new MedusaError(type, error.message);
  }
  throw error;
}
