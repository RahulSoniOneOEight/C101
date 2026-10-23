/**
 * Storefront layout sections — the console's copy of the placement registry.
 *
 * MIRROR WARNING: `services/experience-api/src/content/layout-sections.ts` is the delivery-side
 * authority. The console and the delivery service build from different Docker contexts with no shared
 * source root, so the registry is mirrored rather than imported. `tooling/validate_layout_sections.py`
 * fails the build if the two diverge.
 *
 * Validation here is for immediate feedback in the editor. Delivery re-validates with the same rules,
 * and the server remains the authority for what is actually served.
 */

export type LayoutChannel = "b2c" | "b2b";

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
  acceptsBanner: boolean;
  children?: string[];
}

export const LAYOUT_SECTION_TYPES: ReadonlyArray<LayoutSectionType> = [
  { placement: "flash_deals", label: "Flash Deals", channel: "b2c", source: "collection", acceptsBanner: true },
  { placement: "best_sellers", label: "Best Sellers", channel: "b2c", source: "collection", acceptsBanner: false },
  { placement: "recommended", label: "Recommended", channel: "b2c", source: "collection", acceptsBanner: false },
  { placement: "buy_again", label: "Buy Again", channel: "b2b", source: "customer-history", acceptsBanner: false },
  {
    placement: "trade_offers",
    label: "Trade Offers & Deals",
    channel: "b2b",
    source: "group",
    acceptsBanner: false,
    children: ["seasonal", "best_deals", "schemes"],
  },
  { placement: "seasonal", label: "Seasonal", channel: "b2b", source: "collection", acceptsBanner: true },
  { placement: "best_deals", label: "Best Deals", channel: "b2b", source: "collection", acceptsBanner: true },
  { placement: "schemes", label: "Schemes", channel: "b2b", source: "schemes", acceptsBanner: false },
];

export const SOURCE_LABELS: Record<SectionSourceKind, string> = {
  collection: "A collection",
  "customer-history": "The customer's own order history",
  schemes: "Schemes and offers",
  "group": "A group of sections",
  "best-selling": "Best-selling products",
};

/**
 * A section as stored on the layout. Field names match what delivery reads, so the editor round-trips
 * the stored JSON without a translation layer.
 */
export interface StoredLayoutSection {
  placement: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  collectionKey?: string;
  limit?: number;
  seeAllLabel?: string;
  seeAllUri?: string;
  bannerReference?: string;
  enabled?: boolean;
  startsAt?: string;
  endsAt?: string;
  children?: StoredLayoutSection[];
}

export function sectionTypeFor(placement: unknown): LayoutSectionType | undefined {
  if (typeof placement !== "string") return undefined;
  const key = placement.trim();
  return LAYOUT_SECTION_TYPES.find((type) => type.placement === key);
}

/** Placements that may be added directly at the top level of a layout for a channel. */
export function topLevelPlacements(channel: LayoutChannel): LayoutSectionType[] {
  return LAYOUT_SECTION_TYPES.filter(
    (type) => type.channel === channel && !isChildPlacement(type.placement),
  );
}

/** Child placements are added inside their group, not at the top level. */
export function isChildPlacement(placement: string): boolean {
  return LAYOUT_SECTION_TYPES.some((type) => type.children?.includes(placement));
}

export function childTypesFor(parentPlacement: string): LayoutSectionType[] {
  const parent = sectionTypeFor(parentPlacement);
  return (parent?.children ?? [])
    .map((placement) => sectionTypeFor(placement))
    .filter((type): type is LayoutSectionType => Boolean(type));
}

export function emptySection(placement: string): StoredLayoutSection {
  const type = sectionTypeFor(placement);
  const section: StoredLayoutSection = {
    placement,
    title: type?.label ?? placement,
    enabled: true,
  };
  if (type?.children?.length) {
    section.children = type.children.map((child) => emptySection(child));
  }
  return section;
}

export interface SectionValidation {
  /** Blocking problems: the section will not be served until these are fixed. */
  errors: string[];
  /** Non-blocking notes, such as a banner that will be ignored. */
  warnings: string[];
}

/**
 * Validate the stored sections for a channel with the same rules delivery applies, so the editor can
 * show a problem before an operator publishes into a silent no-op.
 */
export function validateStoredSections(
  input: unknown,
  channel: LayoutChannel,
): SectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections = Array.isArray(input) ? input as StoredLayoutSection[] : [];

  const seen = new Set<string>();
  const check = (section: StoredLayoutSection, parent?: string): void => {
    const type = sectionTypeFor(section.placement);
    if (!type) {
      errors.push(`Unknown placement '${section.placement}'.`);
      return;
    }
    if (type.channel !== channel) {
      errors.push(
        `${type.label} belongs to the ${type.channel.toUpperCase()} storefront, not ${channel.toUpperCase()}.`,
      );
      return;
    }
    if (parent) {
      const parentType = sectionTypeFor(parent);
      if (parentType?.children && !parentType.children.includes(section.placement)) {
        errors.push(`${type.label} is not a child of ${parentType.label}.`);
        return;
      }
    }
    if (!parent) {
      if (seen.has(section.placement)) {
        errors.push(`${type.label} appears more than once. Each placement may appear once.`);
      }
      seen.add(section.placement);
    }
    if (type.source === "collection" && !section.collectionKey) {
      errors.push(`${type.label} needs a collection before it can show products.`);
    }
    if (section.bannerReference && !type.acceptsBanner) {
      warnings.push(`${type.label} does not accept a banner; the association will be ignored.`);
    }
    const start = section.startsAt ? new Date(section.startsAt).getTime() : null;
    const end = section.endsAt ? new Date(section.endsAt).getTime() : null;
    if (start !== null && Number.isNaN(start)) errors.push(`${type.label} has an invalid start time.`);
    if (end !== null && Number.isNaN(end)) errors.push(`${type.label} has an invalid end time.`);
    if (start !== null && end !== null && !Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      errors.push(`${type.label} ends before it starts.`);
    }
    type.children?.forEach((child) => {
      const configured = (section.children ?? []).find((candidate) => candidate.placement === child);
      if (!configured) {
        const childLabel = sectionTypeFor(child)?.label ?? child;
        errors.push(`${type.label} is missing its ${childLabel} child.`);
        return;
      }
      check(configured, section.placement);
    });
  };

  sections.forEach((section) => check(section));
  return { errors, warnings };
}
