# Home hero rotation, delivery selector and web app banner — 19 Nov 2026

Status: **shipped to staging web** · Release `release-web-20261119-170224` · Source `pending commit`
Host: `https://gobazarbee.com` · Branch `feat/bazarbee-branding`

## Scope

1. Three B2C home hero banners, authored and published through Admin Banner Studio.
2. A Flutter-style delivery/location selector in the storefront header next to the cart, persisted
   for the browser and used to pre-fill checkout.
3. A static, in-page, non-clickable app preview at the bottom of the B2C home page.
4. Visual QC at desktop, tablet, standard mobile and small-phone widths.

Production was not touched. Staging remains synthetic and noindex.

## 1. Home hero banners (CMS)

All three are `b2c.home.hero` records in `en-IN`, created and published in Banner Studio. Each has
desktop/tablet/mobile creative URLs, an HTTPS fallback, alt text, a right focal point, a web path,
and CTA copy. Copy is stored in the CMS; the web app only renders it.

| Priority | Content key | Heading | CTA | Web path | Document ID |
|---:|---|---|---|---|---|
| 90 | `hero-monsoon-site-supplies` | Monsoon-ready site supplies. | Shop monsoon picks | `/search?q=waterproofing` | `wjrdouvc3r7py7qs2fw94xb8` |
| 80 | `hero-tools-that-earn-their-keep` | Tools that earn their keep. | Shop tools & hardware | `/search?cat=tools-%26-hardware` | `ldmoex2uau00oby2ao5w55c4` |
| 70 | `hero-colour-that-holds-up` | Colour that holds up. | Shop paints & finishes | `/search?cat=paints-%26-finishes` | `mfgnzt7ao1w10foagqhz90cj` |

Creative assets (2048×768, WebP quality 84, HTTPS 200):

| File | Bytes |
|---|---:|
| `/branding/banners/hero-monsoon-generated.webp` | 90,342 |
| `/branding/banners/hero-tools-generated.webp` | 152,678 |
| `/branding/banners/hero-paint-generated.webp` | 119,600 |

The generated artwork keeps the left half dark and uncluttered for CMS copy; products sit on the
right. The web overlay gradient and the mobile bottom-anchored copy were checked against all three
slides.

Two older hero records were **unpublished** (drafts retained, not deleted) so the home rotation is
exactly three:

- `banner-welcome-en-in` — `vqkq44vmw7zmrq8kn4dsqngw`
- `hero-monsoon-ready` — `tpqwl0lk872wfgyshsabdtgj`

The older `hero-bulk-savings` and `hero-free-delivery` records were already drafts and were left
untouched.

## 2. Campaign strip correction

The existing `b2c.home.campaign-strip` record repeated the monsoon hero and its CTA pointed at
`/browse?tag=Clearance%20Sale`, which returns **404** on the Next.js storefront. It was updated and
republished:

- Heading: **Trade pricing, one GST invoice.**
- Subtitle: Built for contractors, site teams and repeat buyers.
- CTA: **Explore BazarBee Trade** → `/trade` (HTTP 200, `utm_*` attribution added by the web app)
- Creative: `hero-tools-generated.webp`, focal point centre
- Document: `sobtrqtdlynx04b556kshskg`

## 3. Delivery selector

Files:

- `apps/web/lib/delivery.ts` — typed address, pincode directory, defaults, suggestions, localStorage
  read/write.
- `apps/web/app/components/address-selector.tsx` — header chip and portaled modal.
- `apps/web/app/components/site-chrome.tsx` — mounts the selector in the header next to the cart.
- `apps/web/app/checkout/checkout-form.tsx` — reads the saved address into `postalCode` and `city`.
- `apps/web/app/globals.css` — header chip, modal/sheet and app-preview styles.

Behaviour:

- Default: Bhiwadi, Rajasthan 301019.
- Header chip shows `Deliver to · <city> <pincode>` on desktop and a compact pin + pincode on mobile.
  At 340 px and below it collapses to the pin icon alone so the cart stays visible.
