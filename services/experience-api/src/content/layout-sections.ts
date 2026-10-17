/**
 * Storefront layout sections — the placement registry and normaliser.
 *
 * A layout used to be an ordered array of raw JSON `modules`. That is fine as a recovery format but
 * unusable as a merchandising surface: nothing validated a placement, nothing scoped it to a channel,
 * and the storefront could not be told "show Flash Deals, then Best Sellers, then Recommended".
 *
 * A section is an ordered, typed placement with a product source, display properties, an optional
 * banner reference, visibility and an optional schedule. Sections stay references: a section points at
 * a collection, it never copies products. Product resolution happens on the storefront path, not here.
 *
 * MIRROR WARNING: the console mirrors `LAYOUT_SECTION_TYPES` in
 * `services/backend/apps/admin/src/routes/content/layout-section-model.ts`. The two are mirrored
 * because the console and this service build from different Docker contexts with no shared source
 * root; `tooling/validate_layout_sections.py` fails the build if they diverge.
 */

import type { StorefrontChannel } from "./storefront-layout.js";

export type LayoutChannel = StorefrontChannel;

/** Where a section gets its products. Never a copied list. */
export type SectionSourceKind =
  | "collection"
  | "customer-history"
  | "schemes"
  | "best-selling"
  | "group";

export interface LayoutSectionType {
  placement: string;
  label: string;
  channel: LayoutChannel;
  source: SectionSourceKind;
  /** Whether the section may reference a banner managed under Merchandising → Banners. */
  acceptsBanner: boolean;
  /** A group section holds child placements instead of products. */
  children?: string[];
}

export const LAYOUT_SECTION_TYPES: ReadonlyArray<LayoutSectionType> = [
  {
    placement: "flash_deals",
    label: "Flash Deals",
    channel: "b2c",
    source: "collection",
    acceptsBanner: true,
  },
  {
    placement: "best_sellers",
    label: "Best Sellers",
    channel: "b2c",
    source: "collection",
    acceptsBanner: false,
  },
  {
    placement: "recommended",
    label: "Recommended",
    channel: "b2c",
    source: "collection",
    acceptsBanner: false,
  },
  {
    placement: "buy_again",
    label: "Buy Again",
    channel: "b2b",
    source: "customer-history",
    acceptsBanner: false,
  },
  {
    placement: "trade_offers",
    label: "Trade Offers & Deals",
    channel: "b2b",
    source: "group",
    acceptsBanner: false,
    children: ["seasonal", "best_deals", "schemes"],
  },
  {
    placement: "seasonal",
    label: "Seasonal",
    channel: "b2b",
    source: "collection",
    acceptsBanner: true,
  },
  {
    placement: "best_deals",
    label: "Best Deals",
    channel: "b2b",
    source: "collection",
    acceptsBanner: true,
  },
  {
    // Schemes resolve through the existing offer/scheme services, not a collection.
    placement: "schemes",
    label: "Schemes",
    channel: "b2b",
    source: "schemes",
    acceptsBanner: false,
  },
];

export function layoutSectionTypeFor(placement: unknown): LayoutSectionType | undefined {
  if (typeof placement !== "string") return undefined;
  const key = placement.trim();
  return LAYOUT_SECTION_TYPES.find((type) => type.placement === key);
}

export interface StorefrontLayoutSection {
  placement: string;
  label: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  source: SectionSourceKind;
  collection_key?: string;
  /** Null means "the source decides", which for a collection means its full membership. */
  limit?: number;
  see_all_label?: string;
  see_all_uri?: string;
  banner_reference?: string;
  visible: boolean;
  starts_at?: string;
  ends_at?: string;
  children?: StorefrontLayoutSection[];
}

export interface SectionIssue {
  placement: string;
  message: string;
}

