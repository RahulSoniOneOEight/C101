/**
 * Phase 0 proof for B004/U-009 (provider contract only).
 *
 * The live end-to-end proof runs in the preview container via
 * `src/scripts/u009-live-gate.ts`. This script checks the provider's
 * fail-closed contract without a database:
 *   - fee comes from the hook-injected context for the option's seller
 *   - missing seller fee falls back to Rs 99
 *   - missing seller_id fails closed
 *   - missing hook context fails closed
 *
 * Run with: bun run src/scripts/phase0-pincode-provider-proof.ts
 */
import { PINCODE_DELIVERY_CONTEXT_KEY } from "../modules/delivery-rates/constants";
import { PincodeDeliveryProviderService } from "../modules/delivery-rates/provider";

async function main() {
  const provider = new PincodeDeliveryProviderService();

  const price = await provider.calculatePrice(
    { seller_id: "sel_123" },
    {},
    {
      [PINCODE_DELIVERY_CONTEXT_KEY]: {
        pincode: "302001",
        fees: { sel_123: 2900, sel_other: 4900 },
      },
    },
  );

  if (price.calculated_amount !== 2900) {
    throw new Error(`Expected 2900, received ${price.calculated_amount}`);
  }

  const fallback = await provider.calculatePrice(
    { seller_id: "sel_unknown" },
    {},
    {
      [PINCODE_DELIVERY_CONTEXT_KEY]: {
        pincode: "302001",
        fees: { sel_123: 2900 },
      },
    },
  );
  if (fallback.calculated_amount !== 9900) {
    throw new Error(`Expected 9900, received ${fallback.calculated_amount}`);
  }

  let missingSellerBlocked = false;
  try {
    await provider.calculatePrice(
      {},
      {},
      {
        [PINCODE_DELIVERY_CONTEXT_KEY]: { pincode: "302001", fees: {} },
      },
    );
  } catch (error) {
    missingSellerBlocked = String(error).includes("seller_id");
  }
  if (!missingSellerBlocked) {
    throw new Error("Provider did not fail closed when seller_id was missing.");
  }

  let missingContextBlocked = false;
  try {
    await provider.calculatePrice({ seller_id: "sel_123" }, {}, {});
  } catch (error) {
    missingContextBlocked = String(error).includes("pricing hook");
  }
  if (!missingContextBlocked) {
    throw new Error("Provider did not fail closed when the hook context was missing.");
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
        seeded_amount: price.calculated_amount,
        default_amount: fallback.calculated_amount,
        missing_seller_blocked: missingSellerBlocked,
        missing_context_blocked: missingContextBlocked,
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
