# CHG-043 Destructive Removal — Audience and Category Banner Fields

**Date:** 17 October 2026
**Change contract:** CHG-043 revision 2
**Status:** Deployed and verified; production remains unauthorized

## Release

- Release commit: `a4d37f7`
- Worktree: `/opt/buildkart-releases/a4d37f7`
- Previous release retained for rollback: `/opt/buildkart-releases/2004219`
- Recreated services: `cms`, `medusa-api`, `experience-api`

## What was dropped

| Removed | From | Reason |
|---|---|---|
| `audience` | banner | The banner type carries the channel; nothing read the field after the delivery rewrite |
| `externalBannerImageUrl` | category details | The category banner image is now owned by banner records |
| `bannerImageAltText` | category details | Same |

Stored `audience` values at the time of removal were `both ×20` and `b2c ×2`. They were unused, so
dropping the column loses no behaviour. Six published category banner records already carried the
category images, verified before the columns were removed.

## Also changed

- `resolveSeedBanners` now filters by the registry's home types instead of the removed audience field,
  so a seed banner is addressed exactly like a CMS banner.
- The CMS bootstrap seed no longer writes category banner fields; it creates a category banner record
  per category instead, so a fresh environment still has category imagery.
- The console's audience filter was deleted along with `AUDIENCE_LABELS` and `audienceLabel`.
- `tooling/validate_banner_types.py` compares the console and delivery copies of the type registry on
  placement, channel, surface, requiresCategory and label, and is wired into the Contract validation
  workflow. Verified to fail on a deliberately diverged copy before being relied on.

## Verified on staging

- `banners.audience`, `category_editorials.external_banner_image_url` and
  `category_editorials.banner_image_alt_text` no longer exist; `banners.category_id` and
  `category_editorials.channel` do.
- Banner types in the database are only `b2c.home.hero` (8 rows, 4 published),
  `b2c.home.campaign-strip` (2 rows, 1 published) and `b2c.category.banner` (12 rows, 6 published).
- Six published category banners still carry their images.
- **B2C delivery unchanged**: `source=cms-strapi`, 5 home banners, 6 categories all with images.
- The console bundle carries all four types, the category picker and the Category details rename, and
  the removed audience control is absent. Both routes return `200`.

## Deliberate behaviour change

**B2B now returns zero home banners.** The governed seed previously matched B2B through its `audience`
field; with audience gone and no B2B home type in the registry, the correct answer is zero. The customer
B2B app never requests `channel=b2b`, so nothing visible changes, but the API response is different and
this is recorded rather than glossed over.

B2B categories still show imagery, but it comes from the governed seed, not the CMS. The response
labels the category source `cms-strapi` even though no category record matched the B2B channel; that
label is misleading and predates this change.

## Not verified

1. **The CMS bootstrap seed change is unexercised.** It was compiled and code-reviewed but never run,
   because running it needs a fresh CMS database. A fresh environment should be stood up before relying
   on it.
2. **No human has clicked the console.** The category picker, the conditional Category field and the
   removal of the audience filter are all verified only by bundle contents and route status.
3. **B2B is still app-hardcoded** and still never requests `channel=b2b`; the B2B banner type remains
   labelled `Not rendered by the app`.
4. **Category details has no channel filter**, so both channels' records list together.
