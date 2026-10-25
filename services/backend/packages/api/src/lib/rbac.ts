import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";

/**
 * BuildKart permission model.
 *
 * Mercur native RBAC is not enabled as the source of truth for the BuildKart
 * boundary. These templates are enforced at the BuildKart route and service
 * boundary, with seller scope derived from the authenticated seller context.
 */

export const BUILDKART_PERMISSIONS = [
  "catalogue.read",
  "listing.create",
  "listing.update",
  "listing.submit",
  "listing.pause",
  "listing.restore",
  "price.read",
  "price.update",
  "b2b-price.update",
  "inventory.read",
  "inventory-adjustment.submit",
  "inventory-adjustment.read",
  "inventory-adjustment.post",
  "inventory-reconciliation.read",
  "inventory-reconciliation.resolve",
  "order.read",
  "order.fulfil",
  "delivery.update",
  "return.read",
  "return.respond",
  "master-product.create",
  "master-product.update",
  "master-product.approve",
  "specification.standardize",
  "listing.approve",
  "listing.reject",
  "price.review",
  "price.override-hold",
  "acting-for-seller",
  "merchandising.read",
  "merchandising.update",
  "seller.read",
  "offer.read",
  "offer.update",
  "offer.approve",
  "allocation.read",
  "delivery.read",
  "activity.review",
  "activity.assign",
  "payment.read",
  "payment-evidence.record",
  "refund.approve",
  "refund.execute",
  "reconciliation.read",
  "activity.read",
] as const;

export type BuildkartPermission = (typeof BUILDKART_PERMISSIONS)[number];

export const BUILDKART_ROLES = [
  "seller_admin",
  "catalogue_admin",
  "marketplace_admin",
  "finance",
  "erp_operator",
  "support",
  "super_admin",
] as const;

export type BuildkartRole = (typeof BUILDKART_ROLES)[number];

const sellerAdmin: BuildkartPermission[] = [
  "catalogue.read",
  "listing.create",
  "listing.update",
  "listing.submit",
  "listing.pause",
  "listing.restore",
  "price.read",
  "price.update",
  "b2b-price.update",
  "inventory.read",
  "inventory-adjustment.submit",
  "order.read",
  "payment.read",
  "order.fulfil",
  "delivery.update",
  "return.read",
  "return.respond",
];

const catalogueAdmin: BuildkartPermission[] = [
  ...sellerAdmin,
  "master-product.create",
  "master-product.update",
  "master-product.approve",
  "specification.standardize",
  "listing.approve",
  "listing.reject",
  "price.review",
  "price.override-hold",
  "acting-for-seller",
  "merchandising.read",
  "merchandising.update",
];

const marketplaceAdmin: BuildkartPermission[] = [
  "seller.read",
  "offer.read",
  "offer.update",
  "offer.approve",
  "allocation.read",
  "order.read",
  "payment.read",
  "delivery.read",
  "delivery.update",
  "return.read",
  "return.respond",
  "acting-for-seller",
  "activity.review",
  "activity.assign",
  "merchandising.read",
];

const finance: BuildkartPermission[] = [
  "payment.read",
  "payment-evidence.record",
  "refund.approve",
  "refund.execute",
  "reconciliation.read",
];

const erpOperator: BuildkartPermission[] = [
  "inventory.read",
  "inventory-adjustment.read",
  "inventory-adjustment.post",
  "inventory-reconciliation.read",
  "inventory-reconciliation.resolve",
];

const support: BuildkartPermission[] = [
  "order.read",
  "payment.read",
  "payment-evidence.record",
  "delivery.read",
  "return.read",
  "activity.read",
];

const superAdmin: BuildkartPermission[] = [...BUILDKART_PERMISSIONS];

export const ROLE_TEMPLATES: Record<
  BuildkartRole,
  { permissions: BuildkartPermission[]; scope: string }
> = {
  seller_admin: { permissions: sellerAdmin, scope: "own-seller" },
  catalogue_admin: { permissions: catalogueAdmin, scope: "cross-seller" },
  marketplace_admin: { permissions: marketplaceAdmin, scope: "cross-seller" },
  finance: { permissions: finance, scope: "finance" },
  erp_operator: { permissions: erpOperator, scope: "erp" },
  support: { permissions: support, scope: "read-evidence" },
  super_admin: { permissions: superAdmin, scope: "administrative" },
};

const SELLER_ROLE_MAP: Record<string, BuildkartRole> = {
  role_seller_administration: "seller_admin",
  seller_admin: "seller_admin",
};

export function permissionsForRoles(roles: string[]): Set<BuildkartPermission> {
  const permissions = new Set<BuildkartPermission>();
  for (const role of roles) {
    const template = ROLE_TEMPLATES[role as BuildkartRole];
    if (!template) continue;
    for (const permission of template.permissions) permissions.add(permission);
  }
  return permissions;
}

export function resolveActorRoles(req: AuthenticatedMedusaRequest): string[] {
  const sellerRole = (
    req as AuthenticatedMedusaRequest & {
      seller_context?: { seller_member?: { role_id?: string | null } };
    }
  ).seller_context?.seller_member?.role_id;
  if (sellerRole && SELLER_ROLE_MAP[sellerRole]) {
    return [SELLER_ROLE_MAP[sellerRole]];
  }

  const auth = req.auth_context as
    | {
        actor_type?: string;
        app_metadata?: { buildkart_roles?: unknown };
        roles?: unknown;
      }
    | undefined;
  const configured = auth?.app_metadata?.buildkart_roles ?? auth?.roles;
  if (Array.isArray(configured)) {
    return configured.filter((role): role is string => typeof role === "string");
  }
  // Staging bridge: a Medusa admin user without an explicit BuildKart role
  // mapping is treated as super admin. Production must set explicit mappings.
  if (auth?.actor_type === "user") return ["super_admin"];
  return [];
}

export function hasPermission(
  req: AuthenticatedMedusaRequest,
  permission: BuildkartPermission,
): boolean {
  return permissionsForRoles(resolveActorRoles(req)).has(permission);
}

export function isSellerScoped(req: AuthenticatedMedusaRequest): boolean {
  return Boolean(
    (
      req as AuthenticatedMedusaRequest & {
        seller_context?: { seller_id?: string | null };
      }
    ).seller_context?.seller_id,
  );
}

export function canActForSeller(req: AuthenticatedMedusaRequest): boolean {
  return !isSellerScoped(req) && hasPermission(req, "acting-for-seller");
}

export function permissionDenied(permission: BuildkartPermission): string {
  return `Missing permission: ${permission}.`;
}
