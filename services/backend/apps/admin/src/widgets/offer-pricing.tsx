import { Button, Container, Heading, Text } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useMemo } from "react";
import { Link } from "react-router-dom";

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

const money = (minor: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);

function basePrice(offer: Offer): number | null {
  const inr = (offer.prices ?? []).filter(
    (price) => (price.currency_code ?? "inr") === "inr",
  );
  const amount = inr.find((price) => price.amount != null)?.amount;
  return typeof amount === "number" ? amount : null;
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

  if (!data?.id || offers.length === 0) return null;

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">Seller pricing</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Read-only summary. B2C and B2B pricing is edited in Product Studio.
          </Text>
        </div>
        <Link to={`/product-studio/${data.id}`}>
          <Button size="small" variant="secondary">
            Open in Product Studio
          </Button>
        </Link>
      </div>
      {offers.map((offer) => {
        const amount = basePrice(offer);
        return (
          <div
            key={offer.id}
            className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
          >
            <div className="min-w-0">
              <Text size="small" weight="plus" className="truncate">
                {offer.variantTitle}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {offer.sku || offer.id} ·{" "}
                {amount === null ? "Price not set" : money(amount)}
              </Text>
            </div>
          </div>
        );
      })}
    </Container>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "offers.detail.main.after",
});

export default OfferPricingWidget;
