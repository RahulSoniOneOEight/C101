import {
  CONTENT_LOCALES,
  displayValue,
  type ContentDocument,
  type ContentLocale,
} from "../content-model";
import type { InferClientOutput } from "@mercurjs/client";
import { client } from "../../../lib/client";

/** Preview projection shape, inferred from the generated typed client. */
export type BannerPreviewResponse = InferClientOutput<
  typeof client.admin.buildkart.content.preview.mutate
>;
export type BannerPreviewPresentation = NonNullable<BannerPreviewResponse["presentation"]>;

/**
 * Banner studio form and presentation rules.
 *
 * Everything here maps onto fields that the CMS actually owns. Nothing invents a channel, a crop, a
 * commerce reference or a delivery claim that the platform cannot support today.
 */

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Placements the storefront actually renders, scoped to the channel whose surface consumes them.
 *
 * This mirrors the app's hard-coded slot keys: `home.hero` is read by the B2C home header carousel
 * (`bannersFor('home.hero')`) and `home.campaign-strip` by the B2C secondary-banner merchandising
 * module (`bannersFor('home.campaign-strip').firstOrNull`). The CMS stores `placement` as free text,
 * so a value outside this list is accepted, published, and then never rendered.
 *
 * B2B deliberately has no entries: the B2B app renders no CMS banners today (no hero slot, and its
 * category banner is a hard-coded app image), so offering a B2B placement would offer a control that
 * does nothing. Category banners are not banners either — they belong to the Category presentation
 * property (`category-editorial`), which already owns that image.
 */
export interface PlacementOption {
  value: string;
  label: string;
  channel: "b2c" | "b2b";
  surface: "home" | "category";
  /** A category banner must reference a Medusa category. */
  requiresCategory: boolean;
  /** False while the consuming surface does not read the CMS yet. */
  rendered: boolean;
}

/**
 * Banner types. The type carries the channel, so a banner no longer has an `audience` field.
 *
 * MIRROR WARNING: `services/experience-api/src/content/placement-registry.ts` is the delivery-side
 * authority for this list. The two are mirrored because the console and the delivery service are built
 * from different Docker contexts; `tooling/validate_banner_types.py` fails CI if they diverge.
 */
export const SUPPORTED_PLACEMENTS: ReadonlyArray<PlacementOption> = [
  {
    value: "b2c.home.hero",
    label: "B2C · Home",
    channel: "b2c",
    surface: "home",
    requiresCategory: false,
    rendered: true,
  },
  {
    value: "b2c.home.campaign-strip",
    label: "B2C · Campaign banner",
    channel: "b2c",
    surface: "home",
    requiresCategory: false,
    rendered: true,
  },
  {
    value: "b2c.category.banner",
    label: "B2C · Category banner",
    channel: "b2c",
    surface: "category",
    requiresCategory: true,
    rendered: true,
  },
  {
    value: "b2b.category.banner",
    label: "B2B · Category banner",
    channel: "b2b",
    surface: "category",
    requiresCategory: true,
    // The B2B app still renders a hard-coded image and never asks for channel=b2b.
    rendered: false,
  },
];

/** Pre-migration placement values, shown so un-migrated rows read sensibly. */
const LEGACY_PLACEMENT_LABELS: Record<string, string> = {
  "home.hero": "B2C · Home (legacy)",
  "home.campaign-strip": "B2C · Campaign banner (legacy)",
};

/** Where category banners are actually edited, so the studio can point at the one authoritative page. */
export const CATEGORY_DETAILS_ROUTE = "/editorial/category-presentation";

const SUPPORTED_PLACEMENT_VALUES = new Set(SUPPORTED_PLACEMENTS.map((item) => item.value));

export function isRecognisedPlacement(value: unknown): boolean {
  return typeof value === "string" && SUPPORTED_PLACEMENT_VALUES.has(value.trim());
}

export function supportedPlacement(value: unknown): PlacementOption | undefined {
  return typeof value === "string"
    ? SUPPORTED_PLACEMENTS.find((item) => item.value === value.trim())
    : undefined;
}

export function placementRequiresCategory(value: unknown): boolean {
  return supportedPlacement(value)?.requiresCategory ?? false;
}

export function isRenderedPlacement(value: unknown): boolean {
  const option = supportedPlacement(value);
  if (option) return option.rendered;
  return false;
}

export const CTA_TARGET_LABELS: Record<string, string> = {  route: "In-app route",
  product: "Product reference",
  category: "Category reference",
  collection: "Collection reference",
  url: "External URL",
};

export const CTA_TARGET_TYPES = ["route", "product", "category", "collection", "url"] as const;

export function placementLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "No placement";
  const key = value.trim();
  const supported = SUPPORTED_PLACEMENTS.find((item) => item.value === key);
  // Unrecognised placements are shown as their raw key: it is the honest signal that this banner
  // points at a slot the storefront does not render.
  if (supported) return supported.label;
  return LEGACY_PLACEMENT_LABELS[key] ?? key;
}

export function localeLabel(value: ContentLocale): string {
  return CONTENT_LOCALES.find((item) => item.value === value)?.label ?? value;
}