- Saved under `bazarbee.delivery.v1`; changes emit `bazarbee-delivery-change` and sync across tabs
  through the `storage` event.
- The modal opens with the current address, pincode, city and state already filled. A six-digit
  pincode from the local directory (20 major cities) auto-fills city and state.
- Popular-city chips apply immediately and close the sheet; the header chip pulses on update.
- Mobile uses a bottom sheet with a drag handle, scroll lock and `Escape` to close. The modal is
  rendered through `createPortal(..., document.body)` because the sticky header's `backdrop-filter`
  otherwise becomes the containing block for fixed positioning.
- Checkout keeps the address as the source of truth for the browser and still requires the street
  address.

## 4. Static app preview

`apps/web/app/components/app-download-banner.tsx`, mounted only at the end of the B2C home page.

- Static server-rendered section; **no links, buttons or dismissal** (`0` interactive elements).
- Copy: “Everything you need, in your pocket.”, store badges marked “Coming soon”, and a
  “Launching soon on Android and iOS.” note.
- Phone screens are real captures of the Flutter app, cropped below the staging bar:
  - `/branding/app/bazarbee-app-home.webp` — 780×1630, 84,018 bytes.
  - `/branding/app/bazarbee-app-browse.webp` — 780×1630, 118,924 bytes.
- The preview is intentionally a web component rather than a CMS banner until store URLs exist.
  When download links are ready, move it to a dedicated CMS placement so operators can edit it.

## 5. Verification

| Check | Result |
|---|---|
| Three `b2c.home.hero` records delivered by the presentation API | Pass — count 3, priorities 90/80/70 |
| Carousel dots and automatic rotation | Pass — 3 dots; Monsoon → Tools observed after ~6.5 s |
| All three slides inspected visually | Pass — copy readable, products clear of the text safe area |
| Hero CTA destinations | Pass — `/search?q=waterproofing`, `/search?cat=tools-%26-hardware`, `/search?cat=paints-%26-finishes`, all HTTP 200 |
| Campaign strip CTA | Pass — `/trade`, HTTP 200 |
| Admin Banner Studio | Pass — `b2c.home.hero · 3 active`; three Live rows |
| Header selector placement | Pass — sits between account and cart; mobile pin + pincode stays beside the cart |
| Address modal at 1440, 390 and 320 px | Pass — portaled to `body`, desktop dialog and mobile bottom sheet fit the viewport |
| Pincode auto-fill | Pass — `400001` fills Mumbai/Maharashtra; `560001` fills Bengaluru/Karnataka |
| Popular-city selection | Pass — applies immediately and updates the header chip |
| Address persistence | Pass — Jaipur and Mumbai selections retained across navigation |
| Checkout pre-fill | Pass — Pune 411001 selected from the header; after simulated-OTP sign-in, checkout showed city `Pune` and postal code `411001`; no order placed |
| Static app preview | Pass — rendered at the page bottom, two real app screens, `0` links/buttons, both images HTTP 200 |
| Horizontal overflow | Pass — 0 px at 1440, 820, 390 and 320 |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

No new order was placed during this pass. Payment and reservation behaviour is unchanged and remains
covered by `full-store-qc-2026-11-19.md`.

## 6. Rollback

1. Unpublish the three new hero records by document ID.
2. Republish `banner-welcome-en-in` and `hero-monsoon-ready` if the previous rotation is required.
3. The campaign strip can be returned to its prior copy and `/browse` CTA, but that CTA 404s on web;
   prefer correcting the path instead.
4. Revert the web commit and redeploy. The previous web release is
   `release-web-20261119-162411` (selector above the hero, dismissible fixed app banner).

## 7. Unchanged risks

Backend order settlement gaps documented in `full-store-qc-2026-11-19.md` are unchanged: payment
authorisation without capture, no Tryton reservation/commit, and an empty
`order_payment_collection`. Production remains unauthorised.
