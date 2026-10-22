import {
  Button,
  Container,
  FocusModal,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

declare const __BACKEND_URL__: string;

type PriceRow = {
  id: string;
  amount: number;
  currency_code: string;
  min_quantity?: number | null;
  max_quantity?: number | null;
  rules?: Record<string, string>;
};

type Pricing = {
  offer_id: string;
  seller_id: string;
  prices: PriceRow[];
};

type Offer = {
  id: string;
  sku?: string;
  prices?: Array<{ amount?: number; currency_code?: string }>;
};

type Variant = {
  id: string;
  title?: string;
  sku?: string;
  offers?: Offer[];
};

type Product = {
  id: string;
  title?: string;
  variants?: Variant[];
};

type TierDraft = {
  id?: string;
  min: string;
  max: string;
  amount: string;
};

const API_BASE = `${__BACKEND_URL__.replace(/\/$/, "")}/admin/buildkart/offers`;

const money = (minor: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);

const rupees = (minor: number) => String(minor / 100);

function inrPrices(prices: PriceRow[]) {
  return prices.filter((price) => price.currency_code === "inr");
}

function validate(base: string, tiers: TierDraft[]): string[] {
  const errors: string[] = [];
  const baseAmount = Math.round(Number(base) * 100);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    errors.push("Base price must be greater than zero.");
  }
  if (tiers.length > 10) errors.push("Use at most 10 quantity tiers.");
  const parsed = tiers.map((tier, index) => ({
    index,
    min: Number(tier.min),
    max: tier.max.trim() ? Number(tier.max) : null,
    amount: Math.round(Number(tier.amount) * 100),
  }));
  for (const [index, tier] of parsed.entries()) {
    if (!Number.isInteger(tier.min) || tier.min < 2) {
      errors.push(`Tier ${index + 1}: minimum quantity must be 2 or more.`);
    }
    if (tier.max !== null && (!Number.isInteger(tier.max) || tier.max < tier.min)) {
      errors.push(`Tier ${index + 1}: maximum quantity is invalid.`);
    }
    if (!Number.isFinite(tier.amount) || tier.amount <= 0 || tier.amount > baseAmount) {
      errors.push(`Tier ${index + 1}: price must be positive and no more than the base price.`);
    }
    if (index > 0) {
      const previous = parsed[index - 1];
      if (previous.max === null || tier.min <= previous.max) {
        errors.push(`Tier ${index + 1}: quantity range overlaps the previous tier.`);
      }
      if (tier.amount > previous.amount) {
        errors.push(`Tier ${index + 1}: higher quantities cannot cost more.`);
      }
    }
  }
  return errors;
}

