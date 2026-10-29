import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework";
import {
  batchPriceListPricesWorkflow,
  createPriceListsWorkflow,
  updatePriceListsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/core-flows";

const B2B_GROUP_NAME = "B2B Trade Customers";
const TITLE_PREFIX = "BuildKart B2B Studio";
const CURRENCY = "inr";

/** Medusa price-list amounts are major units; the studio/API contract is minor. */
function minorToMajor(minor: number): number {
  return minor / 100;
}

function majorToMinor(major: number): number {
  return Math.round(major * 100);
}

const B2B_GROUP_RULE = "customer.groups.id";

export interface B2bTierInput {
  min_quantity: number;
  max_quantity?: number | null;
  amount: number;
}

export interface B2bPricingInput {
  amount?: number | null;
  list_price_minor?: number | null;
  moq?: number | null;
  tiers?: B2bTierInput[];
  starts_at?: string | null;
  ends_at?: string | null;
  gst_inclusive?: boolean;
  reason?: string | null;
}

export interface B2bPricingView {
  configured: boolean;
  offer_id: string;
  price_list_id: string | null;
  price_list_title: string | null;
  status: string | null;
  amount: number | null;
  list_price_minor: number | null;
  moq: number | null;
  gst_inclusive: boolean;
  starts_at: string | null;
  ends_at: string | null;
  tiers: B2bTierInput[];
}

function titleFor(offerId: string): string {
  return `${TITLE_PREFIX} ${offerId}`;
}

function iso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid effective date.");
  }
  return date.toISOString();
}

export function validateB2bPricing(input: B2bPricingInput): void {
  const amount = Number(input.amount);
  const list = Number(input.list_price_minor);
  const moq = Number(input.moq ?? 1);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B selling price must be a positive integer in minor units.");
  }
  if (!Number.isInteger(list) || list <= 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B list price must be a positive integer in minor units.");
  }
  if (amount > list) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B selling price cannot exceed the B2B list price.");
  }
  if (!Number.isInteger(moq) || moq < 1) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B MOQ must be a positive integer.");
  }
  const tiers = input.tiers ?? [];
  let previousMax = moq - 1;
  for (const tier of tiers) {
    if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < moq) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B tier minimum must be at least the MOQ.");
    }
    if (tier.min_quantity <= previousMax) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B quantity ranges cannot overlap.");
    }
    if (!Number.isInteger(tier.amount) || tier.amount <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B tier price must be a positive integer in minor units.");
    }
    if (tier.amount > amount) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "A higher quantity cannot produce a higher unit price.");
    }
    if (tier.max_quantity != null && tier.max_quantity < tier.min_quantity) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B tier maximum must be at least its minimum.");
    }
    previousMax = tier.max_quantity ?? Number.MAX_SAFE_INTEGER;
  }
  const starts = iso(input.starts_at);
  const ends = iso(input.ends_at);
  if (starts && ends && new Date(starts) >= new Date(ends)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "B2B price period end must be after its start.");
  }
}

async function b2bGroupId(scope: MedusaContainer): Promise<string> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "customer_group",
    fields: ["id", "name"],
    filters: { name: B2B_GROUP_NAME },
  });
  const group = (data ?? [])[0] as { id?: string } | undefined;
  if (!group?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "B2B Trade Customers group is not configured.");
  }
  return group.id;
}

async function offerVariant(
  scope: MedusaContainer,
  offerId: string,
): Promise<{ seller_id: string; variant_id: string; sku: string; product_id: string | null }> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "offer",
    fields: ["id", "seller_id", "variant_id", "sku", "product_id"],
    filters: { id: offerId },
  });
  const offer = (data ?? [])[0] as
    | { seller_id?: string; variant_id?: string; sku?: string; product_id?: string | null }
    | undefined;
  if (!offer?.variant_id || !offer.seller_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Offer not found.");
  }
  return {
    seller_id: offer.seller_id,
    variant_id: offer.variant_id,
    sku: offer.sku ?? "",
    product_id: offer.product_id ?? null,
  };
}

