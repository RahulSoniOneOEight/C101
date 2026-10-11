import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export interface OperationsSnapshotResponse {
  counts: {
    orders: number;
    products: number;
    sellers: number;
    offers: number;
  };
  sources: {
    commerce: "medusa";
    marketplace: "mercur";
  };
  observed_at: string;
  test_data: true;
}

async function entityCount(query: any, entity: string): Promise<number> {
  const result = await query.graph({
    entity,
    fields: ["id"],
    pagination: { skip: 0, take: 1 },
  });
  return Number(result.metadata?.count ?? result.data.length);
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<OperationsSnapshotResponse>,
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const [orders, products, sellers, offers] = await Promise.all([
    entityCount(query, "order"),
    entityCount(query, "product"),
    entityCount(query, "seller"),
    entityCount(query, "offer"),
  ]);
  res.json({
    counts: { orders, products, sellers, offers },
    sources: { commerce: "medusa", marketplace: "mercur" },
    observed_at: new Date().toISOString(),
    test_data: true,
  });
}
