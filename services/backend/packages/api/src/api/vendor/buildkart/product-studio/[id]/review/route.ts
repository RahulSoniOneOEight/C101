import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/core-flows";
import { recordProductAuditChangeWorkflow } from "@mercurjs/core/workflows";
import { ProductChangeActionType, ProductStatus } from "@mercurjs/types";
import {
  StudioError,
  loadStudioProduct,
  studioErrorResponse,
} from "../../../../../../lib/product-studio";
import { vendorSellerId } from "../../../../../../lib/vendor-seller";
import { hasPermission } from "../../../../../../lib/rbac";

type ReviewBody = {
  action?: "submit" | "withdraw";
  reason?: string;
  internal_note?: string;
};

async function setStatus(
  scope: AuthenticatedMedusaRequest["scope"],
  actorId: string,
  productId: string,
  status: string,
  note: string,
) {
  await updateProductsWorkflow(scope).run({
    input: {
      selector: { id: productId },
      update: { status } as never,
    },
  });
  await recordProductAuditChangeWorkflow(scope).run({
    input: {
      actor_id: actorId,
      changes: [
        {
          product_id: productId,
          internal_note: note,
          actions: [
            {
              product_id: productId,
              action: ProductChangeActionType.STATUS_CHANGE,
              details: { status },
            },
          ],
        },
      ],
    },
  });
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  try {
    const sellerId = vendorSellerId(req);
    if (!sellerId) {
      throw new StudioError(401, "Seller authentication required.");
    }
    const body = (req.body ?? {}) as ReviewBody;
    const action = body.action;
    if (action !== "submit" && action !== "withdraw") {
      throw new StudioError(422, "Action must be submit or withdraw.");
    }
    const permission = action === "submit" ? "listing.submit" : "listing.update";
    if (!hasPermission(req, permission)) {
      throw new StudioError(403, `Missing permission: ${permission}.`);
    }

    const { product } = await loadStudioProduct(
      req.scope,
      "vendor",
      sellerId,
      req.params.id,
    );
    const status = String(product.status);

    if (action === "submit") {
      if (status !== "draft") {
        throw new StudioError(409, "Only a draft listing can be submitted.");
      }
      if (!product.review.ready) {
        throw new StudioError(
          422,
          `Listing is not ready: ${product.review.checks
            .filter((check: { required: boolean; ok: boolean }) => check.required && !check.ok)
            .map((check: { label: string }) => check.label)
            .join(", ")}.`,
        );
      }
      await setStatus(
        req.scope,
        sellerId,
        req.params.id,
        ProductStatus.PROPOSED,
        body.internal_note ?? "Seller submitted listing for review",
      );
    } else {
      if (status !== "proposed") {
        throw new StudioError(409, "Only a proposed listing can be withdrawn.");
      }
      await setStatus(
        req.scope,
        sellerId,
        req.params.id,
        ProductStatus.DRAFT,
        body.reason ?? "Seller withdrew listing from review",
      );
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "status"],
      filters: { id: req.params.id },
    });
    res.json({ product: data?.[0], action });
  } catch (error) {
    const { status, body } = studioErrorResponse(error);
    res.status(status).json(body as never);
  }
}
