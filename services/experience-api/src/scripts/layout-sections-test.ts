/**
 * CHG-044 — storefront layout section assertions.
 *
 * The section registry is what stops a layout from rendering a placement that does not exist, a B2C
 * section on the B2B storefront, or a section with no product source. Each of those used to be
 * silently accepted because a layout was an unvalidated JSON blob.
 */
import assert from "node:assert/strict";
import {
  LAYOUT_SECTION_TYPES,
  normaliseLayoutSections,
} from "../content/layout-sections.js";

const now = new Date("2026-10-20T10:00:00.000Z");

// --- registry shape ---------------------------------------------------------------------------
assert.equal(LAYOUT_SECTION_TYPES.length, 8, "the registry should hold the eight approved placements");
assert.deepEqual(
  LAYOUT_SECTION_TYPES.filter((type) => type.channel === "b2c").map((type) => type.placement),
  ["flash_deals", "best_sellers", "recommended"],
  "B2C placements must match the storefront",
);
assert.deepEqual(
  LAYOUT_SECTION_TYPES.filter((type) => type.channel === "b2b" && type.source !== "group")
    .map((type) => type.placement),
  ["buy_again", "seasonal", "best_deals", "schemes"],
  "B2B placements must match the storefront",
);

// --- order is the merchandising decision ------------------------------------------------------
const ordered = normaliseLayoutSections(
  [
    { placement: "recommended", collectionKey: "recommended-picks" },
    { placement: "flash_deals", collectionKey: "flash", enabled: true },
    { placement: "best_sellers", collectionKey: "bestsellers" },
  ],
  "b2c",
  now,
);
assert.deepEqual(
  ordered.sections.map((section) => section.placement),
  ["recommended", "flash_deals", "best_sellers"],
  "stored order must be preserved, not re-sorted",
);

// --- channel isolation ------------------------------------------------------------------------
const wrongChannel = normaliseLayoutSections(
  [{ placement: "flash_deals", collectionKey: "flash" }],
  "b2b",
  now,
);
assert.equal(wrongChannel.sections.length, 0, "a B2C placement must not serve B2B");
assert.ok(
  wrongChannel.issues.some((issue) => issue.message.includes("B2C")),
  "a channel mismatch must be reported as an issue",
);

// --- a section with no source is not servable -------------------------------------------------
const noSource = normaliseLayoutSections([{ placement: "flash_deals" }], "b2c", now);
assert.equal(noSource.sections.length, 0, "a collection section without a collection must not ship");
assert.ok(noSource.issues.some((issue) => issue.placement === "flash_deals"));

// --- unknown placement is rejected, not rendered ----------------------------------------------
const unknown = normaliseLayoutSections([{ placement: "made_up_rail" }], "b2c", now);
assert.equal(unknown.sections.length, 0);
assert.ok(unknown.issues.some((issue) => issue.message.includes("Unknown placement")));

// --- visibility and schedule ------------------------------------------------------------------
const scheduled = normaliseLayoutSections(
  [
    { placement: "flash_deals", collectionKey: "flash", enabled: true },
    { placement: "best_sellers", collectionKey: "best", enabled: false },
    {
      placement: "recommended",
      collectionKey: "recs",
      startsAt: "2026-12-01T00:00:00.000Z",
    },
    {
      placement: "seasonal",
      collectionKey: "seasonal",
      endsAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  "b2c",
  now,
);
assert.equal(scheduled.sections[0].visible, true, "an enabled in-window section is visible");
assert.equal(scheduled.sections[1].visible, false, "a disabled section is not visible");
assert.equal(scheduled.sections[2].visible, false, "a future section is not visible yet");
// The B2B-only 'seasonal' entry is dropped for the B2C channel, so only three remain.
assert.equal(scheduled.sections.length, 3);

// --- buy again resolves to customer history, never a collection --------------------------------
const buyAgain = normaliseLayoutSections(
  [{ placement: "buy_again", title: "Buy Again", enabled: true }],
  "b2b",
  now,
);
assert.equal(buyAgain.sections.length, 1, "buy_again needs no collection: it is customer-specific");
assert.equal(buyAgain.sections[0].source, "customer-history");
assert.equal(buyAgain.sections[0].collection_key, undefined);

// --- the scheme section resolves through schemes ----------------------------------------------
const schemes = normaliseLayoutSections(
  [{ placement: "schemes", title: "Schemes" }],
  "b2b",
  now,
);
assert.equal(schemes.sections[0].source, "schemes");

// --- trade offers group keeps declared child order and reports missing children ----------------
const group = normaliseLayoutSections(
  [
    {
      placement: "trade_offers",
      title: "Trade Offers & Deals",
      children: [
        { placement: "schemes" },
        { placement: "seasonal", collectionKey: "seasonal" },
        { placement: "best_deals", collectionKey: "deals" },
      ],
    },
  ],
  "b2b",
  now,
);
assert.equal(group.sections.length, 1);
assert.deepEqual(
  group.sections[0].children?.map((child) => child.placement),
  ["seasonal", "best_deals", "schemes"],
  "the group's category order is declared, not stored order",
);
assert.ok(
  !group.issues.some((issue) => issue.message.includes("no 'seasonal' child")),
  "all three children are present",
);

const missingChild = normaliseLayoutSections(
  [{ placement: "trade_offers", children: [{ placement: "seasonal", collectionKey: "s" }] }],
  "b2b",
  now,
);
assert.ok(
  missingChild.issues.some((issue) => issue.message.includes("no 'best_deals' child")),
  "a missing child must be reported",
);

// --- a banner is only kept where the placement accepts one ------------------------------------
const bannerRejected = normaliseLayoutSections(
  [{ placement: "best_sellers", collectionKey: "best", bannerReference: "hero-1" }],
  "b2c",
  now,
);
assert.equal(bannerRejected.sections[0].banner_reference, undefined);
assert.ok(bannerRejected.issues.some((issue) => issue.message.includes("does not accept a banner")));

const bannerAccepted = normaliseLayoutSections(
  [{ placement: "flash_deals", collectionKey: "flash", bannerReference: "hero-1" }],
  "b2c",
  now,
);
assert.equal(bannerAccepted.sections[0].banner_reference, "hero-1");

// --- display properties survive -----------------------------------------------------------------
const display = normaliseLayoutSections(
  [
    {
      placement: "flash_deals",
      collectionKey: "flash",
      title: "Flash Deals",
      subtitle: "Ends tonight",
      badge: "Up to 60% OFF",
      limit: "12",
      seeAllLabel: "See all deals",
      seeAllUri: "/browse?tag=Flash%20Deals",
    },
  ],
  "b2c",
  now,
);
const section = display.sections[0];
assert.equal(section.badge, "Up to 60% OFF");
assert.equal(section.limit, 12, "a numeric string limit is coerced");
assert.equal(section.see_all_uri, "/browse?tag=Flash%20Deals");
assert.equal(section.collection_key, "flash");

// --- malformed input is tolerated --------------------------------------------------------------
assert.deepEqual(normaliseLayoutSections(undefined, "b2c", now).sections, []);
assert.deepEqual(normaliseLayoutSections("not-an-array", "b2c", now).sections, []);

console.log("layout-sections-test: PASS (registry, order, channel isolation, sources, schedule, banner rules, groups)");
