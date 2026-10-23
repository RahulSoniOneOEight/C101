import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { hasPermission } from "../../../../lib/rbac";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "seller.read") && !hasPermission(req, "acting-for-seller")) {
    res.status(403).json({ message: "Missing seller read permission." } as never);
    return;
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "deleted_at"],
    filters: { deleted_at: null },
  });
  const rows = (data ?? []) as Array<{
    id: string;
    name?: string;
    deleted_at?: string | Date | null;
  }>;
  res.json({
    sellers: rows
      .filter((seller) => !seller.deleted_at)
      .map((seller) => ({
        id: seller.id,
        name: seller.name ?? seller.id,
      })),
  });
}
