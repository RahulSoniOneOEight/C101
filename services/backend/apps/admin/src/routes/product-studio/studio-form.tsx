import {
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  Textarea,
} from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

declare const __BACKEND_URL__: string;

type StudioMode = "admin" | "vendor";

type Category = { id: string; name: string; parent_category_id?: string | null };
type Tag = { id: string; value: string };
type CatalogueItem = {
  id: string;
  title: string;
  thumbnail?: string | null;
  status: string;
  categories?: { name?: string | null }[];
};
type MetaResponse = {
  categories: Category[];
  tags: Tag[];
  catalogue: CatalogueItem[];
};
type Spec = { id?: string; name: string; value: string; unit: string };
type Option = { id?: string; name: string; values: string[] };
type Variant = {
  id?: string;
  title: string;
  details: string;
  image_url: string;
  sku: string;
  ean: string;
  upc: string;
  barcode: string;
  options: Record<string, string>;
};
type OfferPrice = {
  id: string;
  amount: number;
  currency_code: string;
  min_quantity?: number | null;
  max_quantity?: number | null;
  rules?: Record<string, string>;
};
type Offer = {
  id: string;
  seller_id: string;
  seller_name: string;
  variant_id: string;
  product_id?: string | null;
  sku: string;
  metadata?: Record<string, unknown>;
  list_price_minor?: number | null;
  gst_inclusive?: boolean;
  prices: OfferPrice[];
};
type InventoryLocation = {
  id: number;
  name: string;
  on_hand: number;
  reserved: number;
  draft: number;
  atp: number;
};
type InventoryTryton = {
  found: boolean;
  product_id?: number | null;
  on_hand: number;
  reserved: number;
  draft: number;
  atp: number;
  locations: InventoryLocation[];
  error?: string;
};
type InventoryPlatform = {
  available: number;
  reserved: number;
  atp: number;
  source: string;
};
type InventoryItem = {
  sku: string;
  tryton: InventoryTryton;
  platform: InventoryPlatform | null;
};
type StudioProduct = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  status: string;
  lifecycle_state?: string | null;
  thumbnail: string;
  category_id: string;
  category_name: string;
  brand: string;
  manufacturer: string;
  model_number: string;
  product_type: string;
  hsn_code: string;
  unit_of_measure: string;
  tags: string[];
  specifications: Spec[];
  options: Option[];
  variants: Variant[];
  offers: Offer[];
  can_edit: boolean;
  options_editable: boolean;
  studio_managed: boolean;
  owned: boolean;
};

type FormState = {
  title: string;
  subtitle: string;
  description: string;
  category_id: string;
  brand: string;
  manufacturer: string;
  model_number: string;
  product_type: string;
  hsn_code: string;
  unit_of_measure: string;
  thumbnail: string;
};

type Notice = { kind: "success" | "error" | "info"; text: string };

const EMPTY_FORM: FormState = {
  title: "",
  subtitle: "",
  description: "",
  category_id: "",
  brand: "",
  manufacturer: "",
  model_number: "",
  product_type: "",
  hsn_code: "",
  unit_of_measure: "",
  thumbnail: "",
};

const EMPTY_SPEC: Spec = { name: "", value: "", unit: "" };

const emptyVariant = (): Variant => ({
  title: "Default",
  details: "",
  image_url: "",
  sku: "",
  ean: "",
  upc: "",
  barcode: "",
  options: {},
});

function draftString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeDraftForm(value: unknown): FormState {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    title: draftString(source.title),
    subtitle: draftString(source.subtitle),
    description: draftString(source.description),
    category_id: draftString(source.category_id),
    brand: draftString(source.brand),
    manufacturer: draftString(source.manufacturer),
    model_number: draftString(source.model_number),
    product_type: draftString(source.product_type),
    hsn_code: draftString(source.hsn_code),
    unit_of_measure: draftString(source.unit_of_measure),
    thumbnail: draftString(source.thumbnail),
  };
}

function normalizeDraftSpecs(value: unknown): Spec[] {
  if (!Array.isArray(value)) return [{ ...EMPTY_SPEC }];
  const specs = value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      name: draftString(item.name),
      value: draftString(item.value),
      unit: draftString(item.unit),
    }));
  return specs.length > 0 ? specs : [{ ...EMPTY_SPEC }];
}

function normalizeDraftTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => draftString(tag).trim()).filter(Boolean);
}

function normalizeDraftOptions(value: unknown): Option[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => {
      const name = draftString(item.name).trim();
      const rawValues = item.values;
      const values = Array.isArray(rawValues)
        ? rawValues.map((entry) => draftString(entry).trim()).filter(Boolean)
        : draftString(rawValues)
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
      const id = draftString(item.id);
      if (!name) return null;
      return { ...(id ? { id } : {}), name, values };
    })
    .filter((option): option is Option => option !== null);
}

function normalizeDraftVariants(value: unknown): Variant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => {
      const rawOptions = item.options;
      const options: Record<string, string> = {};
      if (
        rawOptions &&
        typeof rawOptions === "object" &&
        !Array.isArray(rawOptions)
      ) {
        for (const [key, optionValue] of Object.entries(
          rawOptions as Record<string, unknown>,
        )) {
          const cleanKey = key.trim();
          const cleanValue = draftString(optionValue).trim();
          if (cleanKey && cleanValue) options[cleanKey] = cleanValue;
        }
      }
      const id = draftString(item.id);
      return {
        ...emptyVariant(),
        ...(id ? { id } : {}),
        title: draftString(item.title, "Default").trim() || "Default",
        details: draftString(item.details),
        image_url: draftString(item.image_url),
        sku: draftString(item.sku),
        ean: draftString(item.ean),
        upc: draftString(item.upc),
        barcode: draftString(item.barcode),
        options,
      };
    });
}

function combinationKey(options: Option[], values: Record<string, string>): string {
  return options
    .map((option) => `${option.name.trim().toLowerCase()}:${(values[option.name] ?? "").toLowerCase()}`)
    .join("|");
}

const SPEC_SUGGESTIONS = [
  "Material",
  "Finish",
  "Colour",
  "Size",
  "Voltage",
  "Power",
  "Cable length",
  "Conductor size",
  "Cores",
  "Warranty",
];

const backend = __BACKEND_URL__.replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backend}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? `Request failed (${response.status}).`);
  }
  return body as T;
}

const WORKSPACE_TABS = [
  { id: "studio-details", label: "Details" },
  { id: "studio-tags", label: "Tags & specs" },
  { id: "studio-variants", label: "Variants" },
  { id: "studio-pricing", label: "Offers & pricing" },
  { id: "studio-inventory", label: "Inventory" },
  { id: "studio-review", label: "Review" },
] as const;

