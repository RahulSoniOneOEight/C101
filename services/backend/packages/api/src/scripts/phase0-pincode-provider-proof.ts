/**
 * Phase 0 proof for B004/U-009.
 *
 * This exercises the same inputs Medusa's calculated-shipping workflow builds:
 *   optionData = shipping_option.data  -> { seller_id }
 *   context    = { ...cart }           -> shipping_address.postal_code
 *
 * Run with: bun run src/scripts/phase0-pincode-provider-proof.ts
 */
import { PincodeDeliveryProviderService } from "../modules/delivery-rates/provider";

async function main() {
  const calls: Array<[string, string]> = [];
  const provider = new PincodeDeliveryProviderService({
    delivery_rates: {
      resolveFee: async (sellerId: string, pincode: string) => {
        calls.push([sellerId, pincode]);
        return sellerId === "sel_123" && pincode === "302001" ? 2900 : 9900;
      },
    } as never,
  });

  const price = await provider.calculatePrice(
    { seller_id: "sel_123" },
    {},
    {
      id: "cart_phase0",
      shipping_address: { postal_code: "302001" },
      items: [],
    },
  );

  if (price.calculated_amount !== 2900) {
    throw new Error(`Expected 2900, received ${price.calculated_amount}`);
  }
  if (calls[0]?.[0] !== "sel_123" || calls[0]?.[1] !== "302001") {
    throw new Error(
      `Provider received the wrong context: ${JSON.stringify(calls)}`,
    );
  }

  let missingSellerBlocked = false;
  try {
    await provider.calculatePrice({}, {}, {
      shipping_address: { postal_code: "302001" },
    });
  } catch (error) {
    missingSellerBlocked = String(error).includes("seller_id");
  }
  if (!missingSellerBlocked) {
    throw new Error("Provider did not fail closed when seller_id was missing.");
  }

  const options = await provider.getFulfillmentOptions();
  if (options.length !== 1 || options[0].id !== "pincode-delivery") {
    throw new Error(`Unexpected fulfillment options: ${JSON.stringify(options)}`);
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        provider: "pincode",
        canCalculate: await provider.canCalculate(),
        option: options[0],
        received: { seller_id: calls[0]?.[0], pincode: calls[0]?.[1] },
        calculated_amount: price.calculated_amount,
        missing_seller_blocked: missingSellerBlocked,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
