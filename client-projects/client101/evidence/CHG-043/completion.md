# CHG-043 Completion — App Deployment, Alt Text, Channel Filter, B2B Content

**Date:** 17 October 2026
**Status:** Deployed; visual confirmation remains human work
**Commits:** `528c849` (B2B reads CMS) · `c6756ff` (alt text + channel filter)

## How the app was deployed — Firebase, not Cloudflare

The B2C web app has always been published to **Firebase Hosting**, not Cloudflare:

| Item | Value |
|---|---|
| Hosting | Firebase Hosting site `buildkart-staging` |
| URL | `https://buildkart-staging.web.app` |
| Config | `firebase.json` + `.firebaserc` at the repo root (`"default": "buildkart-staging"`) |
| Deploy | `flutter build web --release` with staging dart-defines, then `firebase deploy --only hosting --project buildkart-staging` |

Cloudflare is not involved in the web app host. The **API** is on the VPS behind Traefik with direct A
records (`api-staging.pinakaplay.cloud`), and the `cloudflared` compose overlay is used for operator
reachability, not for hosting the app.

The Firebase CLI on this machine is authenticated as `pinakacommerce@gmail.com`, so the app could be
built and deployed here. **The B2B change is now live at `https://buildkart-staging.web.app`.**

## Alt text carried through to the image

`MerchandisingBannerData`, `StorefrontBanner` and `StorefrontCategory` previously ignored the CMS
alternative text, so an image that carries an offer was announced as decorative. Now:

- `StorefrontBanner.imageAlt` parses `image_alt`; `StorefrontCategory.bannerImageAlt` parses
  `banner_image_alt`.
- `MerchandisingBannerData.imageAlt` and the `MerchandisingBanner` widget pass it on as the image's
  `semanticLabel`.
- Wired for both the B2C campaign strip and the B2B category banners.

Verified: `flutter analyze` clean, 135 tests pass. The compiled `main.dart.js` grep for
`semanticLabel` is **inconclusive** — minification renames it — so that particular assertion rests on
the analyzer and tests, not on the bundle.

## Channel filter on Category details

Category details now filters by channel (`B2C and B2B` / `B2C only` / `B2B only`), because the two
channels are independent sets. Deployed to staging as `c6756ff`; the served console bundle contains all
three options and the route returns `200`.

## B2B content authored, and a dependency worth knowing

Banners alone were not enough. A category banner only attaches to a category that has a **Category
details record for that channel**, because the banner image is merged into the category composition.
B2B had banners but no details records, so it was still rendering governed-seed imagery with an empty
alt — visible in the API as `with_alt=0`.

After authoring both halves:

| Channel | Source | Categories | With image | With alt |
|---|---|---|---|---|
| B2C | `cms-strapi` | 6 | 6 | 6 |
| B2B | CMS categories | 6 | 6 | 6 |

Content created on staging (mirroring the B2C set, editable, and **not deletable from the console**):
6 × `b2b.category.banner` and 7 × Category details records with `channel = b2b`.

**This dependency is not surfaced anywhere in the console.** An operator can author a B2B category
banner, publish it, and see nothing happen because the matching Category details record does not exist.
That is the same class of silent no-op this change has been removing, and it should be fixed in the
console next.

## Not verified

1. **No browser confirmation.** The app is deployed, but nobody has opened the B2B mode and looked at a
   CMS category banner, or heard the alt text announced. Everything above is API-level, unit-level and
   bundle-level evidence.
2. **The console has not been clicked** — the channel filter, and now the B2B banner authoring flow, are
   verified only by bundle contents and route status.
3. **The bootstrap seed is still unexercised** (needs a fresh database).