function WorkspaceTabs({ loaded }: { loaded: boolean }) {
  const [active, setActive] = useState<string>("studio-details");

  const scrollToSection = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    const url = new URL(window.location.href);
    url.searchParams.set("section", id.replace("studio-", ""));
    window.history.replaceState({}, "", url);
    window.setTimeout(() => {
      document.getElementById(id)?.focus({ preventScroll: true });
    }, 350);
  };

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("section");
    if (!requested) return;
    const id = `studio-${requested}`;
    if (!WORKSPACE_TABS.some((tab) => tab.id === id)) return;
    const handle = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
      setActive(id);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [loaded]);

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    const syncActiveSection = () => {
      const marker = window.scrollY + 200;
      let current: string = WORKSPACE_TABS[0].id;
      for (const tab of WORKSPACE_TABS) {
        const element = document.getElementById(tab.id);
        if (!element) continue;
        const top = element.getBoundingClientRect().top + window.scrollY;
        if (top <= marker) current = tab.id;
      }
      setActive(current);
    };
    syncActiveSection();
    window.addEventListener("scroll", syncActiveSection, { passive: true });
    window.addEventListener("resize", syncActiveSection);
    return () => {
      window.removeEventListener("scroll", syncActiveSection);
      window.removeEventListener("resize", syncActiveSection);
    };
  }, [loaded]);

  return (
    <nav
      aria-label="Product workspace sections"
      className="sticky top-0 z-10 border-y border-ui-border-base bg-ui-bg-base px-4 py-2"
      data-testid="product-workspace-tabs"
    >
      <div className="flex flex-wrap gap-1">
        {WORKSPACE_TABS.map((tab) => {
          const section = tab.id.replace("studio-", "");
          return (
            <a
              key={tab.id}
              href={`?section=${section}`}
              onClick={(event) => {
                event.preventDefault();
                scrollToSection(tab.id);
              }}
              aria-current={active === tab.id ? "location" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active === tab.id
                  ? "bg-ui-bg-interactive text-ui-fg-on-color"
                  : "text-ui-fg-subtle hover:bg-ui-bg-subtle"
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function Section({
  id,
  number,
  title,
  description,
  complete,
  children,
}: {
  id?: string;
  number: number;
  title: string;
  description: string;
  complete?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      className="scroll-mt-36 border-t border-ui-border-base px-6 py-6 first:border-t-0"
    >
      <div className="mb-5 flex items-start gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            complete
              ? "bg-ui-bg-interactive text-ui-fg-on-color"
              : "bg-ui-bg-subtle text-ui-fg-subtle"
          }`}
        >
          {number}
        </span>
        <div>
          <Heading level="h2">{title}</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {description}
          </Text>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ui-fg-base">
        {label}
        {required ? <span className="ml-1 text-ui-fg-error">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="text-xs leading-5 text-ui-fg-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

type TierDraft = { id?: string; min: string; max: string; amount: string };

const inr = (minor: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);

const rupees = (minor: number) => String(minor / 100);

function validatePriceLadder(base: string, tiers: TierDraft[]): string[] {
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
    if (
      tier.max !== null &&
      (!Number.isInteger(tier.max) || tier.max < tier.min)
    ) {
      errors.push(`Tier ${index + 1}: maximum quantity is invalid.`);
    }
    if (
      !Number.isFinite(tier.amount) ||
      tier.amount <= 0 ||
      tier.amount > baseAmount
    ) {
      errors.push(
        `Tier ${index + 1}: price must be positive and no more than the base price.`,
      );
    }
    if (index > 0) {
      const previous = parsed[index - 1];
      if (previous.max === null || tier.min <= previous.max) {
        errors.push(
          `Tier ${index + 1}: quantity range overlaps the previous tier.`,
        );
      }
      if (tier.amount > previous.amount) {
        errors.push(
          `Tier ${index + 1}: higher quantities cannot cost more.`,
        );
      }
    }
  }
  return errors;
}

function OfferPricingEditor({
  offer,
  mode,
  variantLabel,
  onSaved,
}: {
  offer: Offer;
  mode: StudioMode;
  variantLabel: string;
  onSaved: (pricing: Offer) => void;
}) {
  const [base, setBase] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [gstInclusive, setGstInclusive] = useState(true);
  const [baseId, setBaseId] = useState<string | undefined>();
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [otherPrices, setOtherPrices] = useState<OfferPrice[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [b2bAmount, setB2bAmount] = useState("");
  const [b2bList, setB2bList] = useState("");
  const [b2bMoq, setB2bMoq] = useState("1");
  const [b2bFrom, setB2bFrom] = useState("");
  const [b2bTo, setB2bTo] = useState("");
  const [b2bGst, setB2bGst] = useState(true);
  const [b2bTiers, setB2bTiers] = useState<TierDraft[]>([]);
  const [b2bSaving, setB2bSaving] = useState(false);
  const [b2bNotice, setB2bNotice] = useState<string | null>(null);
  const [b2bPriceListId, setB2bPriceListId] = useState<string | null>(null);

  useEffect(() => {
    const inrPrices = offer.prices.filter(
      (price) => price.currency_code === "inr",
    );
    const basePrice = inrPrices.find(
      (price) =>
        price.min_quantity === null || price.min_quantity === undefined,
    );
    setBase(basePrice ? rupees(basePrice.amount) : "");
    setListPrice(
      offer.list_price_minor ? rupees(offer.list_price_minor) : "",
    );
    setGstInclusive(offer.gst_inclusive !== false);
    setBaseId(basePrice?.id);
    const b2bEndpoint =
      mode === "admin"
        ? `/admin/buildkart/offers/${offer.id}/b2b-pricing`
        : `/vendor/buildkart/offers/${offer.id}/b2b-pricing`;
    void request<{
      pricing: {
        configured: boolean;
        price_list_id: string | null;
        amount: number | null;
        list_price_minor: number | null;
        moq: number | null;
        starts_at: string | null;
        ends_at: string | null;
        gst_inclusive: boolean;
        tiers: Array<{ min_quantity: number; max_quantity: number | null; amount: number }>;
      };
    }>(b2bEndpoint)
      .then((result) => {
        setB2bAmount(result.pricing.amount ? rupees(result.pricing.amount) : "");
        setB2bPriceListId(result.pricing.price_list_id ?? null);
        setB2bList(
          result.pricing.list_price_minor
            ? rupees(result.pricing.list_price_minor)
            : "",
        );
        setB2bMoq(String(result.pricing.moq ?? 1));
        setB2bFrom(result.pricing.starts_at?.slice(0, 16) ?? "");
        setB2bTo(result.pricing.ends_at?.slice(0, 16) ?? "");
        setB2bGst(result.pricing.gst_inclusive !== false);
        setB2bTiers(
          result.pricing.tiers.map((tier) => ({
            min: String(tier.min_quantity),
            max:
              tier.max_quantity === null || tier.max_quantity === undefined
                ? ""
                : String(tier.max_quantity),
            amount: rupees(tier.amount),
          })),
        );
      })
      .catch(() => undefined);
    setTiers(
      inrPrices
        .filter(
          (price) =>
            price.min_quantity !== null && price.min_quantity !== undefined,
        )
        .sort(
          (left, right) =>
            Number(left.min_quantity) - Number(right.min_quantity),
        )
        .map((price) => ({
          id: price.id,
          min: String(price.min_quantity),
          max:
            price.max_quantity === null ||
            price.max_quantity === undefined
              ? ""
              : String(price.max_quantity),
          amount: rupees(price.amount),
        })),
    );
    setOtherPrices(
      offer.prices.filter((price) => price.currency_code !== "inr"),
    );
    setErrors([]);
  }, [offer]);

  const saveB2c = async (): Promise<boolean> => {
    const nextErrors = validatePriceLadder(base, tiers);
    const listMinor = Math.round(Number(listPrice) * 100);
    const baseMinor = Math.round(Number(base) * 100);
    if (!Number.isInteger(listMinor) || listMinor <= 0) {
      nextErrors.push("List price is required and must be greater than zero.");
    }
    if (Number.isFinite(baseMinor) && baseMinor > listMinor) {
      nextErrors.push("Selling price cannot exceed the list price.");
    }
    setErrors([...new Set(nextErrors)]);
    if (nextErrors.length > 0) return false;
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
      const endpoint =
        mode === "admin"
          ? `/admin/buildkart/offers/${offer.id}/pricing`
          : `/vendor/buildkart/offers/${offer.id}/pricing`;
      const result = await request<{
        pricing: {
          offer_id: string;
          seller_id: string;
          product_id?: string | null;
          variant_id: string;
          sku: string;
          prices: OfferPrice[];
        };
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          prices: payload,
          reason: null,
          list_price_minor: listMinor,
          gst_inclusive: gstInclusive,
          enforce_policy: true,
        }),
      });
      const updated: Offer = {
        ...offer,
        sku: result.pricing.sku,
        list_price_minor: listMinor,
        gst_inclusive: gstInclusive,
        prices: result.pricing.prices,
      };
      onSaved(updated);
      setErrors([]);
      return true;
    } catch (error) {
      setErrors([(error as Error).message]);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveB2b = async (): Promise<boolean> => {
    setB2bSaving(true);
    setB2bNotice(null);
    try {
      const tiers = b2bTiers.map((tier) => ({
        min_quantity: Number(tier.min),
        max_quantity: tier.max.trim() ? Number(tier.max) : null,
        amount: Math.round(Number(tier.amount) * 100),
      }));
      const endpoint =
        mode === "admin"
          ? `/admin/buildkart/offers/${offer.id}/b2b-pricing`
          : `/vendor/buildkart/offers/${offer.id}/b2b-pricing`;
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({
          amount: Math.round(Number(b2bAmount) * 100),
          list_price_minor: Math.round(Number(b2bList) * 100),
          moq: Number(b2bMoq),
          tiers,
          starts_at: b2bFrom ? new Date(b2bFrom).toISOString() : null,
          ends_at: b2bTo ? new Date(b2bTo).toISOString() : null,
          gst_inclusive: b2bGst,
          reason: null,
        }),
      });
      setB2bNotice("B2B price saved in the dedicated customer-group price list.");
      return true;
    } catch (error) {
      setB2bNotice((error as Error).message);
      return false;
    } finally {
      setB2bSaving(false);
    }
  };

  const saveAllPricing = async () => {
    const b2cSaved = await saveB2c();
    if (!b2cSaved) return;
    const hasB2bValues = Boolean(
      b2bAmount.trim() ||
        b2bList.trim() ||
        b2bTiers.length ||
        b2bPriceListId,
    );
    if (hasB2bValues) {
      await saveB2b();
    }
  };

  return (
    <div className="rounded-lg border border-ui-border-base p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ui-fg-base">
            {variantLabel || offer.sku}
          </p>
          <p className="text-xs text-ui-fg-subtle">
            {offer.sku || "No SKU"} Â· {offer.seller_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge color={base ? "green" : "orange"}>
            B2C {base ? "configured" : "not configured"}
          </StatusBadge>
          <StatusBadge color={b2bAmount ? "green" : "grey"}>
            B2B {b2bAmount ? "configured" : "not configured"}
          </StatusBadge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-ui-bg-subtle p-3 md:grid-cols-4">
        <div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            B2C selling
          </Text>
          <Text size="small" weight="plus">
            {base ? inr(Math.round(Number(base) * 100)) : "â€”"}
          </Text>
        </div>
        <div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            B2C list
          </Text>
          <Text size="small" weight="plus">
            {listPrice ? inr(Math.round(Number(listPrice) * 100)) : "â€”"}
          </Text>
        </div>
        <div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            B2B selling
          </Text>
          <Text size="small" weight="plus">
            {b2bAmount ? inr(Math.round(Number(b2bAmount) * 100)) : "â€”"}
          </Text>
        </div>
        <div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            B2B MOQ
          </Text>
          <Text size="small" weight="plus">
            {b2bAmount ? b2bMoq || "-" : "-"}
          </Text>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section
          aria-labelledby={`b2c-pricing-${offer.id}`}
          className="rounded-lg border border-ui-border-base p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Heading id={`b2c-pricing-${offer.id}`} level="h3">
                B2C pricing
              </Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                B2C list price, selling price and GST
              </Text>
            </div>
            <StatusBadge color={gstInclusive ? "blue" : "grey"}>
              {gstInclusive ? "GST-inclusive" : "GST-exclusive"}
            </StatusBadge>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">
                List price (INR) *
              </span>
              <Input
                inputMode="decimal"
                value={listPrice}
                onChange={(event) => setListPrice(event.target.value)}
                placeholder="MRP / list price"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">
                Base selling price (INR) *
              </span>
              <Input
                inputMode="decimal"
                value={base}
                onChange={(event) => setBase(event.target.value)}
                placeholder="e.g. 436.90"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ui-fg-base md:col-span-2">
              <input
                type="checkbox"
                checked={gstInclusive}
                onChange={(event) => setGstInclusive(event.target.checked)}
              />
              B2C price is GST-inclusive
            </label>
          </div>

          <p className="mt-2 text-xs text-ui-fg-subtle">
            {Number(listPrice) > 0 && Number(base) > 0
              ? `${Math.max(
                  0,
                  Math.round(
                    ((Number(listPrice) - Number(base)) /
                      Number(listPrice)) *
                      100,
                  ),
                )}% below list Â· ${
                  gstInclusive ? "GST-inclusive" : "GST-exclusive"
                }`
              : "Enter list and selling prices to calculate the discount."}
          </p>

          <p className="mt-3 text-xs text-ui-fg-subtle">
            B2C quantity tiers are not used. Pricing applies to every quantity.
          </p>

          {errors.length > 0 ? (
            <div className="mt-3 rounded-md border border-ui-border-error bg-ui-bg-error px-3 py-2 text-xs text-ui-fg-error">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

        </section>

        <section
          aria-labelledby={`b2b-pricing-${offer.id}`}
          className="rounded-lg border border-ui-border-base p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Heading id={`b2b-pricing-${offer.id}`} level="h3">
                B2B pricing
              </Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                Dedicated price list Â· B2B Trade Customers
              </Text>
            </div>
            <StatusBadge color={b2bAmount ? "green" : "grey"}>
              {b2bAmount ? "Configured" : "Not configured"}
            </StatusBadge>
          </div>
          {!b2bAmount ? (
            <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
              MOQ and GST defaults below apply only after B2B pricing is saved.
            </Text>
          ) : null}

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">
                B2B list price (INR)
              </span>
              <Input
                inputMode="decimal"
                value={b2bList}
                onChange={(event) => setB2bList(event.target.value)}
                placeholder="B2B list price"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">
                B2B selling price (INR)
              </span>
              <Input
                inputMode="decimal"
                value={b2bAmount}
                onChange={(event) => setB2bAmount(event.target.value)}
                placeholder="B2B selling price"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">
                MOQ
              </span>
              <Input
                inputMode="numeric"
                value={b2bMoq}
                onChange={(event) => setB2bMoq(event.target.value)}
                placeholder="MOQ"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ui-fg-base">
              <input
                type="checkbox"
                checked={b2bGst}
                onChange={(event) => setB2bGst(event.target.checked)}
              />
              B2B price is GST-inclusive
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">
                Effective from
              </span>
              <Input
                type="datetime-local"
                value={b2bFrom}
                onChange={(event) => setB2bFrom(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">
                Effective to
              </span>
              <Input
                type="datetime-local"
                value={b2bTo}
                onChange={(event) => setB2bTo(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ui-fg-base">
                  Quantity tiers
                </p>
                <p className="text-xs text-ui-fg-subtle">
                  Higher quantities should not cost more per unit.
                </p>
              </div>
              <Button
                size="small"
                type="button"
                variant="secondary"
                onClick={() =>
                  setB2bTiers((current) => [
                    ...current,
                    {
                      min: current.length
                        ? String(Number(current[current.length - 1].max || 1) + 1)
                        : b2bMoq,
                      max: "",
                      amount: b2bAmount,
                    },
                  ])
                }
              >
                Add tier
              </Button>
            </div>
            {b2bTiers.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No B2B quantity tiers.
              </Text>
            ) : (
              b2bTiers.map((tier, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-md border border-ui-border-base p-2 sm:flex-row sm:items-center"
                >
                  <Input
                    inputMode="numeric"
                    value={tier.min}
                    onChange={(event) =>
                      setB2bTiers((current) =>
                        current.map((row, position) =>
                          position === index
                            ? { ...row, min: event.target.value }
                            : row,
                        ),
                      )
                    }
                    placeholder="Min qty"
                    className="sm:w-20"
                  />
                  <Input
                    inputMode="numeric"
                    value={tier.max}
                    onChange={(event) =>
                      setB2bTiers((current) =>
                        current.map((row, position) =>
                          position === index
                            ? { ...row, max: event.target.value }
                            : row,
                        ),
                      )
                    }
                    placeholder="Max qty"
                    className="sm:w-20"
                  />
                  <Input
                    inputMode="decimal"
                    value={tier.amount}
                    onChange={(event) =>
                      setB2bTiers((current) =>
                        current.map((row, position) =>
                          position === index
                            ? { ...row, amount: event.target.value }
                            : row,
                        ),
                      )
                    }
                    placeholder="Unit price (INR)"
                    className="sm:flex-1"
                  />
                  <Button
                    size="small"
                    type="button"
                    variant="transparent"
                    className="shrink-0"
                    onClick={() =>
                      setB2bTiers((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>

          {b2bNotice ? (
            <p className="mt-2 text-xs text-ui-fg-subtle">{b2bNotice}</p>
          ) : null}

          {mode === "admin" ? (
            <div className="mt-3">
              {b2bPriceListId ? (
                <Link
                  to={`/price-lists/${b2bPriceListId}`}
                  className="text-xs font-medium text-ui-fg-interactive hover:underline"
                >
                  View underlying B2B price list
                </Link>
              ) : (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  The per-offer B2B price list is created on first save.
                </Text>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ui-border-base pt-3">
        <Text size="xsmall" className="text-ui-fg-subtle">
          Saves B2C and configured B2B pricing for this offer.
        </Text>
        <Button
          size="small"
          type="button"
          isLoading={saving || b2bSaving}
          onClick={saveAllPricing}
        >
          Save pricing
        </Button>
      </div>
    </div>
  );
}


function InventoryRequestForm({
  offer,
  mode,
}: {
  offer: Offer;
  mode: StudioMode;
}) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{
      id: string;
      quantity_delta: number;
      status: string;
      reason: string;
      requested_at: string;
    }>
  >([]);

  const loadHistory = async () => {
    try {
      const endpoint =
        mode === "admin"
          ? "/admin/buildkart/inventory/requests?limit=100"
          : "/vendor/buildkart/inventory/requests?limit=100";
      const result = await request<{
        items?: Array<{
          id: string;
          offer_id: string | null;
          quantity_delta: number;
          status: string;
          reason: string;
          requested_at: string;
        }>;
      }>(endpoint);
      setHistory(
        (result.items ?? [])
          .filter((item) => item.offer_id === offer.id)
          .slice(0, 3),
      );
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id, mode]);

  const submit = async () => {
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError("Enter a non-zero whole-number quantity change.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required for an inventory request.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const endpoint =
        mode === "admin"
          ? "/admin/buildkart/inventory/requests"
          : "/vendor/buildkart/inventory/requests";
      const result = await request<{
        request_id: string;
        status: string;
        stock_effect: string;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          offer_id: offer.id,
          quantity_delta: parsed,
          reason: reason.trim(),
        }),
      });
      setMessage(
        `Request ${result.request_id} recorded. Stock effect: ${result.stock_effect}.`,
      );
      setDelta("");
      setReason("");
      void loadHistory();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border-t border-ui-border-base pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ui-fg-subtle">
        Stock adjustment request
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          inputMode="numeric"
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
          placeholder="Quantity change (+/-)"
          className="sm:w-40"
        />
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for request"
          className="sm:flex-1"
        />
        <Button
          size="small"
          type="button"
          variant="secondary"
          isLoading={saving}
          onClick={submit}
        >
          Request adjustment
        </Button>
      </div>
      {message ? (
        <p className="mt-2 text-xs text-ui-fg-success">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-ui-fg-error">{error}</p>
      ) : null}
      {history.length > 0 ? (
        <div className="mt-2 space-y-1">
          {history.map((item) => (
            <p key={item.id} className="text-xs text-ui-fg-subtle">
              {item.status} Â· {item.quantity_delta > 0 ? "+" : ""}
              {item.quantity_delta} Â· {item.reason} Â·{" "}
              {new Date(item.requested_at).toLocaleDateString("en-IN")}
            </p>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-ui-fg-subtle">
        This records an audit request only. It does not change Tryton stock.
        Approval is recorded on the Inventory requests page; ERP posting remains
        a separate operator action.
      </p>
    </div>
  );
}

export function ProductStudioForm({
  mode,
  productId,
}: {
  mode: StudioMode;
  productId?: string;
}) {
  const navigate = useNavigate();
  const apiBase =
    mode === "admin"
      ? "/admin/buildkart/product-studio"
      : "/vendor/buildkart/product-studio";
  const draftKey = `buildkart:product-studio:${mode}:${productId ?? "new"}`;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [specs, setSpecs] = useState<Spec[]>([{ ...EMPTY_SPEC }]);
  const [tags, setTags] = useState<string[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [variants, setVariants] = useState<Variant[]>([emptyVariant()]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<Notice | null>(null);
  const [bulkListPrice, setBulkListPrice] = useState("");
  const [bulkGstInclusive, setBulkGstInclusive] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<Notice | null>(null);
  const [optionsEditable, setOptionsEditable] = useState(true);
  const [studioManaged, setStudioManaged] = useState(true);
  const [skuPrefix, setSkuPrefix] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(productId));
  const [loaded, setLoaded] = useState(!productId);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [status, setStatus] = useState("draft");
  const [lifecycleState, setLifecycleState] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [actingSellerId, setActingSellerId] = useState("");
  const [provisionSellerId, setProvisionSellerId] = useState("");
  const [sellerProvisionReason, setSellerProvisionReason] = useState("");
  const [actingReason, setActingReason] = useState("");
  const [actingReference, setActingReference] = useState("");

  const meta = useQuery({
    queryKey: ["buildkart", "product-studio", mode, "meta", appliedSearch],
    queryFn: () =>
      request<MetaResponse>(
        `${apiBase}?q=${encodeURIComponent(appliedSearch)}`,
      ),
  });
  const sellers = useQuery({
    queryKey: ["buildkart", "sellers", mode],
    enabled: mode === "admin",
    queryFn: () =>
      request<{ sellers: Array<{ id: string; name: string }> }>(
        "/admin/buildkart/sellers",
      ),
  });

  async function loadInventory(skus: string[]) {
    const unique = Array.from(
      new Set(skus.map((sku) => sku.trim()).filter(Boolean)),
    );
    if (unique.length === 0) {
      setInventory([]);
      setInventoryError(null);
      return;
    }
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const endpoint =
        mode === "admin"
          ? "/admin/buildkart/inventory/summary"
          : "/vendor/buildkart/inventory/summary";
      const result = await request<{ items: InventoryItem[] }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ skus: unique }),
      });
      setInventory(result.items ?? []);
    } catch (error) {
      setInventoryError((error as Error).message);
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  }

  useEffect(() => {
    if (!productId) {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Invalid local draft.");
          }
          const saved = parsed as Record<string, unknown>;
          const restoredOptions = normalizeDraftOptions(saved.options);
          const restoredVariants = normalizeDraftVariants(saved.variants);
          setForm(normalizeDraftForm(saved.form));
          setSpecs(normalizeDraftSpecs(saved.specs));
          setTags(normalizeDraftTags(saved.tags));
          setOptions(restoredOptions);
          setVariants(
            restoredVariants.length > 0 ? restoredVariants : [emptyVariant()],
          );
          setNotice({
            kind: "info",
            text: "Restored the unsaved local draft from this browser.",
          });
          setDirty(true);
        } catch {
          localStorage.removeItem(draftKey);
        }
      }
      setLoaded(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    request<{ product: StudioProduct }>(`${apiBase}/${productId}`)
      .then(({ product }) => {
        if (cancelled) return;
        setForm({
          title: product.title,
          subtitle: product.subtitle,
          description: product.description,
          category_id: product.category_id,
          brand: product.brand,
          manufacturer: product.manufacturer,
          model_number: product.model_number,
          product_type: product.product_type,
          hsn_code: product.hsn_code,
          unit_of_measure: product.unit_of_measure,
          thumbnail: product.thumbnail,
        });
        setSpecs(
          product.specifications.length > 0
            ? product.specifications
            : [{ ...EMPTY_SPEC }],
        );
        setTags(product.tags);
        setOptions(product.options ?? []);
        setVariants(
          product.variants?.length ? product.variants : [emptyVariant()],
        );
        setOffers(product.offers ?? []);
        setProvisionSellerId("");
        setSellerProvisionReason("");
        setOptionsEditable(Boolean(product.options_editable));
        setStudioManaged(Boolean(product.studio_managed));
        setStatus(product.status);
        setLifecycleState(product.lifecycle_state ?? null);
        setCanEdit(product.can_edit);
        setLoaded(true);
        setDirty(false);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setNotice({ kind: "error", text: error.message });
          setCanEdit(false);
          setLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, draftKey, productId]);

  useEffect(() => {
    if (!loaded || !canEdit) return;
    const handle = window.setTimeout(() => {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          form,
          specs,
          tags,
          options,
          variants,
          updated_at: Date.now(),
        }),
      );
    }, 700);
    return () => window.clearTimeout(handle);
  }, [canEdit, draftKey, form, loaded, options, specs, tags, variants]);

  useEffect(() => {
    if (!loaded) return;
    const skus = Array.from(
      new Set(offers.map((offer) => offer.sku).filter(Boolean)),
    );
    void loadInventory(skus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, offers]);

  const validSpecs = useMemo(
    () => specs.filter((spec) => spec.name.trim() && spec.value.trim()),
    [specs],
  );

  const partialSpecRows = useMemo(
    () =>
      specs.filter(
        (spec) =>
          Boolean(spec.name.trim()) !== Boolean(spec.value.trim()),
      ),
    [specs],
  );

  const optionNames = options.map((option) => option.name.trim());

  const optionRowsComplete = options.every(
    (option) => option.name.trim() && option.values.length > 0,
  );

  const optionsMatchVariants = useMemo(() => {
    if (!optionsEditable) return true;
    if (options.length === 0) return true;
    if (!optionRowsComplete) return false;
    return variants.every((variant) =>
      optionNames.every((name) => Boolean(variant.options[name]?.trim())),
    );
  }, [optionNames, optionRowsComplete, options.length, optionsEditable, variants]);

  const duplicateSkus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const variant of variants) {
      const sku = variant.sku.trim().toLowerCase();
      if (!sku) continue;
      counts.set(sku, (counts.get(sku) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([sku]) => sku),
    );
  }, [variants]);

  const duplicateCombinations = useMemo(() => {
    if (options.length === 0) return new Set<string>();
    const counts = new Map<string, number>();
    for (const variant of variants) {
      const key = combinationKey(options, variant.options);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
  }, [options, variants]);

  const variantsReady =
    variants.length > 0 &&
    variants.every(
      (variant) =>
        Boolean(variant.title.trim()) &&
        Boolean(variant.details.trim()) &&
        Boolean(variant.sku.trim()),
    ) &&
    optionRowsComplete &&
    optionsMatchVariants &&
    duplicateSkus.size === 0 &&
    duplicateCombinations.size === 0;

  const hasPricedVariants =
    variants.length > 0 &&
    variants.every((variant) =>
      offers.some(
        (offer) =>
          offer.variant_id === variant.id &&
          offer.prices.some(
            (price) =>
              price.currency_code === "inr" &&
              (price.min_quantity === null ||
                price.min_quantity === undefined) &&
              price.amount > 0,
          ),
      ),
    );

  const checks = useMemo(
    () => [
      { label: "Title", ok: Boolean(form.title.trim()), required: true },
      {
        label: "Category",
        ok: Boolean(form.category_id),
        required: true,
      },
      { label: "Search tags", ok: tags.length > 0 },
      { label: "Specifications", ok: validSpecs.length > 0 },
      { label: "Variants and SKUs", ok: variantsReady },
      { label: "Pricing", ok: hasPricedVariants },
      { label: "Thumbnail", ok: Boolean(form.thumbnail.trim()) },
    ],
    [
      form.category_id,
      form.thumbnail,
      form.title,
      hasPricedVariants,
      tags,
      validSpecs,
      variantsReady,
    ],
  );

  const structuralLocked = status === "published" || offers.length > 0;
  const reviewActionDisabled = reviewLoading || dirty;
  const sectionOneDone = Boolean(form.title.trim() && form.category_id);
  const sectionTwoDone = tags.length > 0;
  const sectionThreeDone = validSpecs.length > 0;
  const sectionFourDone = variantsReady;
  const sectionFiveDone = hasPricedVariants;
  const reviewChecks = [
    {
      label: "Product title",
      ok: Boolean(form.title.trim()),
      required: true,
    },
    {
      label: "Category",
      ok: Boolean(form.category_id),
      required: true,
    },
    {
      label: "At least one variant",
      ok: variants.length > 0,
      required: true,
    },
    {
      label: "Every variant has a name",
      ok:
        variants.length > 0 &&
        variants.every((variant) => Boolean(variant.title.trim())),
      required: true,
    },
    {
      label: "Every variant has details shown in the app",
      ok:
        variants.length > 0 &&
        variants.every((variant) => Boolean(variant.details.trim())),
      required: true,
    },
    {
      label: "Every variant has a SKU",
      ok:
        variants.length > 0 &&
        variants.every((variant) => Boolean(variant.sku.trim())),
      required: true,
    },
    {
      label: "Every variant has an INR offer price",
      ok: hasPricedVariants,
      required: true,
    },
  ];
  const reviewReady = reviewChecks.every(
    (check) => !check.required || check.ok,
  );
  const reviewStatusLabel =
    status === "published"
      ? "Published"
      : status === "proposed"
        ? "In review"
        : status === "rejected"
          ? "Needs attention"
          : reviewReady
            ? "Ready to publish"
            : "Needs attention";
  const reviewStatusColor =
    status === "published"
      ? "green"
      : status === "proposed"
        ? "blue"
        : status === "rejected" || !reviewReady
          ? "red"
          : "green";
  const readySections = [
    sectionOneDone,
    sectionTwoDone,
    sectionThreeDone,
    sectionFourDone,
    sectionFiveDone,
  ].filter(Boolean).length;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice(null);
  };

  const addTagValues = (raw: string) => {
    const candidates = raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    setTags((current) => {
      const next = [...current];
      for (const candidate of candidates) {
        if (
          !next.some(
            (value) => value.toLowerCase() === candidate.toLowerCase(),
          )
        ) {
          next.push(candidate);
        }
      }
      return next;
    });
    setTagInput("");
    setDirty(true);
    setNotice(null);
  };

  const removeTag = (value: string) => {
    setTags((current) => current.filter((tag) => tag !== value));
    setDirty(true);
  };

  const updateSpec = (index: number, patch: Partial<Spec>) => {
    setSpecs((current) =>
      current.map((spec, position) =>
        position === index ? { ...spec, ...patch } : spec,
      ),
    );
    setDirty(true);
    setNotice(null);
  };

  const addSpec = () => {
    setSpecs((current) => [...current, { ...EMPTY_SPEC }]);
    setDirty(true);
  };

  const removeSpec = (index: number) => {
    setSpecs((current) => {
      const next = current.filter((_, position) => position !== index);
      return next.length > 0 ? next : [{ ...EMPTY_SPEC }];
    });
    setDirty(true);
  };

  const updateVariant = (index: number, patch: Partial<Variant>) => {
    setVariants((current) =>
      current.map((variant, position) =>
        position === index ? { ...variant, ...patch } : variant,
      ),
    );
    setDirty(true);
    setNotice(null);
  };

  const removeVariant = (index: number) => {
    setVariants((current) =>
      current.filter((_, position) => position !== index),
    );
    setDirty(true);
  };

  const addVariant = () => {
    setVariants((current) => [
      ...current,
      { ...emptyVariant(), title: `Variant ${current.length + 1}` },
    ]);
    setDirty(true);
    setNotice(null);
  };

  const duplicateVariant = (index: number) => {
    setVariants((current) => {
      const source = current[index];
      if (!source) return current;
      return [
        ...current,
        {
          ...source,
          id: undefined,
          title: `${source.title.trim() || `Variant ${index + 1}`} copy`,
          sku: "",
          ean: "",
          upc: "",
          barcode: "",
        },
      ];
    });
    setDirty(true);
    setNotice(null);
  };

  const fillBlankSkus = () => {
    const prefix = skuPrefix.trim();
    if (!prefix) {
      setNotice({ kind: "error", text: "Enter a SKU prefix first." });
      return;
    }
    if (!variants.some((variant) => !variant.sku.trim())) {
      setNotice({ kind: "info", text: "Every variant already has a SKU." });
      return;
    }

    const used = new Set(
      variants
        .map((variant) => variant.sku.trim().toLowerCase())
        .filter(Boolean),
    );
    const generated: string[] = [];
    let index = 1;
    for (const variant of variants) {
      if (variant.sku.trim()) {
        generated.push(variant.sku);
        continue;
      }
      let candidate = `${prefix}-${String(index).padStart(2, "0")}`;
      while (used.has(candidate.toLowerCase())) {
        index += 1;
        candidate = `${prefix}-${String(index).padStart(2, "0")}`;
      }
      used.add(candidate.toLowerCase());
      generated.push(candidate);
      index += 1;
    }

    setVariants((current) =>
      current.map((variant, position) => ({
        ...variant,
        sku: variant.sku.trim() ? variant.sku : generated[position],
      })),
    );
    setDirty(true);
    setNotice({ kind: "success", text: "Filled blank SKUs with the prefix." });
  };

  const applyBulkReferencePricing = async () => {
    const listMinor = Math.round(Number(bulkListPrice) * 100);
    if (!Number.isInteger(listMinor) || listMinor <= 0) {
      setBulkNotice({
        kind: "error",
        text: "Enter a positive list price before applying bulk reference pricing.",
      });
      return;
    }
    const eligible = offers.filter((offer) =>
      offer.prices.some(
        (price) =>
          price.currency_code === "inr" &&
          (price.min_quantity === null || price.min_quantity === undefined),
      ),
    );
    if (eligible.length === 0) {
      setBulkNotice({
        kind: "info",
        text: "No offers have a base selling price yet. Price variants individually first.",
      });
      return;
    }
    const blocked = eligible.flatMap((offer) => {
      const selling = offer.prices.find(
        (price) =>
          price.currency_code === "inr" &&
          (price.min_quantity === null || price.min_quantity === undefined),
      );
      return selling && selling.amount > listMinor
        ? [`${offer.sku || offer.id} (${inr(selling.amount)})`]
        : [];
    });
    if (blocked.length > 0) {
      setBulkNotice({
        kind: "error",
        text: `No offers were updated. The list price ${inr(
          listMinor,
        )} is below the current selling price for: ${blocked.join(", ")}.`,
      });
      return;
    }
    setBulkSaving(true);
    setBulkNotice(null);
    const failures: string[] = [];
    let updatedCount = 0;
    for (const offer of eligible) {
      try {
        const endpoint =
          mode === "admin"
            ? `/admin/buildkart/offers/${offer.id}/pricing`
            : `/vendor/buildkart/offers/${offer.id}/pricing`;
        const result = await request<{
          pricing: { sku: string; prices: OfferPrice[] };
        }>(endpoint, {
          method: "POST",
          body: JSON.stringify({
            prices: offer.prices.map((price) => ({
              id: price.id,
              amount: price.amount,
              currency_code: price.currency_code,
              min_quantity: price.min_quantity ?? null,
              max_quantity: price.max_quantity ?? null,
              ...(price.rules && Object.keys(price.rules).length > 0
                ? { rules: price.rules }
                : {}),
            })),
            reason: null,
            list_price_minor: listMinor,
            gst_inclusive: bulkGstInclusive,
            enforce_policy: true,
          }),
        });
        setOffers((current) =>
          current.map((row) =>
            row.id === offer.id
              ? {
                  ...row,
                  sku: result.pricing.sku,
                  list_price_minor: listMinor,
                  gst_inclusive: bulkGstInclusive,
                  prices: result.pricing.prices,
                }
              : row,
          ),
        );
        updatedCount += 1;
      } catch (error) {
        failures.push(`${offer.sku}: ${(error as Error).message}`);
      }
    }
    setBulkSaving(false);
    if (failures.length > 0) {
      setBulkNotice({
        kind: "error",
        text: `${updatedCount} offers updated. Failed: ${failures.join("; ")}`,
      });
    } else {
      setBulkNotice({
        kind: "success",
        text: `${updatedCount} offers updated with list price and GST setting. Selling prices were preserved.`,
      });
    }
  };

  const runReviewAction = async (
    action:
      | "submit"
      | "approve"
      | "reject"
      | "request-changes"
      | "reopen"
      | "withdraw"
      | "unpublish"
      | "pause"
      | "archive"
      | "restore",
  ) => {
    if (!productId) {
      setReviewNotice({
        kind: "error",
        text: "Save the draft before using the review workflow.",
      });
      return;
    }
    if (
      (action === "reject" || action === "request-changes") &&
      !reviewMessage.trim()
    ) {
      setReviewNotice({
        kind: "error",
        text: "Add a review message before rejecting or requesting changes.",
      });
      return;
    }
    setReviewLoading(true);
    setReviewNotice(null);
    try {
      const result = await request<{
        product: { id: string; status: string; title: string };
        action: string;
      }>(`${apiBase}/${productId}/review`, {
        method: "POST",
        body: JSON.stringify({
          action,
          message: reviewMessage || undefined,
          reason: actingReason || reviewMessage || undefined,
          ...(mode === "admin" && actingSellerId
            ? {
                acting_for_seller_id: actingSellerId,
                reference: actingReference || undefined,
              }
            : {}),
        }),
      });
      setStatus(result.product.status);
      if (action === "unpublish") setLifecycleState("unpublished");
      else if (action === "pause") setLifecycleState("paused");
      else if (action === "archive") setLifecycleState("archived");
      else if (action === "restore") setLifecycleState("restored");
      else if (action === "request-changes" && status === "published") {
        setLifecycleState("changes_requested");
      } else if (action === "approve") setLifecycleState(null);
      setReviewMessage("");
      setDirty(false);
      setReviewNotice({
        kind: "success",
        text:
          action === "approve"
            ? "Product published. A STATUS_CHANGE audit record was written."
            : action === "reject"
              ? "Product rejected with the review message."
              : action === "request-changes"
                ? "Change request recorded."
                : action === "reopen"
                  ? "Product reopened as a draft."
                  : action === "withdraw"
                    ? "Submission withdrawn; product is a draft again."
                    : action === "unpublish"
                      ? "Product unpublished and returned to draft."
                      : action === "pause"
                        ? "Product paused and removed from the active catalogue."
                        : action === "archive"
                          ? "Product archived as a draft."
                          : action === "restore"
                            ? "Product restored as a draft."
                            : "Product submitted for review.",
      });
    } catch (error) {
      setReviewNotice({
        kind: "error",
        text: (error as Error).message,
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      setNotice({ kind: "error", text: "Enter a product title before saving." });
      return;
    }
    if (partialSpecRows.length > 0) {
      setNotice({
        kind: "error",
        text: "Complete or remove the partially filled specification rows before saving.",
      });
      return;
    }
    if (optionsEditable && !optionRowsComplete) {
      setNotice({
        kind: "error",
        text: "Complete every option name and add at least one value.",
      });
      return;
    }
    if (optionsEditable && !optionsMatchVariants) {
      setNotice({
        kind: "error",
        text: "Option values are read-only. Save the product or contact support.",
      });
      return;
    }
    if (duplicateSkus.size > 0) {
      setNotice({ kind: "error", text: "SKUs must be unique." });
      return;
    }
    if (duplicateCombinations.size > 0) {
      setNotice({ kind: "error", text: "Variant combinations must be unique." });
      return;
    }
    if (mode === "admin" && provisionSellerId && !sellerProvisionReason.trim()) {
      setNotice({
        kind: "error",
        text: "Enter a reason before provisioning seller offers.",
      });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        ...form,
        ...(mode === "admin" && provisionSellerId
          ? {
              seller_id: provisionSellerId,
              seller_provision_reason: sellerProvisionReason,
            }
          : {}),
        tags,
        specifications: validSpecs.map((spec) => ({
          name: spec.name,
          value: spec.value,
          unit: spec.unit,
        })),
        options: options.map((option) => ({
          name: option.name,
          values: option.values,
        })),
        variants: variants.map((variant) => ({
          id: variant.id ?? null,
          title: variant.title,
          details: variant.details,
          image_url: variant.image_url,
          sku: variant.sku,
          ean: variant.ean,
          upc: variant.upc,
          barcode: variant.barcode,
          options: variant.options,
        })),
      };
      const result = await request<{ product: StudioProduct }>(
        productId ? `${apiBase}/${productId}` : apiBase,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      localStorage.removeItem(draftKey);
      setDirty(false);
      setLastSaved(new Date().toLocaleTimeString());
      setStatus(result.product.status);
      setCanEdit(result.product.can_edit);
      setOptions(result.product.options ?? []);
      setVariants(
        result.product.variants?.length
          ? result.product.variants
          : [emptyVariant()],
      );
      setOffers(result.product.offers ?? []);
      setOptionsEditable(Boolean(result.product.options_editable));
      setStudioManaged(Boolean(result.product.studio_managed));
      setNotice({
        kind: "success",
        text: productId
          ? "Draft saved. The product master record is updated."
          : "Draft created. You can continue editing it in this studio.",
      });
      if (!productId) {
        navigate(`/product-studio/${result.product.id}`);
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: (error as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!window.confirm("Discard this local draft and start again?")) return;
    localStorage.removeItem(draftKey);
    setForm(EMPTY_FORM);
    setSpecs([{ ...EMPTY_SPEC }]);
    setTags([]);
    setOptions([]);
    setVariants([emptyVariant()]);
    setSkuPrefix("");
    setTagInput("");
    setDirty(false);
    setNotice({ kind: "info", text: "Started a new local draft." });
    if (productId) {
      navigate("/product-studio");
    }
  };

  const previewTitle = form.title.trim() || "Untitled product";
  const previewCategory =
    meta.data?.categories.find((category) => category.id === form.category_id)
      ?.name ?? "No category selected";

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">
                {productId ? "Edit product" : "New product"}
              </Heading>
              <StatusBadge color="orange">Staging</StatusBadge>
              <StatusBadge
                color={
                  status === "published"
                    ? "green"
                    : status === "proposed"
                      ? "blue"
                      : "grey"
                }
              >
                {status}
              </StatusBadge>
              {!studioManaged ? (
                <StatusBadge color="grey">Catalogue-managed</StatusBadge>
              ) : null}
            </div>
            <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
              One continuous product record covering details, search tags,
              specifications, variants, SKUs, B2C pricing, read-only Tryton
              inventory and the review-to-publish workflow.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/products">
              <Button size="small" variant="secondary">
                Back to products
              </Button>
            </Link>
            {productId ? (
              <Link to={`/products/${productId}`}>
                <Button size="small" variant="secondary">
                  Open native record
                </Button>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="border-t border-ui-border-base px-6 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ui-fg-subtle">
            <span className="font-medium text-ui-fg-base">
              {readySections}/5 available sections ready
            </span>
            <span>Â·</span>
            <span>
              {dirty ? "Unsaved changes" : "No unsaved changes"}
              {lastSaved ? ` Â· saved ${lastSaved}` : ""}
            </span>
            <span>Â·</span>
            <span>Local autosave keeps a recovery copy in this browser.</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
            <div
              className="h-full rounded-full bg-ui-bg-interactive transition-all"
              style={{ width: `${(readySections / 5) * 100}%` }}
            />
          </div>
        </div>
      </Container>

      {notice ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "error"
              ? "border-ui-border-error bg-ui-bg-error text-ui-fg-error"
              : notice.kind === "success"
                ? "border-ui-border-success bg-ui-bg-success text-ui-fg-success"
                : "border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      {!loading && canEdit ? <WorkspaceTabs loaded={loaded} /> : null}

      {loading ? (
        <Container>
          <Text size="small" className="text-ui-fg-subtle">
            Loading product recordâ€¦
          </Text>
        </Container>
      ) : !canEdit ? (
        <Container className="flex flex-col gap-2">
          <Heading level="h2">Read-only product</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            This product is not a draft you can edit. Published product changes
            are handled through the review flow in a later slice.
          </Text>
          <Link to={`/products/${productId}`}>
            <Button size="small">Open native record</Button>
          </Link>
        </Container>
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <Container className="min-w-0 flex-1 p-0">
            {!productId ? (
            <div className="px-6 py-5">
              <Heading level="h2">Catalogue search</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Check whether the product already exists before creating a
                duplicate master record.
              </Text>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setAppliedSearch(search.trim());
                }}
              >
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search existing products by title"
                />
                <Button size="small" type="submit" variant="secondary">
                  Search
                </Button>
              </form>
              <div className="mt-3 flex flex-col divide-y divide-ui-border-base">
                {(meta.data?.catalogue ?? []).length === 0 ? (
                  <Text size="small" className="py-2 text-ui-fg-subtle">
                    {meta.isPending
                      ? "Searchingâ€¦"
                      : appliedSearch
                        ? "No matching products."
                        : "No recent products to show."}
                  </Text>
                ) : (
                  (meta.data?.catalogue ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="rounded object-cover"
                            style={{ width: 36, height: 36, flexShrink: 0 }}
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-ui-bg-subtle" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ui-fg-base">
                            {item.title}
                          </p>
                          <p className="text-xs text-ui-fg-subtle">
                            {item.categories?.[0]?.name ?? "Uncategorised"} Â·{" "}
                            {item.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {mode === "admin" ||
                        mode === "vendor" ||
                        item.status === "draft" ? (
                          <Link
                            to={`/product-studio/${item.id}`}
                            className="text-xs font-medium text-ui-fg-interactive hover:underline"
                          >
                            Edit in studio
                          </Link>
                        ) : null}
                        <Link
                          to={`/products/${item.id}`}
                          className="text-xs font-medium text-ui-fg-interactive hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            ) : null}

            <Section
              id="studio-details"
              number={1}
              title="Product details"
              description="The commercial identity of the item. Keep the title customer-facing and the internal codes exact."
              complete={sectionOneDone}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Product title" required>
                    <Input
                      value={form.title}
                      onChange={(event) => update("title", event.target.value)}
                      placeholder="e.g. AquaTek PPR Pipe 25mm 3m"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="Short description"
                    hint="A one-line summary used in listings and search."
                  >
                    <Input
                      value={form.subtitle}
                      onChange={(event) =>
                        update("subtitle", event.target.value)
                      }
                      placeholder="Optional one-line summary"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Full description">
                    <Textarea
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                      placeholder="Describe what the product is, what it includes and how it is used."
                      rows={5}
                    />
                  </Field>
                </div>
                <Field label="Category" required>
                  <select
                    className="h-8 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base"
                    value={form.category_id}
                    onChange={(event) =>
                      update("category_id", event.target.value)
                    }
                  >
                    <option value="">Select a category</option>
                    {(meta.data?.categories ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {mode === "admin" ? (
                  <Field
                    label="Seller offer provisioning"
                    hint="Optional. Selecting a seller explicitly provisions offers for every SKU that has no offer. Requires a reason and is audited."
                  >
                    <select
                      className="h-8 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm text-ui-fg-base"
                      value={provisionSellerId}
                      onChange={(event) =>
                        setProvisionSellerId(event.target.value)
                      }
                    >
                      <option value="">Do not provision seller offers</option>
                      {(sellers.data?.sellers ?? []).map((seller) => (
                        <option key={seller.id} value={seller.id}>
                          {seller.name} â€” {seller.id}
                        </option>
                      ))}
                    </select>
                    {provisionSellerId ? (
                      <Input
                        className="mt-2"
                        value={sellerProvisionReason}
                        onChange={(event) =>
                          setSellerProvisionReason(event.target.value)
                        }
                        placeholder="Reason for provisioning this seller (required)"
                      />
                    ) : null}
                  </Field>
                ) : null}
                <Field label="Product type">
                  <Input
                    value={form.product_type}
                    onChange={(event) =>
                      update("product_type", event.target.value)
                    }
                    placeholder="e.g. Pipes and fittings"
                  />
                </Field>
                <Field label="Brand">
                  <Input
                    value={form.brand}
                    onChange={(event) => update("brand", event.target.value)}
                    placeholder="e.g. AquaTek"
                  />
                </Field>
                <Field label="Manufacturer">
                  <Input
                    value={form.manufacturer}
                    onChange={(event) =>
                      update("manufacturer", event.target.value)
                    }
                    placeholder="Legal manufacturer name"
                  />
                </Field>
                <Field label="Model / part number">
                  <Input
                    value={form.model_number}
                    onChange={(event) =>
                      update("model_number", event.target.value)
                    }
                    placeholder="Manufacturer model or part number"
                  />
                </Field>
                <Field
                  label="HSN / GST code"
                  hint="Stored on the product master for tax and invoice use."
                >
                  <Input
                    value={form.hsn_code}
                    onChange={(event) =>
                      update("hsn_code", event.target.value)
                    }
                    placeholder="e.g. 3917"
                  />
                </Field>
                <Field label="Unit of measure">
                  <Input
                    value={form.unit_of_measure}
                    onChange={(event) =>
                      update("unit_of_measure", event.target.value)
                    }
                    placeholder="e.g. piece, metre, box"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field
                    label="Thumbnail URL"
                    hint="Use a governed HTTPS image URL in staging."
                  >
                    <Input
                      value={form.thumbnail}
                      onChange={(event) =>
                        update("thumbnail", event.target.value)
                      }
                      placeholder="https://â€¦"
                    />
                  </Field>
                </div>
              </div>
            </Section>

            <Section
              id="studio-tags"
              number={2}
              title="Search tags"
              description="Tags help operators find the product. They are not a substitute for structured specifications."
              complete={sectionTwoDone}
            >
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-ui-bg-subtle px-3 py-1 text-xs text-ui-fg-base"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      className="text-ui-fg-muted hover:text-ui-fg-base"
                      onClick={() => removeTag(tag)}
                    >
                      Ã—
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTagValues(tagInput);
                    }
                    if (event.key === "Backspace" && !tagInput && tags.length) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  onBlur={() => addTagValues(tagInput)}
                  placeholder="Type a tag and press Enter"
                  className="max-w-sm"
                />
                <Button
                  size="small"
                  type="button"
                  variant="secondary"
                  onClick={() => addTagValues(tagInput)}
                >
                  Add tag
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(meta.data?.tags ?? [])
                  .filter(
                    (tag) =>
                      !tags.some(
                        (value) =>
                          value.toLowerCase() === tag.value.toLowerCase(),
                      ),
                  )
                  .slice(0, 10)
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="rounded-full border border-ui-border-base px-2.5 py-1 text-xs text-ui-fg-subtle hover:bg-ui-bg-subtle"
                      onClick={() => addTagValues(tag.value)}
                    >
                      + {tag.value}
                    </button>
                  ))}
              </div>
            </Section>

            <Section
              id="studio-specs"
              number={3}
              title="Specifications"
              description="Structured product facts. Each specification becomes a filterable product attribute; do not put these in the title or description."
              complete={sectionThreeDone}
            >
              <div className="flex flex-col gap-2">
                {specs.map((spec, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-3 sm:flex-row sm:items-center"
                  >
                    <Input
                      list="product-studio-spec-suggestions"
                      value={spec.name}
                      onChange={(event) =>
                        updateSpec(index, { name: event.target.value })
                      }
                      placeholder="Specification name"
                      className="sm:flex-1"
                    />
                    <Input
                      value={spec.value}
                      onChange={(event) =>
                        updateSpec(index, { value: event.target.value })
                      }
                      placeholder="Value"
                      className="sm:flex-1"
                    />
                    <Input
                      value={spec.unit}
                      onChange={(event) =>
                        updateSpec(index, { unit: event.target.value })
                      }
                      placeholder="Unit (optional)"
                      className="sm:w-32"
                    />
                    <Button
                      type="button"
                      size="small"
                      variant="transparent"
                      onClick={() => removeSpec(index)}
                      aria-label="Remove specification"
                      className="shrink-0"
                    >
                      Ã—
                    </Button>
                  </div>
                ))}
                <datalist id="product-studio-spec-suggestions">
                  {SPEC_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="small"
                    type="button"
                    variant="secondary"
                    onClick={addSpec}
                  >
                    Add specification
                  </Button>
                  <Text size="small" className="text-ui-fg-subtle">
                    {validSpecs.length} complete Â·{" "}
                    {partialSpecRows.length} incomplete
                  </Text>
                </div>
              </div>
            </Section>

            <Section
              id="studio-variants"
              number={4}
              title="Variants and SKUs"
              description="Each variant has a customer-facing name, details and an optional image. Variants are created directly; SKUs stay unique."
              complete={sectionFourDone}
            >
              {structuralLocked ? (
                <div className="mb-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                  <Text size="small" className="text-ui-fg-subtle">
                    This product is published or has seller offers. Option axes,
                    adding, duplicating or removing variants and SKU changes are
                    locked. Variant names, details and images remain editable.
                  </Text>
                </div>
              ) : null}
              {options.length > 0 ? (
                <div>
                  <Heading level="h2">Legacy options (read-only)</Heading>
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    This product was created with option axes. They are retained
                    for compatibility and cannot be changed here. Manage direct
                    variants below.
                  </Text>
                  <div className="mt-3 flex flex-col gap-2">
                    {options.map((option, index) => (
                      <div
                        key={`${option.name}-${index}`}
                        className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3"
                      >
                        <Text size="small" weight="plus">
                          {option.name || `Option ${index + 1}`}
                        </Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {option.values.join(", ")}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                  <Text size="small" className="text-ui-fg-subtle">
                    Direct variant mode. No option axes are required; add or
                    edit variants below.
                    {!optionsEditable
                      ? " Imported catalogue variants are structural read-only; names, details and images remain editable."
                      : ""}
                  </Text>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-ui-border-base pt-5">
                <div>
                  <Heading level="h2">Variants</Heading>
                  <Text size="small" className="mt-1 text-ui-fg-subtle">
                    {variants.length} variant
                    {variants.length === 1 ? "" : "s"} Â· non-empty SKUs must be
                    unique.
                  </Text>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {options.length === 0 && optionsEditable ? (
                    <Button
                      size="small"
                      type="button"
                      variant="secondary"
                      onClick={addVariant}
                      disabled={structuralLocked}
                    >
                      Add variant
                    </Button>
                  ) : null}
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ui-fg-subtle">
                      Bulk SKU prefix
                    </span>
                    <Input
                      value={skuPrefix}
                      onChange={(event) => setSkuPrefix(event.target.value)}
                      placeholder="e.g. AK-PPR"
                      className="w-40"
                      disabled={structuralLocked}
                    />
                  </label>
                  <Button
                    size="small"
                    type="button"
                    variant="secondary"
                    onClick={fillBlankSkus}
                    disabled={structuralLocked}
                  >
                    Fill blank SKUs
                  </Button>
                </div>
              </div>

              {!optionsMatchVariants ? (
                <div className="mt-3 rounded-lg border border-ui-border-error bg-ui-bg-error px-4 py-3 text-sm text-ui-fg-error">
                  Option values are read-only. Save the product or contact support.
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-2">
                {variants.map((variant, index) => {
                  const skuDuplicate = Boolean(
                    variant.sku.trim() &&
                      duplicateSkus.has(variant.sku.trim().toLowerCase()),
                  );
                  const combinationDuplicate = Boolean(
                    options.length > 0 &&
                      duplicateCombinations.has(
                        combinationKey(options, variant.options),
                      ),
                  );
                  const combinationLabel =
                    options.length > 0
                      ? options
                          .map(
                            (option) =>
                              `${option.name}: ${
                                variant.options[option.name] ?? "â€”"
                              }`,
                          )
                          .join(" Â· ")
                      : variant.title.trim() || `Variant ${index + 1}`;
                  return (
                    <div
                      key={variant.id ?? index}
                      className={`rounded-lg border p-3 ${
                        skuDuplicate || combinationDuplicate
                          ? "border-ui-border-error bg-ui-bg-error"
                          : "border-ui-border-base"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-ui-fg-subtle">
                          {combinationLabel}
                        </span>
                        {optionsEditable && variants.length > 1 ? (
                          <div className="flex flex-wrap gap-1">
                            {options.length === 0 ? (
                              <Button
                                size="small"
                                type="button"
                                variant="transparent"
                                onClick={() => duplicateVariant(index)}
                                disabled={structuralLocked}
                              >
                                Duplicate
                              </Button>
                            ) : null}
                            <Button
                              size="small"
                              type="button"
                              variant="transparent"
                              onClick={() => removeVariant(index)}
                              disabled={structuralLocked}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : optionsEditable && options.length === 0 ? (
                          <Button
                            size="small"
                            type="button"
                            variant="transparent"
                            onClick={() => duplicateVariant(index)}
                            disabled={structuralLocked}
                          >
                            Duplicate
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-ui-fg-subtle">
                            Variant name *
                          </span>
                          <Input
                            value={variant.title}
                            onChange={(event) =>
                              updateVariant(index, {
                                title: event.target.value,
                              })
                            }
                            placeholder="Variant name"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-ui-fg-subtle">
                            SKU * {skuDuplicate ? "Â· duplicate" : ""}
                          </span>
                          <Input
                            value={variant.sku}
                            onChange={(event) =>
                              updateVariant(index, {
                                sku: event.target.value,
                              })
                            }
                            placeholder="Unique SKU"
                            disabled={structuralLocked}
                          />
                        </label>
                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-xs text-ui-fg-subtle">
                            Details shown in app *
                          </span>
                          <Textarea
                            value={variant.details}
                            onChange={(event) =>
                              updateVariant(index, {
                                details: event.target.value,
                              })
                            }
                            placeholder="What the buyer should see for this variant"
                          />
                        </label>
                        <label className="flex flex-col gap-1 md:col-span-2">
                          <span className="text-xs text-ui-fg-subtle">
                            Variant image URL
                          </span>
                          <Input
                            value={variant.image_url}
                            onChange={(event) =>
                              updateVariant(index, {
                                image_url: event.target.value,
                              })
                            }
                            placeholder="https://..."
                          />
                        </label>
                        {variant.image_url.trim() ? (
                          <img
                            src={variant.image_url}
                            alt=""
                            className="h-16 w-16 rounded-md border border-ui-border-base object-cover"
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
            <Section
              id="studio-pricing"
              number={5}
              title="Pricing"
              description="Offer-scoped B2C and B2B pricing. Each channel has its own validation, save and audit trail."
              complete={sectionFiveDone}
            >
              {variants.length === 0 ? (
                <Text size="small" className="text-ui-fg-subtle">
                  Add a variant before setting pricing.
                </Text>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
                    <p className="text-sm font-medium text-ui-fg-base">
                      Bulk reference pricing
                    </p>
                    <p className="mt-1 text-xs text-ui-fg-subtle">
                      Apply the same list price and GST setting to every offer
                      that already has a selling price. Selling prices and
                      quantity tiers are preserved.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-ui-fg-subtle">
                          List price (INR)
                        </span>
                        <Input
                          inputMode="decimal"
                          value={bulkListPrice}
                          onChange={(event) =>
                            setBulkListPrice(event.target.value)
                          }
                          placeholder="MRP / list price"
                          className="md:w-44"
                        />
                      </label>
                      <label className="flex items-center gap-2 pb-2 text-sm text-ui-fg-base">
                        <input
                          type="checkbox"
                          checked={bulkGstInclusive}
                          onChange={(event) =>
                            setBulkGstInclusive(event.target.checked)
                          }
                        />
                        GST-inclusive
                      </label>
                      <Button
                        size="small"
                        type="button"
                        variant="secondary"
                        isLoading={bulkSaving}
                        onClick={applyBulkReferencePricing}
                      >
                        Apply to all offers
                      </Button>
                    </div>
                    {bulkNotice ? (
                      <p
                        className={`mt-2 text-xs ${
                          bulkNotice.kind === "error"
                            ? "text-ui-fg-error"
                            : bulkNotice.kind === "success"
                              ? "text-ui-fg-success"
                              : "text-ui-fg-subtle"
                        }`}
                      >
                        {bulkNotice.text}
                      </p>
                    ) : null}
                  </div>
                  {variants.map((variant) => {
                    const variantOffers = offers.filter(
                      (offer) => offer.variant_id === variant.id,
                    );
                    const variantLabel =
                      variant.title || variant.sku || "Unnamed variant";
                    return (
                      <div key={variant.id ?? variantLabel} className="flex flex-col gap-2">
                        {variantOffers.length === 0 ? (
                          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                            <p className="text-sm font-medium text-ui-fg-base">
                              {variantLabel}
                            </p>
                            <p className="mt-1 text-xs text-ui-fg-subtle">
                              No seller offer exists for this variant yet.
                              Pricing becomes available after the offer and
                              inventory provisioning step.
                            </p>
                          </div>
                        ) : (
                          variantOffers.map((offer) => (
                            <OfferPricingEditor
                              key={offer.id}
                              offer={offer}
                              mode={mode}
                              variantLabel={variantLabel}
                              onSaved={(updated) =>
                                setOffers((current) =>
                                  current.map((row) =>
                                    row.id === updated.id ? updated : row,
                                  ),
                                )
                              }
                            />
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                <Text size="small" className="text-ui-fg-subtle">
                  B2C pricing is stored on the offer. B2B pricing is stored in a
                  dedicated per-offer price list scoped to the B2B Trade
                  Customers group. Each channel saves separately and never
                  changes the other. Seller price changes require the
                  seller-administration role; B2B changes require the
                  b2b-price.update permission.
                </Text>
              </div>
            </Section>
            <Section
              id="studio-inventory"
              number={6}
              title="Inventory"
              description="Read-only Tryton stock summary by SKU, plus an audited adjustment request that never changes stock directly."
            >
              {offers.length === 0 ? (
                <Text size="small" className="text-ui-fg-subtle">
                  No seller offer/SKU exists for this product yet. Inventory
                  becomes visible after offer provisioning.
                </Text>
              ) : (
                <div className="flex flex-col gap-3">
                  {inventoryLoading ? (
                    <Text size="small" className="text-ui-fg-subtle">
                      Loading inventory from Trytonâ€¦
                    </Text>
                  ) : inventoryError ? (
                    <Text size="small" className="text-ui-fg-error">
                      {inventoryError}
                    </Text>
                  ) : (
                    offers.map((offer) => {
                      const item = inventory.find(
                        (row) => row.sku === offer.sku,
                      );
                      const variant =
                        variants.find(
                          (row) => row.id === offer.variant_id,
                        ) ?? null;
                      const locationRows =
                        item?.tryton.locations.filter(
                          (location) =>
                            location.on_hand !== 0 ||
                            location.reserved !== 0 ||
                            location.draft !== 0,
                        ) ?? [];
                      return (
                        <div
                          key={offer.id}
                          className="rounded-lg border border-ui-border-base p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-ui-fg-base">
                                {variant?.title || offer.sku}
                              </p>
                              <p className="text-xs text-ui-fg-subtle">
                                {offer.sku} Â· {offer.seller_name}
                              </p>
                            </div>
                            <StatusBadge
                              color={item?.tryton.found ? "green" : "orange"}
                            >
                              {item?.tryton.found
                                ? "Tryton product found"
                                : "Not in Tryton"}
                            </StatusBadge>
                          </div>

                          {item?.tryton.found ? (
                            <>
                              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                                {[
                                  ["On hand", item.tryton.on_hand],
                                  ["Reserved", item.tryton.reserved],
                                  ["ATP", item.tryton.atp],
                                  ["Draft moves", item.tryton.draft],
                                ].map(([label, value]) => (
                                  <div
                                    key={String(label)}
                                    className="rounded-md bg-ui-bg-subtle px-3 py-2"
                                  >
                                    <p className="text-xs text-ui-fg-subtle">
                                      {label}
                                    </p>
                                    <p className="text-sm font-semibold text-ui-fg-base">
                                      {String(value)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                              {locationRows.length > 0 ? (
                                <div className="mt-3 overflow-x-auto">
                                  <Table>
                                    <Table.Header>
                                      <Table.Row>
                                        <Table.HeaderCell>
                                          Tryton location
                                        </Table.HeaderCell>
                                        <Table.HeaderCell>
                                          On hand
                                        </Table.HeaderCell>
                                        <Table.HeaderCell>
                                          Reserved
                                        </Table.HeaderCell>
                                        <Table.HeaderCell>
                                          ATP
                                        </Table.HeaderCell>
                                      </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                      {locationRows.map((location) => (
                                        <Table.Row key={location.id}>
                                          <Table.Cell>
                                            {location.name}
                                          </Table.Cell>
                                          <Table.Cell>
                                            {location.on_hand}
                                          </Table.Cell>
                                          <Table.Cell>
                                            {location.reserved}
                                          </Table.Cell>
                                          <Table.Cell>
                                            {location.atp}
                                          </Table.Cell>
                                        </Table.Row>
                                      ))}
                                    </Table.Body>
                                  </Table>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="mt-3 text-xs text-ui-fg-subtle">
                              Tryton has no product or stock movements for this
                              SKU yet. On-hand, reserved and ATP are not
                              provisioned.
                            </p>
                          )}

                          {item?.platform ? (
                            <p className="mt-3 text-xs text-ui-fg-subtle">
                              Staging reservation ledger:{" "}
                              {item.platform.available} available,{" "}
                              {item.platform.reserved} reserved (fixture data,
                              not Tryton).
                            </p>
                          ) : null}

                          <InventoryRequestForm
                            offer={offer}
                            mode={mode}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              <div className="mt-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                <Text size="small" className="text-ui-fg-subtle">
                  Tryton remains the inventory authority. Adjustment requests
                  are audited events with no stock effect. Low-stock thresholds,
                  non-stock policy and direct Tryton posting remain pending
                  approval.
                </Text>
              </div>
            </Section>
            <Section
              id="studio-review"
              number={7}
              title="Review and publish"
              description="Status check and publish. Required items block publishing; optional items are warnings."
              complete={reviewReady}
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ui-border-base px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ui-fg-base">
                      Review status
                    </p>
                    <p className="text-xs text-ui-fg-subtle">
                      Fix required items, then publish or submit for review.
                    </p>
                  </div>
                  <StatusBadge color={reviewStatusColor}>
                    {reviewStatusLabel}
                  </StatusBadge>
                </div>

                {dirty ? (
                  <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-sm text-ui-fg-subtle">
                    You have unsaved changes. Save before submitting, publishing
                    or changing lifecycle state.
                  </div>
                ) : null}

                {mode === "admin" ? (
                  <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                    <p className="text-sm font-medium text-ui-fg-base">
                      Acting for seller
                    </p>
                    <p className="mt-1 text-xs text-ui-fg-subtle">
                      Leave empty to act as BuildKart. Selecting a seller
                      requires a reason and records both identities in the audit
                      trail.
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <select
                        className="h-10 rounded-md border border-ui-border-base bg-ui-bg-base px-3 text-sm"
                        value={actingSellerId}
                        onChange={(event) => setActingSellerId(event.target.value)}
                      >
                        <option value="">Act as BuildKart</option>
                        {(sellers.data?.sellers ?? []).map((seller) => (
                          <option key={seller.id} value={seller.id}>
                            {seller.name} Â· {seller.id}
                          </option>
                        ))}
                      </select>
                      <Input
                        placeholder="Reason (required when acting)"
                        value={actingReason}
                        onChange={(event) => setActingReason(event.target.value)}
                      />
                      <Input
                        placeholder="Reference / ticket (optional)"
                        value={actingReference}
                        onChange={(event) => setActingReference(event.target.value)}
                      />
                    </div>
                    {actingSellerId ? (
                      <p className="mt-2 text-xs text-ui-fg-error">
                        Acting for {actingSellerId}. Every review action will be
                        audited with both actor and seller.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-lg border border-ui-border-base">
                  {reviewChecks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center justify-between gap-3 border-b border-ui-border-base px-4 py-2.5 text-sm last:border-b-0"
                    >
                      <span
                        className={
                          check.ok ? "text-ui-fg-base" : "text-ui-fg-subtle"
                        }
                      >
                        {check.label}
                        {check.required ? " *" : ""}
                      </span>
                      <span
                        className={
                          check.ok
                            ? "text-ui-fg-success"
                            : "text-ui-fg-subtle"
                        }
                      >
                        {check.ok ? "Ready" : "Missing"}
                      </span>
                    </div>
                  ))}
                </div>

                {status === "proposed" && mode === "admin" ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ui-fg-subtle">
                      Review message
                    </span>
                    <Input
                      value={reviewMessage}
                      onChange={(event) => setReviewMessage(event.target.value)}
                      placeholder="Required for rejection or change request"
                    />
                  </label>
                ) : null}

                {reviewNotice ? (
                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      reviewNotice.kind === "error"
                        ? "border-ui-border-error bg-ui-bg-error text-ui-fg-error"
                        : "border-ui-border-success bg-ui-bg-success text-ui-fg-success"
                    }`}
                  >
                    {reviewNotice.text}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {status === "draft" ? (
                    <Button
                      size="small"
                      type="button"
                      isLoading={reviewLoading}
                      disabled={!reviewReady || reviewActionDisabled}
                      onClick={() => runReviewAction("submit")}
                    >
                      Submit for review
                    </Button>
                  ) : null}

                  {status === "proposed" && mode === "admin" ? (
                    <>
                      <Button
                        size="small"
                        type="button"
                        isLoading={reviewLoading}
                        disabled={!reviewReady || reviewActionDisabled}
                        onClick={() => runReviewAction("approve")}
                      >
                        Approve and publish
                      </Button>
                      <Button
                        size="small"
                        type="button"
                        variant="secondary"
                        disabled={reviewActionDisabled}
                        onClick={() => runReviewAction("request-changes")}
                      >
                        Request changes
                      </Button>
                      <Button
                        size="small"
                        type="button"
                        variant="secondary"
                        disabled={reviewActionDisabled}
                        onClick={() => runReviewAction("reject")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}

                  {status === "proposed" && mode === "vendor" ? (
                    <Button
                      size="small"
                      type="button"
                      variant="secondary"
                      isLoading={reviewLoading}
                      disabled={reviewActionDisabled}
                      onClick={() => runReviewAction("withdraw")}
                    >
                      Withdraw submission
                    </Button>
                  ) : null}

                  {status === "rejected" && mode === "admin" ? (
                    <Button
                      size="small"
                      type="button"
                      variant="secondary"
                      isLoading={reviewLoading}
                      disabled={reviewActionDisabled}
                      onClick={() => runReviewAction("reopen")}
                    >
                      Reopen as draft
                    </Button>
                  ) : null}

                  {status === "published" && mode === "admin" ? (
                    <>
                      <Button
                        size="small"
                        type="button"
                        variant="secondary"
                        disabled={reviewActionDisabled}
                        onClick={() => runReviewAction("request-changes")}
                      >
                        Request changes
                      </Button>
                      <Button
                        size="small"
                        type="button"
                        variant="secondary"
                        disabled={reviewActionDisabled}
                        onClick={() => runReviewAction("unpublish")}
                      >
                        Unpublish
                      </Button>
                      <Button
                        size="small"
                        type="button"
                        variant="secondary"
                        disabled={reviewActionDisabled}
                        onClick={() => runReviewAction("pause")}
                      >
                        Pause
                      </Button>
                      <Button
                        size="small"
                        type="button"
                        variant="danger"
                        disabled={reviewActionDisabled}
                        onClick={() => runReviewAction("archive")}
                      >
                        Archive
                      </Button>
                    </>
                  ) : null}

                  {status === "draft" &&
                  mode === "admin" &&
                  ["paused", "archived", "unpublished", "changes_requested"].includes(
                    lifecycleState ?? "",
                  ) ? (
                    <>
                      <Text size="small" className="text-ui-fg-subtle">
                        Lifecycle state: {lifecycleState}
                      </Text>
                      <Button
                        size="small"
                        type="button"
                        variant="secondary"
                        disabled={reviewActionDisabled}
                        onClick={() => runReviewAction("restore")}
                      >
                        Restore as draft
                      </Button>
                    </>
                  ) : null}
                </div>

                {!reviewReady && status === "draft" ? (
                  <div className="rounded-lg border border-ui-border-error bg-ui-bg-error px-4 py-3 text-sm text-ui-fg-error">
                    Complete the required checks before submitting. New studio
                    variants must have an offer with an INR base price first.
                  </div>
                ) : null}

              </div>
            </Section>

            <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-ui-border-base bg-ui-bg-base px-6 py-4 md:flex-row md:items-center md:justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                {dirty
                  ? "You have unsaved changes."
                  : lastSaved
                    ? `Last saved at ${lastSaved}.`
                    : productId
                      ? "No unsaved changes."
                      : "Start with the product details, then save the draft."}
              </Text>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="small"
                  type="button"
                  variant="secondary"
                  onClick={reset}
                >
                  Start again
                </Button>
                <Button
                  size="small"
                  type="button"
                  isLoading={saving}
                  disabled={!form.title.trim() || saving}
                  onClick={save}
                >
                  {productId ? "Save draft" : "Create draft"}
                </Button>
              </div>
            </div>
          </Container>

          <div
            className="flex flex-col gap-3"
            style={{ width: 360, maxWidth: "100%", flexShrink: 0 }}
          >
            <Container className="p-0">
              <div className="border-b border-ui-border-base px-5 py-4">
                <Heading level="h2">Content preview</Heading>
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  How the structured record renders. Prices are not a live
                  storefront projection.
                </Text>
              </div>
              <div className="p-5">
                {form.thumbnail.trim() ? (
                  <img
                    src={form.thumbnail}
                    alt=""
                    className="mb-4 aspect-square w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="mb-4 flex aspect-square w-full items-center justify-center rounded-lg bg-ui-bg-subtle text-xs text-ui-fg-subtle">
                    No thumbnail
                  </div>
                )}
                <p className="text-xs uppercase tracking-wide text-ui-fg-subtle">
                  {form.brand.trim() || "Brand"} Â· {previewCategory}
                </p>
                <p className="mt-1 text-lg font-semibold text-ui-fg-base">
                  {previewTitle}
                </p>
                <p className="mt-2 text-sm text-ui-fg-subtle">
                  {form.subtitle.trim() ||
                    form.description.trim() ||
                    "Add a short description to preview the listing summary."}
                </p>
                {tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-ui-bg-subtle px-2 py-0.5 text-xs text-ui-fg-subtle"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 border-t border-ui-border-base pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ui-fg-subtle">
                    Variants
                  </p>
                  <p className="mt-2 text-xs text-ui-fg-subtle">
                    {variants.length} variant{variants.length === 1 ? "" : "s"}
                    {variants[0]?.sku
                      ? ` Â· first SKU ${variants[0].sku}`
                      : " Â· no SKU yet"}
                  </p>
                  <p className="mt-1 text-xs text-ui-fg-subtle">
                    {offers.length === 0
                      ? "No seller offer pricing yet."
                      : `${offers.length} offer${
                          offers.length === 1 ? "" : "s"
                        } Â· ${inr(
                          offers[0].prices.find(
                            (price) =>
                              price.currency_code === "inr" &&
                              (price.min_quantity === null ||
                                price.min_quantity === undefined),
                          )?.amount ?? 0,
                        )}`}
                  </p>
                </div>
                <div className="mt-4 border-t border-ui-border-base pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ui-fg-subtle">
                    Specifications
                  </p>
                  {validSpecs.length === 0 ? (
                    <p className="mt-2 text-xs text-ui-fg-subtle">
                      No specifications yet.
                    </p>
                  ) : (
                    <dl className="mt-2 divide-y divide-ui-border-base">
                      {validSpecs.map((spec) => (
                        <div
                          key={`${spec.name}-${spec.value}`}
                          className="flex items-start justify-between gap-3 py-2 text-xs"
                        >
                          <dt className="text-ui-fg-subtle">{spec.name}</dt>
                          <dd className="text-right font-medium text-ui-fg-base">
                            {spec.value}
                            {spec.unit ? ` ${spec.unit}` : ""}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            </Container>

            <Container className="p-0">
              <div className="border-b border-ui-border-base px-5 py-4">
                <Heading level="h2">Readiness</Heading>
              </div>
              <div className="divide-y divide-ui-border-base">
                {checks.map((check) => (
                  <div
                    key={check.label}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span
                      className={
                        check.ok ? "text-ui-fg-base" : "text-ui-fg-subtle"
                      }
                    >
                      {check.label}
                      {check.required ? " *" : ""}
                    </span>
                    <span
                      className={
                        check.ok
                          ? "text-ui-fg-success"
                          : "text-ui-fg-subtle"
                      }
                    >
                      {check.ok ? "Ready" : "Missing"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4">
                <Text size="small" className="text-ui-fg-subtle">
                  Publish remains disabled in this slice. Completing variants,
                  pricing and inventory is required before review.
                </Text>
              </div>
            </Container>
          </div>
        </div>
      )}
    </div>
  );
}
