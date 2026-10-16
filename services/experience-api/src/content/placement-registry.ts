/**
 * Banner type registry — the single authority for what a banner placement means.
 *
 * A banner's *type* is its placement value, and the type carries the channel. The previous model put
 * the channel in a separate `audience` field, which allowed a banner to claim a channel whose surface
 * does not render it. Channel is now intrinsic to the type.
 *
 * MIRROR WARNING: `services/backend/apps/admin/src/routes/content/banner-studio/banner-model.ts`
 * holds the console's copy of this list. The two are mirrored rather than imported because the console
 * and this service are built from different Docker contexts with no shared source root. Both files
 * state the same values, and `tooling/validate_banner_types.py` fails the build if they diverge.
 */

export type StorefrontSurface = "home" | "category";

export interface BannerType {
  /** Placement value stored on the banner. */
  placement: string;
  channel: "b2c" | "b2b";
  surface: StorefrontSurface;
  /** A category banner must reference a Medusa category. */
  requiresCategory: boolean;
  label: string;
}

export const BANNER_TYPES: ReadonlyArray<BannerType> = [
  {
    placement: "b2c.home.hero",
    channel: "b2c",
    surface: "home",
    requiresCategory: false,
    label: "B2C · Home",
  },
  {
    placement: "b2c.home.campaign-strip",
    channel: "b2c",
    surface: "home",
    requiresCategory: false,
    label: "B2C · Campaign banner",
  },
  {
    placement: "b2c.category.banner",
    channel: "b2c",
    surface: "category",
    requiresCategory: true,
    label: "B2C · Category banner",
  },
  {
    placement: "b2b.category.banner",
    channel: "b2b",
    surface: "category",
    requiresCategory: true,
    label: "B2B · Category banner",
  },
];

/** Legacy placement values from before the type carried the channel. Used only by the migration. */
export const LEGACY_PLACEMENT_MAP: Readonly<Record<string, string>> = {
  "home.hero": "b2c.home.hero",
  "home.campaign-strip": "b2c.home.campaign-strip",
};

export function bannerTypeFor(placement: unknown): BannerType | undefined {
  if (typeof placement !== "string") return undefined;
  const key = placement.trim();
  return BANNER_TYPES.find((type) => type.placement === key);
}

/** Banners that compose a home surface for a channel. */
export function homeBannerPlacements(channel: "b2c" | "b2b"): Set<string> {
  return new Set(
    BANNER_TYPES.filter((type) => type.channel === channel && type.surface === "home")
      .map((type) => type.placement),
  );
}

/** A category banner for a channel and category, if the type exists. */
export function categoryBannerPlacement(channel: "b2c" | "b2b"): string | undefined {
  return BANNER_TYPES.find((type) => type.channel === channel && type.surface === "category")
    ?.placement;
}
