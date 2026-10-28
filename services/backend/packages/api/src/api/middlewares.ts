import { validateAndTransformBody, validateAndTransformQuery } from "@medusajs/framework";
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { defineMiddlewares } from "@medusajs/medusa";
import { AdminGetSettlementStatementsParams } from "./admin/buildkart/settlement-statements/validators";
import {
  AdminGetCmsContent,
  AdminMutateCmsContent,
  AdminPreviewCmsContent,
} from "./admin/buildkart/content/validators";
import { ManualReturnStatus } from "./admin/buildkart/returns/[id]/status/validators";
import { ReturnInspection } from "./admin/buildkart/returns/[id]/inspection/validators";
import { RecordRefundSimulation } from "./admin/buildkart/returns/[id]/refund-simulation/validators";
import { ManualShipmentStatus } from "./admin/buildkart/shipments/[id]/status/validators";

const routes = [
  {
    method: ["POST"],
    matcher: "/admin/buildkart/shipments/:id/status",
    middlewares: [validateAndTransformBody(ManualShipmentStatus)],
  },
  {
    method: ["POST"],
    matcher: "/vendor/buildkart/shipments/:id/status",
    middlewares: [validateAndTransformBody(ManualShipmentStatus)],
  },
  {
    method: ["POST"],
    matcher: "/admin/buildkart/returns/:id/status",
    middlewares: [validateAndTransformBody(ManualReturnStatus)],
  },
  {
    method: ["POST"],
    matcher: "/vendor/buildkart/returns/:id/status",
    middlewares: [validateAndTransformBody(ManualReturnStatus)],
  },
  {
    method: ["POST"],
    matcher: "/admin/buildkart/returns/:id/inspection",
    middlewares: [validateAndTransformBody(ReturnInspection)],
  },
  {
    method: ["POST"],
    matcher: "/vendor/buildkart/returns/:id/inspection",
    middlewares: [validateAndTransformBody(ReturnInspection)],
  },
  {
    method: ["POST"],
    matcher: "/admin/buildkart/returns/:id/refund-simulation",
    middlewares: [validateAndTransformBody(RecordRefundSimulation)],
  },
  {
    method: ["GET"],
    matcher: "/admin/buildkart/content",
    middlewares: [
      validateAndTransformQuery(AdminGetCmsContent, {
        defaults: [],
        isList: true,
      }),
    ],
    policies: [
      {
        resource: "promotion",
        operation: PolicyOperation.read,
      },
    ],
  },
  {
    method: ["POST"],
    matcher: "/admin/buildkart/content",
    middlewares: [validateAndTransformBody(AdminMutateCmsContent)],
    policies: [
      {
        resource: "promotion",
        operation: PolicyOperation.update,
      },
    ],
  },
  {
    method: ["POST"],
    matcher: "/admin/buildkart/content/preview",
    middlewares: [validateAndTransformBody(AdminPreviewCmsContent)],
    policies: [
      {
        resource: "promotion",
        operation: PolicyOperation.read,
      },
    ],
  },
  {
    method: ["GET"],
    matcher: "/admin/buildkart/categories",
    policies: [
      {
        resource: "promotion",
        operation: PolicyOperation.read,
      },
    ],
  },
  {
    method: ["GET"],
    matcher: "/admin/buildkart/settlement-statements",
    middlewares: [
      validateAndTransformQuery(AdminGetSettlementStatementsParams, {
        defaults: [],
        isList: true,
      }),
    ],
    policies: [
      {
        resource: "commission_line",
        operation: PolicyOperation.read,
      },
    ],
  },
  {
    method: ["GET"],
    matcher: "/admin/buildkart/settlement-statements/:id",
    policies: [
      {
        resource: "commission_line",
        operation: PolicyOperation.read,
      },
    ],
  },
  {
    method: ["GET"],
    matcher: "/admin/buildkart/merchandising-presets",
    policies: [
      {
        resource: "promotion",
        operation: PolicyOperation.read,
      },
    ],
  },
  {
    method: ["GET"],
    matcher: "/admin/buildkart/merchandising-offers",
    policies: [
      {
        resource: "promotion",
        operation: PolicyOperation.read,
      },
    ],
  },
  {
    // The native vendor edit-price route writes an offer price ladder without
    // the BuildKart validation or activity event. Redirect that write path to
    // the canonical /vendor/buildkart/offers/:id/pricing facade.
    method: ["POST"],
    matcher: "/vendor/offers/:id",
    middlewares: [
      (
        req: MedusaRequest,
        res: MedusaResponse,
        next: MedusaNextFunction,
      ): void => {
        const body = req.body as { prices?: unknown } | undefined;
        if (Array.isArray(body?.prices)) {
          res.status(422).json({
            type: "pricing-facade-required",
            message:
              "Use the Seller pricing editor so the price ladder is validated and audited.",
          });
          return;
        }
        next();
      },
    ],
  },
  // Mercur 2.3 supports route policies at runtime. The app still carries the older
  // Medusa middleware declaration, so keep this compatibility cast local.
];

export default defineMiddlewares(routes as never);
