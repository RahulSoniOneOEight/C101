import { validateAndTransformBody, validateAndTransformQuery } from "@medusajs/framework";
import { PolicyOperation } from "@medusajs/framework/utils";
import { defineMiddlewares } from "@medusajs/medusa";
import { AdminGetSettlementStatementsParams } from "./admin/buildkart/settlement-statements/validators";
import {
  AdminGetCmsContent,
  AdminMutateCmsContent,
} from "./admin/buildkart/content/validators";

const routes = [
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
  // Mercur 2.3 supports route policies at runtime. The app still carries the older
  // Medusa middleware declaration, so keep this compatibility cast local.
];

export default defineMiddlewares(routes as never);