async function findList(scope: MedusaContainer, offerId: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "price_list",
    fields: ["id", "title", "status", "starts_at", "ends_at", "metadata", "prices.id", "prices.amount", "prices.currency_code", "prices.min_quantity", "prices.max_quantity"],
    filters: { title: titleFor(offerId) },
  });
  return ((data ?? [])[0] ?? null) as
    | {
        id: string;
        title: string;
        status: string;
        starts_at?: string | null;
        ends_at?: string | null;
        metadata?: Record<string, unknown> | null;
        prices?: Array<{
          id: string;
          amount?: number | string | null;
          currency_code?: string;
          min_quantity?: number | string | null;
          max_quantity?: number | string | null;
        }>;
      }
    | null;
}

export async function loadB2bPricing(
  scope: MedusaContainer,
  offerId: string,
): Promise<B2bPricingView> {
  const list = await findList(scope, offerId);
  if (!list) {
    return {
      configured: false,
      offer_id: offerId,
      price_list_id: null,
      price_list_title: null,
      status: null,
      amount: null,
      list_price_minor: null,
      moq: null,
      gst_inclusive: true,
      starts_at: null,
      ends_at: null,
      tiers: [],
    };
  }
  const inr = (list.prices ?? []).filter((price) => (price.currency_code ?? CURRENCY) === CURRENCY);
  const base = inr.find((price) => price.min_quantity == null);
  const tiers = inr
    .filter((price) => price.min_quantity != null)
    .map((price) => ({
      min_quantity: Number(price.min_quantity),
      max_quantity: price.max_quantity == null ? null : Number(price.max_quantity),
      amount: majorToMinor(Number(price.amount)),
    }))
    .sort((a, b) => a.min_quantity - b.min_quantity);
  return {
    configured: true,
    offer_id: offerId,
    price_list_id: list.id,
    price_list_title: list.title,
    status: list.status,
    amount: base ? majorToMinor(Number(base.amount)) : null,
    list_price_minor:
      Number.isInteger(Number(list.metadata?.list_price_minor)) &&
      Number(list.metadata?.list_price_minor) > 0
        ? Number(list.metadata?.list_price_minor)
        : null,
    moq:
      Number.isInteger(Number(list.metadata?.moq)) &&
      Number(list.metadata?.moq) > 0
        ? Number(list.metadata?.moq)
        : null,
    gst_inclusive: list.metadata?.gst_inclusive !== false,
    starts_at: list.starts_at ?? null,
    ends_at: list.ends_at ?? null,
    tiers,
  };
}

