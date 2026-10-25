import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  loadStudioProduct,
  saveStudioProduct,
  studioErrorResponse,
  type StudioSaveInput,
} from "../../../../../lib/product-studio";
import { hasPermission } from "../../../../../lib/rbac";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  try {
    const result = await loadStudioProduct(
      req.scope,
      "admin",
      null,
      req.params.id,
    );
    res.json(result);
  } catch (error) {
    console.error("[product-studio] load failed", error);
    const { status, body } = studioErrorResponse(error);
    res.status(status).json(body as never);
  }
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
    const result = await saveStudioProduct(
      req.scope,
      "admin",
      actorId,
      null,
      req.params.id,
      input,
    );
    res.json(result);
  } catch (error) {
    const { status, body } = studioErrorResponse(error);
    res.status(status).json(body as never);
  }
}
