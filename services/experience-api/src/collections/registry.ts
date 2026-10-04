/**
 * Dynamic collection registry — governed definitions only. Each collection references its source;
 * the resolver fetches from the owning service. This registry never computes rankings itself.
 */

export type CollectionStatus = "enabled" | "disabled" | "deferred";

export interface CollectionDefinition {
  collection_key: string;
  type: "dynamic" | "manual";
  source: string;
  parameters: Record<string, unknown>;
  fallback: { collection_key: string } | null;
  enabled: boolean;
  status: CollectionStatus;
}

export const collections: CollectionDefinition[] = [
  {
    collection_key: "recently_viewed",
    type: "dynamic",
    source: "local_history",
    parameters: { limit: 12 },
    fallback: { collection_key: "new_arrivals" },
    enabled: true,
    status: "enabled",
  },
  {
    collection_key: "best_sellers",
    type: "dynamic",
    source: "sales_analytics",
    parameters: { period_days: 30, limit: 12, sort: "net_units_sold_desc" },
    fallback: { collection_key: "new_arrivals" },
    enabled: false,
    status: "deferred",
  },
  {
    collection_key: "buy_again",
    type: "dynamic",
    source: "medusa_customer_orders",
    parameters: { limit: 12, deduplicate: true },
    fallback: { collection_key: "new_arrivals" },
    enabled: false,
    status: "deferred",
  },
  {
    collection_key: "new_arrivals",
    type: "dynamic",
    source: "medusa_products",
    parameters: { order_by: "created_at", direction: "desc", limit: 12 },
    fallback: null,
    enabled: true,
    status: "enabled",
  },
  {
    collection_key: "manual",
    type: "manual",
    source: "registry",
    parameters: { product_ids: [] },
    fallback: { collection_key: "new_arrivals" },
    enabled: true,
    status: "enabled",
  },
  {
    collection_key: "related",
    type: "dynamic",
    source: "medusa_products",
    parameters: { strategy: "shared_category_tags", limit: 12 },
    fallback: { collection_key: "new_arrivals" },
    enabled: true,
    status: "enabled",
  },
];

export function getCollection(key: string): CollectionDefinition | undefined {
  return collections.find((c) => c.collection_key === key);
}
