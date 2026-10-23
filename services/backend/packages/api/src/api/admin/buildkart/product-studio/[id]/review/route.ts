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
import { resolveActingFor } from "../../../../../../lib/acting-for";
import { hasPermission, type BuildkartPermission } from "../../../../../../lib/rbac";

type ReviewBody = {
  action?:
    | "submit"
    | "approve"
    | "reject"
    | "request-changes"
    | "reopen"
    | "unpublish"
    | "pause"
    | "archive"
    | "restore";
  message?: string;
  reason?: string;
  internal_note?: string;
  acting_for_seller_id?: string | null;
  reference?: string | null;
  correlation_id?: string | null;
  expected_version?: string | null;
};

async function setStatus(
  scope: AuthenticatedMedusaRequest["scope"],
  actorId: string,
  productId: string,
  status: string,
  note: string,
  metadata?: Record<string, unknown>,
) {
  await updateProductsWorkflow(scope).run({
    input: {
      selector: { id: productId },
      update: {
        status,
        ...(metadata ? { metadata } : {}),
      } as never,
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
              details: {
                status,
                ...(metadata?.lifecycle_state
                  ? { lifecycle_state: metadata.lifecycle_state }
                  : {}),
              },
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

    const permissionByAction: Record<string, BuildkartPermission> = {
      submit: "listing.submit",
      approve: "listing.approve",
      reject: "listing.reject",
      "request-changes": "listing.approve",
      reopen: "listing.restore",
      unpublish: "listing.pause",
      pause: "listing.pause",
      archive: "listing.pause",
      restore: "listing.restore",
    };
    const permission = permissionByAction[action];
    if (!permission || !hasPermission(req, permission)) {
      throw new StudioError(
        403,
        `Missing permission: ${permission ?? "unknown action"}.`,
      );
    }

    const acting = await resolveActingFor(req.scope, req, body);
    const { product } = await loadStudioProduct(
      req.scope,
      "admin",
      null,
      req.params.id,
    );
    const status = String(product.status);
    if (
      acting &&
      !(product.offers ?? []).some(
        (offer: { seller_id?: string }) => offer.seller_id === acting.sellerId,
      )
    ) {
      throw new StudioError(
        403,
        "The acting-for seller does not own an offer on this product.",
      );
    }
    const actingNote = acting
      ? ` [acting_for=${acting.sellerId} reason=${acting.reason} reference=${
          acting.reference ?? "-"
        } correlation=${acting.correlationId}]`
      : "";

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
        (body.internal_note ?? "Product submitted for review") + actingNote,
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
            (body.internal_note ??
              body.reason ??
              "Approved from Product Studio") + actingNote,
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
      if (status !== "proposed" && status !== "published") {
        throw new StudioError(
          409,
          "Only a proposed or published product can receive a change request.",
        );
      }
      if (status === "published") {
        const message =
          body.message ?? body.reason ?? "Changes requested from Product Studio";
        await setStatus(
          req.scope,
          actorId,
          req.params.id,
          ProductStatus.DRAFT,
          message,
          {
            ...(product.metadata ?? {}),
            lifecycle_state: "changes_requested",
            lifecycle_changed_at: new Date().toISOString(),
            lifecycle_reason: message,
          },
        );
      } else {
        await requestProductChangeWorkflow(req.scope).run({
          input: {
            product_id: req.params.id,
            message:
              body.message ?? body.reason ?? "Changes requested from Product Studio",
            actor_id: actorId,
          },
        });
      }
    } else if (action === "unpublish" || action === "pause" || action === "archive") {
      if (action !== "archive" && status !== "published") {
        throw new StudioError(
          409,
          "Only a published product can be unpublished or paused.",
        );
      }
      if (status === "draft" || status === "proposed") {
        throw new StudioError(
          409,
          "Use Reopen or Restore before archiving a draft.",
        );
      }
      const lifecycleState =
        action === "unpublish"
          ? "unpublished"
          : action === "pause"
            ? "paused"
            : "archived";
      const note =
        (body.reason ??
          body.internal_note ??
          `Product ${lifecycleState} from Product Studio`) + actingNote;
      await setStatus(
        req.scope,
        actorId,
        req.params.id,
        ProductStatus.DRAFT,
        note,
        {
          ...(product.metadata ?? {}),
          lifecycle_state: lifecycleState,
          lifecycle_changed_at: new Date().toISOString(),
          lifecycle_reason: note,
        },
      );
    } else if (action === "restore") {
      const lifecycleState = String(product.lifecycle_state ?? "");
      if (!["paused", "archived", "unpublished", "changes_requested"].includes(lifecycleState)) {
        throw new StudioError(
          409,
          "Only a paused, archived, unpublished or changes-requested product can be restored.",
        );
      }
      const note =
        (body.reason ?? "Product restored as a draft from Product Studio") +
        actingNote;
      await setStatus(
        req.scope,
        actorId,
        req.params.id,
        ProductStatus.DRAFT,
        note,
        {
          ...(product.metadata ?? {}),
          lifecycle_state: "restored",
          lifecycle_changed_at: new Date().toISOString(),
          lifecycle_reason: note,
        },
      );
    } else if (action === "reopen") {
      if (status !== "rejected") {
        throw new StudioError(409, "Only a rejected product can be reopened.");
      }
      await setStatus(
        req.scope,
        actorId,
        req.params.id,
        ProductStatus.DRAFT,
        (body.reason ?? "Reopened from Product Studio") + actingNote,
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
