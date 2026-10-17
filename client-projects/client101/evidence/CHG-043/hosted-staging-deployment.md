# CHG-043 Hosted Staging Deployment — Category Banner Ownership Move

**Date:** 16 October 2026
**Change contract:** CHG-043 revision 2
**Environment:** Staging
**Status:** Phases 1 and 2 deployed and verified; the destructive field removal is deliberately not done; `production_release_authorized: false`

## Release

- Branch: `feat/medusa-native-merchandising-admin`
- Release commit: `2004219`
- Active worktree: `/opt/buildkart-releases/2004219`
- Previous release retained for rollback: `/opt/buildkart-releases/d89850d`
- Recreated services: `cms`, `medusa-api`, `experience-api`

## Banner types now carry the channel

The banner's type is its placement and the type carries the channel, so the `audience` field is no
longer consulted by delivery:

```
b2c.home.hero · b2c.home.campaign-strip · b2c.category.banner · b2b.category.banner
```

The registry lives in `services/experience-api/src/content/placement-registry.ts` as the delivery
authority, mirrored in the console's `banner-model.ts`. The two are mirrored rather than imported
because the console and the delivery service build from different Docker contexts with no shared source
root; both files say so, and a divergence check is still outstanding (see below).

## Migration (through the operator API, never raw SQL)

| Step | Result |
|---|---|
| Backfill category details channel to B2C | 7 records |
| Re-point legacy placements to channel-prefixed types | 5 banners |
| Create and publish a category banner per category | 6 created, 1 skipped |

The categories' banner images are unchanged, because the migration copied the existing values rather
than inventing new ones:

- `banner-welcome-en-in` → `b2c.home.hero`
- `hero-monsoon-ready`, `hero-bulk-savings`, `hero-free-delivery` → `b2c.home.hero`
- `secondary-clearance-sale` → `b2c.home.campaign-strip`
- 6 × `b2c.category.banner`, one per category, each carrying its category reference

Post-migration database state:

- legacy placements remaining: **0**
- `b2c.category.banner`: 12 rows (6 published, 6 drafts)
- `b2c.home.hero`: 8 rows (4 published), `b2c.home.campaign-strip`: 2 rows (1 published)
- category details: 14 rows (7 published), all `channel = b2c`

## Delivery verified

- **B2C** `source=cms-strapi`: 5 home banners, the four heroes plus the campaign strip, each carrying
  its new channel-prefixed placement.
- **B2C categories**: all six expose a banner image with `presentation_source=cms`, now sourced from the
  category banner records while the payload shape is unchanged — so the customer app needs no update.
- **B2B**: `source=governed-editorial-seed`. The CMS contributes no B2B home banners because no B2B home
  type exists, so delivery falls back to the governed seed. Stated plainly rather than hidden.

## Console verified

Served bundle `assets/index-UC5bBizv.js` contains all four types, `Category details`, and the category
picker (`Choose a category`). `/dashboard/merchandising/banners` and
`/dashboard/merchandising/category-presentation` both return `200`.

## Not done — the destructive step, on purpose

`audience` is still present on the banner and the two category banner fields are still present on
category details. The stored `audience` values are `both ×20` and `b2c ×2`; nothing reads them any more,
but dropping a column is irreversible and belongs in its own verified step, so it has not been rushed at
the end of this change.

## Honest limitations

1. **The mirror is not enforced yet.** The two copies of the type registry can drift; the divergence
   check named in the contract is not written.
2. **One category detail record produced no banner.** Two category detail records exist for
   `pcat_construction`/`Building & Construction` (a pre-existing duplicate), and they slug to the same
   content key, so one was skipped. The duplicate is a data issue, not a migration bug.
3. **B2B remains app-hardcoded.** The B2B category banner is still `b2bCategoryBannerImage()`, and the
   B2B app still never requests `channel=b2b`. The new B2B type is therefore labelled
   `Not rendered by the app` in the studio, and phase 3 is unchanged and outstanding.
4. **Category details has no channel filter.** Both channels' records appear in one list; the channel is
   visible in the Context column, but there is no way to filter to one set yet.
5. **No human has looked at it.** All verification above is server-side and bundle-level; the console
   changes have not been clicked through.
