import type { InferClientOutput } from "@mercurjs/client";
import { client } from "../../lib/client";

export const CONTENT_KINDS = [
  {
    kind: "storefront-layout",
    label: "Storefront layouts",
    singularLabel: "storefront layout",
    route: "/merchandising/storefront-layouts",
    description: "Page composition and governed module order",
    delivery: "Partial",
    deliveryColor: "orange",
  },
  {
    kind: "banner",
    label: "Banners",
    singularLabel: "banner",
    route: "/merchandising/banners",
    description: "Hero, strip and campaign presentation",
    delivery: "Live",
    deliveryColor: "green",
  },
  {
    kind: "category-editorial",
    label: "Category details",
    singularLabel: "category detail",
    route: "/editorial/category-presentation",
    description: "Localized labels, guidance and category imagery",
    delivery: "Live",
    deliveryColor: "green",
  },
  {
    kind: "product-editorial",
    label: "Product editorial",
    singularLabel: "product editorial",
    route: "/editorial/product-editorial",
    description: "Guidance, supporting copy and SEO",
    delivery: "Consumer pending",
    deliveryColor: "grey",
  },
  {
    kind: "curated-collection",
    label: "Collections & trade lists",
    singularLabel: "collection or trade list",
    route: "/editorial/collection-presentation",
    description:
      "Editorial collections plus B2B quick-order lists and trade-offer collections, with category rules and presentation properties",
    delivery: "Live",
    deliveryColor: "green",
  },
  {
    kind: "faq-article",
    label: "Help and articles",
    singularLabel: "help article",
    route: "/editorial/help-articles",
    description: "FAQ, policy and onboarding content",
    delivery: "Consumer pending",
    deliveryColor: "grey",
  },
] as const;

export const CONTENT_LOCALES = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi (India)" },
] as const;

export const PAGE_SIZE = 20;

export type ContentKind = (typeof CONTENT_KINDS)[number]["kind"];
export type ContentLocale = (typeof CONTENT_LOCALES)[number]["value"];
export type ContentResponse = InferClientOutput<typeof client.admin.buildkart.content.query>;
export type ContentDocument = ContentResponse["documents"][number];
export type ContentField = ContentResponse["definition"]["fields"][number];
export type PublicationStatus = ContentDocument["publicationStatus"];
export type StatusFilter = PublicationStatus | "all";

export function isContentKind(value: string | undefined): value is ContentKind {
  return CONTENT_KINDS.some((item) => item.kind === value);
}

export function contentKind(kind: ContentKind) {
  return CONTENT_KINDS.find((item) => item.kind === kind)!;
}

export function contentKindRoute(kind: ContentKind, locale?: ContentLocale): string {
  const route = contentKind(kind).route;
  return locale && locale !== "en-IN" ? `${route}?locale=${encodeURIComponent(locale)}` : route;
}

export function statusColor(status: PublicationStatus): "green" | "orange" | "grey" {
  if (status === "published") return "green";
  if (status === "modified") return "orange";
  return "grey";
}

export function statusLabel(status: PublicationStatus): string {
  if (status === "modified") return "Changes not published";
  if (status === "draft") return "Draft";
  return "Published";
}

export function displayValue(document: ContentDocument, field: string): string {
  const value = document[field];
  return typeof value === "string" && value.trim() ? value : "—";
}

function toFormValue(field: ContentField, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "json") return JSON.stringify(value, null, 2);
  if (field.type === "datetime") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
  }
  return String(value);
}

export function initialForm(
  fields: ContentField[],
  document?: ContentDocument,
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const existing = document?.[field.name];
      const fallback = field.type === "enum" ? field.options?.[0] ?? "" : "";
      return [field.name, toFormValue(field, existing ?? fallback)];
    }),
  );
}

export function parseForm(
  fields: ContentField[],
  values: Record<string, string>,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = values[field.name]?.trim() ?? "";
      if (!raw) {
        if (field.required) throw new Error(`${field.label} is required.`);
        return [field.name, null];
      }
      if (field.type === "integer") {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) throw new Error(`${field.label} must be a whole number.`);
        return [field.name, parsed];
      }
      if (field.type === "json") {
        try {
          const parsed = JSON.parse(raw) as unknown;
          // A JSON textarea containing two quotes represents an empty string, not an empty
          // structured value. Clear optional JSON instead of sending invalid database input.
          if (parsed === "" && !field.required) return [field.name, null];
          return [field.name, parsed];
        } catch {
          throw new Error(`${field.label} must contain valid JSON.`);
        }
      }
      if (field.type === "datetime") {
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error(`${field.label} must contain a valid date and time.`);
        }
        return [field.name, parsed.toISOString()];
      }
      return [field.name, raw];
    }),
  );
}

export function contentDocumentRoute(
  kind: ContentKind,
  documentId: string,
  locale: ContentLocale,
): string {
  return `/content/${encodeURIComponent(kind)}/${encodeURIComponent(documentId)}?locale=${encodeURIComponent(locale)}`;
}
