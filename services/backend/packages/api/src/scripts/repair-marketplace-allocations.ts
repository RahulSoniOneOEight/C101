import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { publishOrderGroupAllocations } from "../subscribers/publish-marketplace-allocations";

/**
 * Staging repair path for order groups whose allocation publication failed during rollout.
 *
 * Usage:
 *   REPAIR_ORDER_GROUP_IDS=og_...,og_... npm run repair:marketplace-allocations
 *
 * It reuses the same projection and deterministic event IDs as the subscriber, so it cannot create a
 * second allocation for an order group that was already published successfully.
 */
export default async function repairMarketplaceAllocations({
  container,
}: ExecArgs): Promise<void> {
  if (process.env.BUILDKART_ENVIRONMENT?.trim().toLowerCase() !== "staging") {
    throw new Error(
      "Marketplace allocation repair is staging-only and requires BUILDKART_ENVIRONMENT=staging.",
    );
  }
  const ids = (process.env.REPAIR_ORDER_GROUP_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    throw new Error(
      "REPAIR_ORDER_GROUP_IDS must list one or more order-group IDs.",
    );
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  for (const orderGroupId of ids) {
    await publishOrderGroupAllocations(container, orderGroupId);
    logger.info(
      `[marketplace-allocation] repaired order_group=${orderGroupId}`,
    );
  }
}