/**
 * Delivery eligibility, computed from publication plus the stored schedule.
 *
 * This mirrors the server gate (`inWindow` in the Experience API) from the same inputs, so the
 * operator sees the rule that will actually be applied. It is not a claim that a banner is being
 * rendered: audience, channel and storefront-layout membership are separate concerns.
 */
export type DeliveryEligibility = "eligible" | "scheduled" | "expired";

export const ELIGIBILITY_LABELS: Record<DeliveryEligibility, string> = {
  eligible: "Eligible",
  scheduled: "Scheduled",
  expired: "Expired",
};

export const ELIGIBILITY_COLORS: Record<DeliveryEligibility, "green" | "purple" | "grey"> = {
  eligible: "green",
  scheduled: "purple",
  expired: "grey",
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type WindowState = "not-published" | DeliveryEligibility;

function windowState(document: ContentDocument, now: Date): WindowState {
  if (document.publicationStatus === "draft") return "not-published";
  const endsAt = parseDate(document.endsAt);
  if (endsAt && endsAt.getTime() <= now.getTime()) return "expired";
  const startsAt = parseDate(document.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return "scheduled";
  return "eligible";
}

export function formatIst(value: unknown): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function scheduleLabel(document: ContentDocument): string {
  const startsAt = parseDate(document.startsAt);
  const endsAt = parseDate(document.endsAt);
  if (!startsAt && !endsAt) return "Always on";
  if (startsAt && endsAt) {
    return `${formatIst(document.startsAt)} → ${formatIst(document.endsAt)}`;
  }
  if (startsAt) return `From ${formatIst(document.startsAt)}`;
  return `Until ${formatIst(document.endsAt)}`;
}

/**
 * Converts a stored ISO timestamp into the `datetime-local` value an operator sees, expressed in
 * Asia/Kolkata. Kolkata is a fixed +05:30 offset, so the conversion is exact without DST handling.
 */
export function toIstInputValue(value: unknown): string {
  const date = parseDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

/** Converts an operator's Kolkata wall-clock input back to an absolute ISO instant. */
export function fromIstInputValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(`${value}:00+05:30`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export type StartMode = "now" | "later";

export type PreviewDevice = "app" | "mobile" | "desktop";

export const PREVIEW_DEVICES: Array<{ value: PreviewDevice; label: string }> = [
  { value: "app", label: "App" },
  { value: "mobile", label: "Mobile web" },
  { value: "desktop", label: "Desktop" },
];

export interface BannerForm {
  name: string;
  contentKey: string;
  placement: string;
  categoryId: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaTargetType: string;
  ctaTargetId: string;
  externalImageUrl: string;
  startMode: StartMode;
  startsAt: string;
  endsAt: string;
  priority: string;
  segments: string;
}

export const EMPTY_BANNER_FORM: BannerForm = {
  name: "",
  contentKey: "",
  placement: "b2c.home.hero",
  categoryId: "",
  title: "",
  subtitle: "",
  ctaLabel: "",
  ctaTargetType: "route",
  ctaTargetId: "",
  externalImageUrl: "",
  startMode: "now",
  startsAt: "",
  endsAt: "",
  priority: "0",
  segments: "",
};

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function formFromDocument(document: ContentDocument): BannerForm {
  const startsAt = parseDate(document.startsAt);
  const startMode: StartMode = startsAt && startsAt.getTime() > Date.now() ? "later" : "now";
  return {
    ...EMPTY_BANNER_FORM,
    name: text(document.name) || displayValue(document, "title"),
    contentKey: text(document.contentKey),
    placement: text(document.placement) || "b2c.home.hero",
    categoryId: text(document.categoryId),
    title: text(document.title),
    subtitle: text(document.subtitle),
    ctaLabel: text(document.ctaLabel),
    ctaTargetType: text(document.ctaTargetType) || "route",
    ctaTargetId: text(document.ctaTargetId),
    externalImageUrl: text(document.externalImageUrl),
    startMode,
    startsAt: startMode === "later" ? toIstInputValue(document.startsAt) : toIstInputValue(document.startsAt),
    endsAt: toIstInputValue(document.endsAt),
    priority: text(document.priority) === "" ? "0" : text(document.priority),
    segments:
      document.segments === null || document.segments === undefined
        ? ""
        : JSON.stringify(document.segments, null, 2),
  };
}

export interface BannerValidationContext {
  requireContent: boolean;
}

export function validateBannerForm(
  form: BannerForm,
  context: BannerValidationContext,
): string[] {
  const errors: string[] = [];
  if (!form.contentKey.trim()) errors.push("The technical key is required.");
  if (placementRequiresCategory(form.placement) && !form.categoryId.trim()) {
    errors.push("Choose the category this banner belongs to.");
  }
  if (context.requireContent && !form.title.trim()) errors.push("Add the customer-facing heading.");
  if (form.externalImageUrl.trim() && !/^https:\/\//i.test(form.externalImageUrl.trim())) {
    errors.push("The image reference must be an https URL.");
  }
  if (form.ctaTargetId.trim()) {
    if (form.ctaTargetType === "url" && !/^https:\/\//i.test(form.ctaTargetId.trim())) {
      errors.push("An external destination must be an https URL.");
    }
    if (form.ctaTargetType === "route" && !form.ctaTargetId.trim().startsWith("/")) {
      errors.push("An in-app route must start with '/'.");
    }
  }
  if (form.startMode === "later") {
    if (!form.startsAt.trim()) {
      errors.push("Choose the start date and time, or start immediately.");
    } else {
      const start = fromIstInputValue(form.startsAt);
      if (!start || new Date(start).getTime() <= Date.now()) {
        errors.push("The start time must be in the future.");
      }
    }
  }
  if (form.endsAt.trim()) {
    const end = fromIstInputValue(form.endsAt);
    const start = form.startMode === "later" && form.startsAt.trim()
      ? fromIstInputValue(form.startsAt) ?? String(Date.now())
      : new Date().toISOString();
    if (!end || new Date(end).getTime() <= new Date(start).getTime()) {
      errors.push("The end time must be after the start time.");
    }
  }
  if (form.segments.trim()) {
    try {
      const parsed = JSON.parse(form.segments) as unknown;
      if (parsed !== null && typeof parsed !== "object") {
        errors.push("Segments must be a JSON array or object.");
      }
    } catch {
      errors.push("Segments must contain valid JSON.");
    }
  }
  const priority = Number.parseInt(form.priority, 10);
  if (form.priority.trim() && !Number.isFinite(priority)) {
    errors.push("Priority must be a whole number.");
  }
  return errors;
}

/** Fields the CMS accepts for a banner. Kept in step with the private CMS allowlist. */
export function serializeBannerForm(form: BannerForm): Record<string, unknown> {
  const startsAt = form.startMode === "later" ? fromIstInputValue(form.startsAt) : null;
  const endsAt = form.endsAt.trim() ? fromIstInputValue(form.endsAt) : null;
  const priority = Number.parseInt(form.priority, 10);
  let segments: unknown = null;
  if (form.segments.trim()) {
    segments = JSON.parse(form.segments) as unknown;
  }
  return {
    name: form.name.trim() || null,
    contentKey: form.contentKey.trim(),
    placement: form.placement.trim(),
    // The type carries the channel, so no audience is sent: channel is implied by the placement.
    categoryId: placementRequiresCategory(form.placement) ? form.categoryId.trim() || null : null,
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    ctaLabel: form.ctaLabel.trim() || null,
    ctaTargetType: form.ctaTargetType,
    ctaTargetId: form.ctaTargetId.trim() || null,
    externalImageUrl: form.externalImageUrl.trim() || null,
    startsAt,
    endsAt,
    timezone: IST_TIMEZONE,
    priority: Number.isFinite(priority) ? priority : 0,
    segments,
  };
}

export function bannerTitle(document: ContentDocument): string {
  const name = typeof document.name === "string" && document.name.trim() ? document.name.trim() : "";
  if (name) return name;
  return displayValue(document, "title");
}

/** The exact customer-facing heading rendered on the storefront. */
export function bannerCustomerHeading(document: ContentDocument): string {
  const heading = typeof document.title === "string" ? document.title.trim() : "";
  return heading || bannerTitle(document);
}

export function bannerKey(document: ContentDocument): string {
  return typeof document.contentKey === "string" && document.contentKey.trim()
    ? document.contentKey.trim()
    : document.documentId;
}

/**
 * Single lifecycle model for banners.
 *
 * The tab and the row status badge are two projections of this one value, so the page cannot state
 * the same fact twice in two different vocabularies. There is deliberately no separate "editorial"
 * column: the only part of publication state the lifecycle does not already carry is whether a
 * published banner has newer unpublished edits, which `hasUnpublishedChanges` reports alongside.
 */
export type BannerLifecycle = "draft" | "scheduled" | "live" | "expired";

export const LIFECYCLE_META: Record<
  BannerLifecycle,
  { label: string; color: "grey" | "purple" | "green" | "orange" }
> = {
  draft: { label: "Draft", color: "grey" },
  scheduled: { label: "Scheduled", color: "purple" },
  live: { label: "Live", color: "green" },
  expired: { label: "Expired", color: "orange" },
};

/** Tabs are buckets over the same lifecycle. "Historical" is the bucket name for expired banners. */
export const STUDIO_TABS: Array<{ value: BannerLifecycle; label: string }> = [
  { value: "live", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Historical" },
];

export function isStudioTab(value: string | null): value is BannerLifecycle {
  return STUDIO_TABS.some((tab) => tab.value === value);
}

/** Lifecycle from publication and the stored schedule only. */
export function bannerLifecycle(document: ContentDocument, now: Date = new Date()): BannerLifecycle {
  const state = windowState(document, now);
  if (state === "expired") return "expired";
  if (document.publicationStatus === "draft") return "draft";
  if (state === "scheduled") return "scheduled";
  return "live";
}

/**
 * A published banner can carry newer draft edits. Its lifecycle stays Live (it is published) and this
 * flag is shown beside it, so that state survives the removal of the "Needs review" tab.
 */
export function hasUnpublishedChanges(document: ContentDocument): boolean {
  return document.publicationStatus === "modified";
}
