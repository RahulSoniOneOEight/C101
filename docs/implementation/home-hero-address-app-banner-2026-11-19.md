# Home hero rotation, delivery selector and web app banner — 19 Nov 2026

Status: **shipped to staging web** · Release `release-web-20261119-162411`
Host: `https://gobazarbee.com` · Branch `feat/bazarbee-branding`

## Scope

1. Three B2C home hero banners, authored and published through Admin Banner Studio.
2. A Flutter-style delivery/location selector on the B2C home page, persisted for the browser and
   used to pre-fill checkout.
3. A fixed, dismissible web-only app-download banner on the B2C home page.
4. Visual QC of the home page at desktop, tablet and mobile widths.

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

- `apps/web/lib/delivery.ts` — typed address, defaults, suggestions, localStorage read/write.
- `apps/web/app/components/address-selector.tsx` — location pill and modal.
- `apps/web/app/page.tsx` — mounts the selector in `.home-delivery-bar` above the hero.
- `apps/web/app/checkout/checkout-form.tsx` — reads the saved address into `postalCode` and `city`.
- `apps/web/app/globals.css` — selector, modal and app-banner styles.

Behaviour:

- Default: Bhiwadi, Rajasthan 301019.
- Saved under `bazarbee.delivery.v1`; changes emit `bazarbee-delivery-change` and also sync across
  tabs through the `storage` event.
- Six-digit pincode validation; city required; state optional.
- Popular-city shortcuts: Bhiwadi, Jaipur, New Delhi, Mumbai, Bengaluru.
- Checkout keeps the address as the source of truth for the browser and still requires the street
  address.

## 4. Web app-download banner

`apps/web/app/components/app-download-banner.tsx`, mounted only on the B2C home page.

- Appears after 420 px of scroll; fixed bottom-left on desktop.
- Dismissal stored in `bazarbee.appBanner.dismissedAt.v1` for seven days.
- Links to `https://app-staging.pinakaplay.cloud`.
- On mobile it sits above the tab bar (`bottom: 150px`); measured box `y=622–694` against the chat
  FAB at `y=713–760`, so they do not overlap.

## 5. Verification

| Check | Result |
|---|---|
| Three `b2c.home.hero` records delivered by the presentation API | Pass — count 3, priorities 90/80/70 |
| Carousel dots and automatic rotation | Pass — 3 dots; Monsoon → Tools observed after ~6.5 s |
| All three slides inspected visually | Pass — copy readable, products clear of the text safe area |
| Hero CTA destinations | Pass — `/search?q=waterproofing`, `/search?cat=tools-%26-hardware`, `/search?cat=paints-%26-finishes`, all HTTP 200 |
| Campaign strip CTA | Pass — `/trade`, HTTP 200 |
| Admin Banner Studio | Pass — `b2c.home.hero · 3 active`; three Live rows |
| Address modal at 1440 px and 390 px | Pass — opens, validates, popular-city selection updates the pill |
| Address persistence | Pass — Jaipur and Mumbai selections retained across navigation |
| App banner appear/dismiss | Pass — appears after scroll, dismiss removes it and writes the timestamp |
| Horizontal overflow | Pass — 0 px at 1440, 820 and 390 |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

### Limitation

Checkout pre-fill is wired and typechecked, but a scripted end-to-end check was blocked by the
staging OTP sign-in gate (no test credential was available in this pass). The rendered checkout was
not exercised with a signed-in session, and no new order was placed.

## 6. Rollback

1. Unpublish the three new hero records by document ID.
2. Republish `banner-welcome-en-in` and `hero-monsoon-ready` if the previous rotation is required.
3. The campaign strip can be returned to its prior copy and `/browse` CTA, but that CTA 404s on web;
   prefer correcting the path instead.
4. Revert the web commit and redeploy. The previous web release is
   `release-web-20261119-160503`.

## 7. Unchanged risks

Backend order settlement gaps documented in `full-store-qc-2026-11-19.md` are unchanged: payment
authorisation without capture, no Tryton reservation/commit, and an empty
`order_payment_collection`. Production remains unauthorised.
