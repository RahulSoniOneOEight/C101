import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { hasPermission } from "../../../../../lib/rbac";

/**
 * Per-order COD commission override. The Experience API owns the rule and reprices the
 * order's ledger rows when cash was already collected.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<Record<string, unknown>>,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "reconciliation.read")) {
    res.status(403).json({ message: "Missing permission: finance." } as never);
    return;
  }
  const result = await experienceAdminFetch("/v1/admin/cod/commission", {
    method: "POST",
    actorId: req.auth_context?.actor_id,
    body: req.body ?? {},
  });
  res.status(result.status).json(result.body as never);
}

/** Clear the override and fall back to the seller policy rate. */
export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "reconciliation.read")) {
    res.status(403).json({ message: "Missing permission: finance." } as never);
    return;
  }
  const params = new URLSearchParams();
  if (typeof req.query.order_group_id === "string") {
    params.set("order_group_id", req.query.order_group_id);
  }
  if (typeof req.query.seller_id === "string") {
    params.set("seller_id", req.query.seller_id);
  }
  const result = await experienceAdminFetch("/v1/admin/cod/commission", {
    method: "DELETE",
    actorId: req.auth_context?.actor_id,
    query: params.toString() || undefined,
  });
  res.status(result.status).json(result.body as never);
}
