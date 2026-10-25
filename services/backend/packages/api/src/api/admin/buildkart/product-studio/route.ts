import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadStudioMeta,
  saveStudioProduct,
  studioErrorResponse,
  type StudioSaveInput,
} from "../../../../lib/product-studio";
import { hasPermission } from "../../../../lib/rbac";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const search = typeof req.query.q === "string" ? req.query.q : "";
  const meta = await loadStudioMeta(req.scope, "admin", null, search);
  res.json(meta);
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  try {
    const actorId =
      (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
      "system";
    const input = (req.body ?? {}) as StudioSaveInput;
    if (input.seller_id && !hasPermission(req, "acting-for-seller")) {
      res.status(403).json({ message: "Missing permission: acting-for-seller." } as never);
      return;
    }
    const { product } = await saveStudioProduct(
      req.scope,
      "admin",
      actorId,
      null,
      null,
      input,
    );
    res.status(201).json({ product });
  } catch (error) {
    const { status, body } = studioErrorResponse(error);
    res.status(status).json(body as never);
  }
}
