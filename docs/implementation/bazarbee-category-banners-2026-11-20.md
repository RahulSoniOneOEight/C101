# Category banners — 2026-11-20

Status: **published and live on staging** · created through the admin Banner Studio · production
untouched.

## 1. Banner set

Three B2C category banners were composed from the existing BazarBee hero art so the palette and
lighting match the storefront. All are 1600×600 WebP, with the products weighted right and a dark
lower-left safe area for the overlay copy.

| Category | Admin banner name | Technical key | Copy |
|---|---|---|---|
| Paints & Finishes | Paints & Finishes — Category | `b2c.category.paints-finishes.2026-11` | “Colour that holds up.” / Interior and exterior finishes, primers and site-ready coatings. |
| Tools & Hardware | Tools & Hardware — Category | `b2c.category.tools-hardware.2026-11` | “Tools that earn their keep.” / Drills, socket sets and hand tools built for daily site work. |
| Construction | Construction — Category | `b2c.category.construction.2026-11` | “Site supplies, one GST invoice.” / Cement, boards, tarps and fixings for the whole project. |

Assets:

```text
apps/web/public/branding/category/category-paints-1600.webp
apps/web/public/branding/category/category-tools-1600.webp
apps/web/public/branding/category/category-construction-1600.webp
```

Served from:

```text
https://gobazarbee.com/branding/category/<file>
```

## 2. Admin publication

Path: **Merchandising → Banners → Create banner**

Each banner was created with:

- placement `B2C · Category banner`
- the matching Medusa category reference
- fallback and desktop creative URLs
- alternative text
- heading, supporting text and web variants
- technical key and priority 10
- language English (India)

Saved as draft, then opened and published through **Review & publish → Confirm publication**.

CMS rows are published (`published_at` set):

```text
b2c.category.paints-finishes.2026-11   19:07 UTC
b2c.category.construction.2026-11      19:08 UTC
b2c.category.tools-hardware.2026-11    19:08 UTC
```

## 3. Storefront verification

Open the category pages:

```text
https://gobazarbee.com/search?cat=paints-%26-finishes
https://gobazarbee.com/search?cat=tools-%26-hardware
https://gobazarbee.com/search?cat=construction
```

For each page:

- `.category-banner` is present
- image `src` is the new `/branding/category/...webp`
- `naturalWidth > 0` (creative loaded)
- overlay copy matches the admin banner
- zero page errors

Observed:

```text
paints      Colour that holds up. / Interior and exterior finishes…
tools       Tools that earn their keep. / Drills, socket sets…
construction Site supplies, one GST invoice. / Cement, boards, tarps…
```

## 4. Release

- Web: `release-web-20261120-190946`
- The new assets are baked into the release, not just copied into a running container.
- Proxy restarted after the web recreate so nginx re-resolved the upstream.

## 5. Notes

- The store already had older category banners for these categories; the new published banners win
  in the CMS delivery map and are the images observed on the storefront.
- Image generation was unavailable (provider quota), so the creatives reuse existing BazarBee hero
  art rather than new generated scenes. They remain editable through Banner Studio.
- No production action.
