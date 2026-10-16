# Collections, Banners and Storefront Layouts — Inspection and Gap Analysis

**Date:** 17 October 2026
**Scope:** The Mercur/Medusa admin and the two storefronts, inspected before any implementation.
**Contract:** CHG-044

## What already exists (reuse, do not rebuild)

| Brief section | Already present | Where |
|---|---|---|
| Products → Collections: list, create, edit, media, add products | **Yes, native** | Mercur/Medusa bundled admin. Our admin source has no `products/` routes at all — the asset set includes `collection-list`, `collection-create`, `collection-detail`, `collection-add-products`, `collection-media`, `collection-edit` |
| Products → Categories | Yes, native | Same bundle (`category-list`, `category-create`, `category-detail`, `category-media`, `category-products`) |
| Merchandising → Banners | **Yes, ours** | `routes/merchandising/banners` + the banner studio (CHG-042/043): types now carry the channel, category banners, publish/unpublish, server-enforced start/end window, draft-vs-published isolation, preview, duplicate, concurrency |
| Merchandising → Storefront layouts | Partly, ours | `routes/merchandising/storefront-layouts` — a **CMS content type** with `layoutKey`, `channel`, and a raw JSON `modules` array. It is a JSON editor, not a section editor |
| Backend layout delivery | Partly | `GET /v1/content/app-shell` returns the layout with ordered modules; `GET /v1/content/presentation` returns banners and categories |
| B2C storefront sections | Yes, but **hardcoded in the app** | `homeModulesProvider` builds Flash Deals, Best Sellers, Recommended locally; its own comment says "Module ordering is local until a layout-driven scroll feed is wired" |
| B2B storefront sections | Yes, but **fixture-driven** | Buy Again, Trade Offers & Deals with Seasonal / Best Deals / Schemes exist as UI backed by `tradeOfferCollectionsProvider` |
| Offers, pricing, promotions, cart, wishlist, product cards | Yes | Existing components; the brief says reuse them |

**The placement keys in the brief match the real app sections** — Flash Deals, Best Sellers, Recommended (B2C) and Buy Again, Trade Offers & Deals → Seasonal / Best Deals / Schemes (B2B). That alignment is genuine and useful: the work is to move the *configuration* of those sections to the backend.

## What is missing

1. **A section-based layout editor.** Today a storefront layout is a raw JSON `modules` blob. There is no placement registry per channel, no product-source selector, no drag ordering, no enable/disable, no banner association, no per-section scheduling, no preview.
2. **Storefront consumption of the layout.** The app decides section order and content locally. The layout the API already returns is not what drives the storefront scroll feed.
3. **Manual, collection-scoped product ordering.** Native collections have membership but no per-collection rank. Medusa's collection-product link carries no position field, so drag ordering needs custom persistence.
4. **Real Buy Again.** Per `docs/architecture/BuildKart-Backend-Managed-Elements-Mapping.md` the source is commerce order history, currently marked **fixture**. There is no customer-scoped endpoint yet. Reordering also lacks the revalidation the doc requires (current price, substitution, availability) before building a cart.
5. **Real Schemes.** The mapping doc records schemes as **fixture** with "only title/detail/badge", and lists scheme qualification, benefit calculation, cap, period and redemption as an open gap.

## Conflicts with decisions already governed in this repository

These are not blockers to raise later — they need a decision now, because several reverse work that is currently live.

1. **Merchandising must contain exactly Banners and Storefront layouts.** Merchandising currently exposes **ten** routes: Banners, Storefront layouts, Category details, Product editorial, Collection presentation, Help and articles, Overview, Review queue, Delivery status, Content activity. Removing eight of them would:
   - orphan **Category details**, which after CHG-043 is the only editor for category label, icon, short text, heading and description — the banner moved out, the rest did not;
   - orphan **Product editorial** and **Help and articles**, which have live CMS content types and delivery;
   - reverse CHG-039 and CHG-040, which were approved changes.
   So "exactly two menu items" is achievable, but only if those editors move somewhere defined or are deliberately retired. That is a product decision, not an implementation detail.

2. **Collections have no Draft/Published state in Medusa.** The brief asks for a status filter, a status column, "save as draft" and "save and publish". A Medusa Collection has handle, title, metadata and products — there is no status field. Either the status concept is dropped, or a custom status is added and enforced, and then the public store API must honour it.

3. **Manual ordering must not be conflated with sorting.** The brief is right that manual order must survive computed sorts. That requires the rank to be stored per collection, separately from any display-time sort.

4. **Scheduling needs a backend mechanism, and one exists.** Banners already use a server-enforced start/end window evaluated at request time. Layout sections can reuse that, rather than a browser timer. There is no "campaign" entity, and the brief's "campaign association if supported" has nothing to point at.

5. **Media upload is still deferred.** The brief asks for desktop and mobile images, upload, preview, replace and size validation. Banners currently use an https creative reference because the DAM decision (CHG-026) is unresolved. Adding uploads means deciding media storage first.

6. **"Recommended" cannot be honestly personalised.** There is no recommendation engine. The brief allows a curated collection as the source and asks that curated and personalised be distinguished — so the section must be labelled curated until a real engine exists.

## Scale

Part A is mostly reuse plus ordering. Part B is largely done. **Parts C and D — the layout configuration model, the section editor, and storefront consumption — are the substance**, and they span the CMS, a new backend contract, the admin console, and both storefront modes. This is a multi-phase program, not a single change, and it cannot be completed in one pass without either skipping verification or inventing capability.