export async function saveB2bPricing(
  scope: MedusaContainer,
  offerId: string,
  input: B2bPricingInput,
): Promise<B2bPricingView> {
  validateB2bPricing(input);
  const offer = await offerVariant(scope, offerId);
  const groupId = await b2bGroupId(scope);
  const amount = Number(input.amount);
  const amountMajor = minorToMajor(amount);
  const listPrice = Number(input.list_price_minor);
  const moq = Number(input.moq ?? 1);
  const starts = iso(input.starts_at);
  const ends = iso(input.ends_at);
  const metadata = {
    buildkart_b2b: true,
    buildkart_b2b_offer_id: offerId,
    list_price_minor: listPrice,
    moq,
    gst_inclusive: input.gst_inclusive !== false,
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    b2b_price_units: "major",
  };
  const existing = await findList(scope, offerId);
  let priceListId = existing?.id ?? null;

  if (!priceListId) {
    const created = await createPriceListsWorkflow(scope as never).run({
      input: {
        price_lists_data: [
          {
            title: titleFor(offerId),
            description: `BuildKart B2B studio price list for ${offer.sku}`,
            type: "sale",
            status: "active",
            starts_at: starts,
            ends_at: ends,
            rules: [{ attribute: B2B_GROUP_RULE, value: [groupId] }],
            metadata,
          },
        ],
      } as never,
    });
    priceListId = (created.result as Array<{ id: string }>)[0].id;
  } else {
    await updatePriceListsWorkflow(scope as never).run({
      input: {
        price_lists_data: [
          {
            id: priceListId,
            status: "active",
            starts_at: starts,
            ends_at: ends,
            rules: [{ attribute: B2B_GROUP_RULE, value: [groupId] }],
            metadata,
          },
        ],
      } as never,
    });
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: priceRows } = await query.graph({
    entity: "price",
    fields: ["id", "amount", "currency_code", "min_quantity", "max_quantity", "price_list_id"],
    filters: { price_list_id: priceListId },
  });
  const rows = (priceRows ?? []) as Array<{
    id: string;
    amount?: number | string | null;
    currency_code?: string;
    min_quantity?: number | string | null;
    max_quantity?: number | string | null;
  }>;
  const inrRows = rows.filter((row) => (row.currency_code ?? CURRENCY) === CURRENCY);
  const baseRow = inrRows.find((row) => row.min_quantity == null);
  const tierRows = inrRows.filter((row) => row.min_quantity != null);

  const create: Array<Record<string, unknown>> = [];
  const update: Array<Record<string, unknown>> = [];
  const remove: string[] = [];

  const basePayload = {
    amount: amountMajor,
    currency_code: CURRENCY,
    variant_id: offer.variant_id,
    min_quantity: null,
  };
  if (baseRow) {
    update.push({ id: baseRow.id, ...basePayload });
  } else {
    create.push(basePayload);
  }

  for (const tier of input.tiers ?? []) {
    const match = tierRows.find(
      (row) => Number(row.min_quantity) === tier.min_quantity,
    );
    const payload = {
      amount: minorToMajor(tier.amount),
      currency_code: CURRENCY,
      variant_id: offer.variant_id,
      min_quantity: tier.min_quantity,
      max_quantity: tier.max_quantity ?? null,
    };
    if (match) update.push({ id: match.id, ...payload });
    else create.push(payload);
  }
  for (const row of tierRows) {
    if (!(input.tiers ?? []).some((tier) => tier.min_quantity === Number(row.min_quantity))) {
      remove.push(row.id);
    }
  }

  if (create.length || update.length || remove.length) {
    await batchPriceListPricesWorkflow(scope as never).run({
      input: {
        data: {
          id: priceListId,
          create,
          update,
          delete: remove,
        },
      } as never,
    });
  }

  // Mirror the B2B snapshot into the product read model. The B2B app reads the
  // composed product payload without a Medusa customer-group pricing context,
  // so this read model is how the saved price list reaches the storefront.
  if (offer.product_id) {
    const productQuery = scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: productRows } = await productQuery.graph({
      entity: "product",
      fields: ["id", "metadata"],
      filters: { id: offer.product_id },
    });
    const product = (productRows ?? [])[0] as
      | { id?: string; metadata?: Record<string, unknown> | null }
      | undefined;
    if (product?.id) {
      const currentMetadata = (product.metadata ?? {}) as Record<string, unknown>;
      const currentB2b = (
        currentMetadata.buildkart_b2b_pricing ?? {}
      ) as Record<string, unknown>;
      await updateProductsWorkflow(scope as never).run({
        input: {
          selector: { id: product.id },
          update: {
            metadata: {
              ...currentMetadata,
              buildkart_b2b_pricing: {
                ...currentB2b,
                [offerId]: {
                  configured: true,
                  offer_id: offerId,
                  price_list_id: priceListId,
                  amount,
                  list_price_minor: listPrice,
                  moq,
                  gst_inclusive: input.gst_inclusive !== false,
                  starts_at: starts,
                  ends_at: ends,
                  tiers: input.tiers ?? [],
                  updated_at: new Date().toISOString(),
                },
              },
            },
          } as never,
        },
      });
    }
  }

  return loadB2bPricing(scope, offerId);
}
