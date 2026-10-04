import { ExecArgs } from "@medusajs/framework/types";
import {
  createApiKeysWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Creates a publishable API key for the staging storefront and prints its token once.
 * The token is only returned at creation; it is not recoverable later.
 */
export default async function createPublishableKey({ container }: ExecArgs) {
  const query = container.resolve("query");

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  });

  const {
    result: [key],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "BuildKart Staging Storefront",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });

  const defaultChannel = channels[0];
  if (defaultChannel) {
    try {
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: key.id, add: [defaultChannel.id] },
      });
    } catch (error: unknown) {
      if (!(error instanceof Error && error.message.includes("already"))) {
        throw error;
      }
    }
  }

  console.log("PUBLISHABLE_ID=" + key.id);
  console.log("PUBLISHABLE_TOKEN=" + key.token);
  console.log("SALES_CHANNEL=" + (defaultChannel?.id ?? "none"));
}
