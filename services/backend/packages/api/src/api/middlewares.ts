import { PolicyOperation } from "@medusajs/framework/utils";
import { defineMiddlewares } from "@medusajs/medusa";

const routes = [
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
  // Mercur 2.3 supports route policies at runtime. The app still carries the older
  // Medusa middleware declaration, so keep this compatibility cast local.
];

export default defineMiddlewares(routes as never);