function PricingEditor({ offerId }: { offerId: string }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [baseId, setBaseId] = useState<string | undefined>();
  const [otherPrices, setOtherPrices] = useState<PriceRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const pricing = useQuery({
    queryKey: ["buildkart", "offer-pricing", offerId],
    queryFn: async (): Promise<Pricing> => {
      const response = await fetch(`${API_BASE}/${offerId}/pricing`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Pricing request failed (${response.status}).`);
      const body = (await response.json()) as { pricing: Pricing };
      return body.pricing;
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open || !pricing.data) return;
    const inr = inrPrices(pricing.data.prices);
    const basePrice = inr.find(
      (price) => price.min_quantity === null || price.min_quantity === undefined,
    );
    setBase(basePrice ? rupees(basePrice.amount) : "");
    setBaseId(basePrice?.id);
    setTiers(
      inr
        .filter((price) => price.min_quantity !== null && price.min_quantity !== undefined)
        .sort((left, right) => Number(left.min_quantity) - Number(right.min_quantity))
        .map((price) => ({
          id: price.id,
          min: String(price.min_quantity),
          max: price.max_quantity === null || price.max_quantity === undefined
            ? ""
            : String(price.max_quantity),
          amount: rupees(price.amount),
        })),
    );
    setOtherPrices(
      pricing.data.prices.filter((price) => price.currency_code !== "inr"),
    );
    setErrors([]);
  }, [open, pricing.data]);

  const currentBase = useMemo(() => inrPrices(pricing.data?.prices ?? []).find(
    (price) => price.min_quantity === null || price.min_quantity === undefined,
  ), [pricing.data]);

  const save = async () => {
    const nextErrors = validate(base, tiers);
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;
    setSaving(true);
    try {
      const payload = [
        ...otherPrices.map((price) => ({
          id: price.id,
          amount: price.amount,
          currency_code: price.currency_code,
          min_quantity: price.min_quantity ?? null,
          max_quantity: price.max_quantity ?? null,
          ...(price.rules && Object.keys(price.rules).length > 0
            ? { rules: price.rules }
            : {}),
        })),
        {
          ...(baseId ? { id: baseId } : {}),
          amount: Math.round(Number(base) * 100),
          currency_code: "inr",
          min_quantity: null,
          max_quantity: null,
        },
        ...tiers.map((tier) => ({
          ...(tier.id ? { id: tier.id } : {}),
          amount: Math.round(Number(tier.amount) * 100),
          currency_code: "inr",
          min_quantity: Number(tier.min),
          max_quantity: tier.max.trim() ? Number(tier.max) : null,
        })),
      ];
      const response = await fetch(`${API_BASE}/${offerId}/pricing`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prices: payload }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Could not update pricing.");
      await queryClient.invalidateQueries({ queryKey: ["buildkart", "offer-pricing"] });
      toast.success("Pricing updated");
      setOpen(false);
    } catch (error) {
      setErrors([(error as Error).message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
        Edit pricing
      </Button>
      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Content className="max-w-2xl">
          <FocusModal.Header>
            <FocusModal.Title>Edit B2C pricing</FocusModal.Title>
            <FocusModal.Description>
              INR selling price and quantity tiers. The server validates the ladder
              before updating the offer.
            </FocusModal.Description>
          </FocusModal.Header>
          <FocusModal.Body className="overflow-y-auto px-6 py-6">
            {pricing.isPending ? (
              <Text size="small" className="text-ui-fg-subtle">Loading pricing…</Text>
            ) : pricing.isError ? (
              <Text size="small" className="text-ui-fg-error">
                Could not load pricing. Close and retry.
              </Text>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="base-price">Base selling price (INR)</Label>
                  <Input
                    id="base-price"
                    inputMode="decimal"
                    value={base}
                    onChange={(event) => setBase(event.target.value)}
                    placeholder="e.g. 436.90"
                  />
                  {currentBase ? (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Current: {money(currentBase.amount)}
                    </Text>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Text size="small" weight="plus">Quantity tiers</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        Higher quantities should not cost more per unit.
                      </Text>
                    </div>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setTiers((current) => [
                        ...current,
                        { min: "", max: "", amount: "" },
                      ])}
                      disabled={tiers.length >= 10}
                    >
                      Add tier
                    </Button>
                  </div>
                  {tiers.length === 0 ? (
                    <Text size="small" className="text-ui-fg-subtle">
                      No quantity tiers. The base price applies to every quantity.
                    </Text>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {tiers.map((tier, index) => (
                        <div key={tier.id ?? `new-${index}`} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                          <div className="flex flex-col gap-1">
                            <Label>From qty</Label>
                            <Input
                              inputMode="numeric"
                              value={tier.min}
                              onChange={(event) => setTiers((current) =>
                                current.map((row, rowIndex) =>
                                  rowIndex === index ? { ...row, min: event.target.value } : row,
                                ),
                              )}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label>To qty</Label>
                            <Input
                              inputMode="numeric"
                              value={tier.max}
                              placeholder="No limit"
                              onChange={(event) => setTiers((current) =>
                                current.map((row, rowIndex) =>
                                  rowIndex === index ? { ...row, max: event.target.value } : row,
                                ),
                              )}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label>Unit price (INR)</Label>
                            <Input
                              inputMode="decimal"
                              value={tier.amount}
                              onChange={(event) => setTiers((current) =>
                                current.map((row, rowIndex) =>
                                  rowIndex === index ? { ...row, amount: event.target.value } : row,
                                ),
                              )}
                            />
                          </div>
                          <Button
                            size="small"
                            variant="transparent"
                            onClick={() => setTiers((current) =>
                              current.filter((_, rowIndex) => rowIndex !== index),
                            )}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {errors.length > 0 ? (
                  <div className="rounded-md border border-ui-border-error bg-ui-bg-error p-3">
                    {errors.map((error) => (
                      <Text key={error} size="small" className="text-ui-fg-error">
                        {error}
                      </Text>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex w-full items-center justify-end gap-2">
              <Button size="small" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="small"
                onClick={save}
                isLoading={saving}
                disabled={pricing.isPending || pricing.isError}
              >
                Save pricing
              </Button>
            </div>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>
    </>
  );
}

function OfferPricingWidget({ data }: { data?: Product }) {
  const offers = useMemo(
    () =>
      (data?.variants ?? []).flatMap((variant) =>
        (variant.offers ?? []).map((offer) => ({
          ...offer,
          variantTitle: variant.title || variant.sku || variant.id,
        })),
      ),
    [data],
  );

  if (offers.length === 0) return null;

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Seller pricing</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          B2C INR selling price and quantity tiers for this listing. Changes are
          validated against the offer price ladder before the canonical update.
        </Text>
      </div>
      {offers.map((offer) => {
        const base = inrPrices(
          (offer.prices ?? []).map((price, index) => ({
            id: `row-${index}`,
            amount: Number(price?.amount ?? 0),
            currency_code: price?.currency_code ?? "inr",
            min_quantity: null,
            max_quantity: null,
          })),
        ).find((price) => price.min_quantity === null);
        return (
          <div key={offer.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              <Text size="small" weight="plus" className="truncate">
                {offer.variantTitle}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {offer.sku || offer.id} · {base ? money(base.amount) : "Price not set"}
              </Text>
            </div>
            <PricingEditor offerId={offer.id} />
          </div>
        );
      })}
    </Container>
  );
}

export const config = defineWidgetConfig({
  zone: "offers.detail.main.after",
});

export default OfferPricingWidget;