export interface NormalisedSections {
  sections: StorefrontLayoutSection[];
  /** Rejected or questionable entries, surfaced to the console so a silent no-op cannot happen. */
  issues: SectionIssue[];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function inWindow(entry: JsonRecord, now: Date): boolean {
  const startsAt = text(entry.startsAt) ?? text(entry.starts_at);
  const endsAt = text(entry.endsAt) ?? text(entry.ends_at);
  return (!startsAt || new Date(startsAt) <= now) && (!endsAt || new Date(endsAt) > now);
}

function normaliseOne(
  entry: JsonRecord,
  channel: LayoutChannel,
  now: Date,
  issues: SectionIssue[],
  parent?: string,
): StorefrontLayoutSection | undefined {
  const placement = text(entry.placement);
  if (!placement) {
    issues.push({ placement: parent ?? "(unknown)", message: "A section is missing its placement." });
    return undefined;
  }
  const type = layoutSectionTypeFor(placement);
  if (!type) {
    issues.push({ placement, message: `Unknown placement '${placement}'.` });
    return undefined;
  }
  if (type.channel !== channel) {
    issues.push({
      placement,
      message: `'${placement}' belongs to the ${type.channel.toUpperCase()} storefront, not ${channel.toUpperCase()}.`,
    });
    return undefined;
  }
  if (parent) {
    const parentType = layoutSectionTypeFor(parent);
    if (parentType?.children && !parentType.children.includes(placement)) {
      issues.push({ placement, message: `'${placement}' is not a child of '${parent}'.` });
      return undefined;
    }
  }
  if (type.source === "collection") {
    const collectionKey = text(entry.collectionKey) ?? text(entry.collection_key);
    if (!collectionKey) {
      issues.push({
        placement,
        message: `'${placement}' needs a collection before it can show products.`,
      });
      return undefined;
    }
  }

  const bannerReference = text(entry.bannerReference) ?? text(entry.banner_reference);
  if (bannerReference && !type.acceptsBanner) {
    issues.push({
      placement,
      message: `'${placement}' does not accept a banner association.`,
    });
  }

  const section: StorefrontLayoutSection = {
    placement,
    // The operator's own label wins when they set one. Falling straight back to the title meant a
    // label authored in the editor was silently discarded, so the storefront showed a heading the
    // operator had replaced.
    label: text(entry.label) ?? text(entry.title) ?? type.label,
    source: type.source,
    ...(text(entry.title) ? { title: text(entry.title) } : {}),
    ...(text(entry.subtitle) ? { subtitle: text(entry.subtitle) } : {}),
    ...(text(entry.badge) ? { badge: text(entry.badge) } : {}),
    ...(text(entry.collectionKey) ?? text(entry.collection_key)
      ? { collection_key: text(entry.collectionKey) ?? text(entry.collection_key) }
      : {}),
    ...(integer(entry.limit) !== undefined ? { limit: integer(entry.limit) } : {}),
    ...(text(entry.seeAllLabel) ?? text(entry.see_all_label)
      ? { see_all_label: text(entry.seeAllLabel) ?? text(entry.see_all_label) }
      : {}),
    ...(text(entry.seeAllUri) ?? text(entry.see_all_uri)
      ? { see_all_uri: text(entry.seeAllUri) ?? text(entry.see_all_uri) }
      : {}),
    ...(bannerReference && type.acceptsBanner ? { banner_reference: bannerReference } : {}),
    visible: entry.enabled !== false && inWindow(entry, now),
    ...(text(entry.startsAt) ?? text(entry.starts_at)
      ? { starts_at: text(entry.startsAt) ?? text(entry.starts_at) }
      : {}),
    ...(text(entry.endsAt) ?? text(entry.ends_at)
      ? { ends_at: text(entry.endsAt) ?? text(entry.ends_at) }
      : {}),
  };

  if (type.children?.length) {
    const rawChildren = Array.isArray(entry.children) ? entry.children : [];
    const children = rawChildren
      .map((child) => record(child))
      .map((child) => (child ? normaliseOne(child, channel, now, issues, placement) : undefined))
      .filter((child): child is StorefrontLayoutSection => Boolean(child));
    const declared = new Set(type.children);
    for (const child of type.children) {
      if (!children.some((candidate) => candidate.placement === child)) {
        issues.push({
          placement,
          message: `'${placement}' has no '${child}' child configured.`,
        });
      }
    }
    // Keep the declared child order rather than the stored order: the group's category order is part
    // of its meaning, and the storefront renders them as tabs.
    section.children = [...children].sort(
      (left, right) =>
        [...declared].indexOf(left.placement) - [...declared].indexOf(right.placement),
    );
  }

  return section;
}

/**
 * Normalise a stored section list for a channel.
 *
 * Order is the stored order — that is the merchandising decision. Entries that cannot be served are
 * dropped so the storefront never renders a broken section, and each one produces an issue so the
 * console can explain why instead of failing silently.
 */
export function normaliseLayoutSections(
  input: unknown,
  channel: LayoutChannel,
  now: Date,
): NormalisedSections {
  const issues: SectionIssue[] = [];
  if (!Array.isArray(input)) return { sections: [], issues };
  const sections = input
    .map((entry) => record(entry))
    .map((entry) => (entry ? normaliseOne(entry, channel, now, issues) : undefined))
    .filter((section): section is StorefrontLayoutSection => Boolean(section));
  return { sections, issues };
}

