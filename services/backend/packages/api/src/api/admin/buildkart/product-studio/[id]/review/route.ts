import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/core-flows";
import {
  confirmProductsWorkflow,
  recordProductAuditChangeWorkflow,
  rejectProductWorkflow,
  requestProductChangeWorkflow,
} from "@mercurjs/core/workflows";
import { ProductChangeActionType, ProductStatus } from "@mercurjs/types";
import {
  StudioError,
  loadStudioProduct,
  studioErrorResponse,
} from "../../../../../../lib/product-studio";

type ReviewBody = {
  action?: "submit" | "approve" | "reject" | "request-changes" | "reopen";
  message?: string;
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
    const actorId =
      (req.auth_context as { actor_id?: string } | undefined)?.actor_id ??
      "admin_console";
    const body = (req.body ?? {}) as ReviewBody;
    const action = body.action;
    if (!action) {
      throw new StudioError(422, "A review action is required.");
    }

    const { product } = await loadStudioProduct(
      req.scope,
      "admin",
      null,
      req.params.id,
    );
    const status = String(product.status);

    if (action === "submit") {
      if (status !== "draft" && status !== "rejected") {
        throw new StudioError(409, "Only a draft or rejected product can be submitted.");
      }
      if (!product.review.ready) {
        throw new StudioError(
          422,
          `Product is not ready: ${product.review.checks
            .filter((check: { required: boolean; ok: boolean }) => check.required && !check.ok)
            .map((check: { label: string }) => check.label)
            .join(", ")}.`,
        );
      }
      await setStatus(
        req.scope,
        actorId,
        req.params.id,
        ProductStatus.PROPOSED,
        body.internal_note ?? "Product submitted for review",
      );
    } else if (action === "approve") {
      if (status !== "proposed") {
        throw new StudioError(409, "Only a proposed product can be approved.");
      }
      if (!product.review.ready) {
        throw new StudioError(
          422,
          "Product is no longer ready for approval. Re-check readiness.",
        );
      }
      await confirmProductsWorkflow(req.scope).run({
        input: {
          product_ids: [req.params.id],
          actor_id: actorId,
          internal_note:
            body.internal_note ??
            body.reason ??
            "Approved from Product Studio",
        },
      });
    } else if (action === "reject") {
      if (status !== "proposed") {
        throw new StudioError(409, "Only a proposed product can be rejected.");
      }
      await rejectProductWorkflow(req.scope).run({
        input: {
          product_id: req.params.id,
          message: body.message ?? body.reason ?? "Rejected from Product Studio",
          actor_id: actorId,
        },
      });
    } else if (action === "request-changes") {
      if (status !== "proposed") {
        throw new StudioError(
          409,
          "Only a proposed product can receive a change request.",
        );
      }
      await requestProductChangeWorkflow(req.scope).run({
        input: {
          product_id: req.params.id,
          message:
            body.message ?? body.reason ?? "Changes requested from Product Studio",
          actor_id: actorId,
        },
      });
    } else if (action === "reopen") {
      if (status !== "rejected") {
        throw new StudioError(409, "Only a rejected product can be reopened.");
      }
      await setStatus(
        req.scope,
        actorId,
        req.params.id,
        ProductStatus.DRAFT,
        body.reason ?? "Reopened from Product Studio",
      );
    } else {
      throw new StudioError(422, `Unknown review action "${action}".`);
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
