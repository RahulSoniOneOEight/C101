# 13-inch laptop storefront layout — 20 Nov 2026

Status: **implemented on staging** · Web `release-web-20261120-091237` · Source `7c49960`
Production: untouched.

## 1. Scope

Lane A, CSS-only. Common 13-inch logical viewports are **1280×800**, **1366×768** and
**1440×900**. The storefront previously used its full desktop header and a 520px campaign hero at
those widths, which pushed the next section below the fold and clipped the last category-rail item
at 1280px.

No markup, API, cart or checkout behaviour changed.

## 2. What changed

`apps/web/app/globals.css` now has two laptop queries:

- **1025–1366px wide**
  - header gap 24→16px;
  - header action gap 8→6px and horizontal padding 12→9px;
  - category-rail link padding/font reduced so all 12 categories fit at 1280px.
- **1025px wide and ≤920px tall**
  - container top padding 32→24px;
  - header height 98→88px and brand mark 74→66px;
  - campaign hero 520→430px with tighter copy padding and heading size;
  - section spacing 64→48px;
  - campaign strip and section headings reserve 168px on the right so the fixed `Ask BazarBee`
    button never covers the trade CTA or a section link.

Wide desktops (>1366px wide or >920px tall) keep the original 520px hero and 98px header.
Mobile/tablet rules are unchanged.

## 3. Verification

Staging measurements after `release-web-20261120-091237`:

| Viewport | Scroll width | Header | Hero | Category rail | Chat overlap |
|---|---|---|---|---|---|
| 1280×800 | 1280 / 1280 | 90px | 430px | 1280 / 1280 | no |
| 1366×768 | 1366 / 1366 | 90px | 430px | 1360 / 1360 | no |
| 1440×900 | 1440 / 1440 | 90px | 430px | 1360 / 1360 | no |
| 1920×1080 | 1920 / 1920 | 98px | 520px | 1360 / 1360 | no |
| 390×844 | 390 / 390 | 91px | 430px | hidden (mobile) | no |

Before the change at 1280×800: header 98px, hero 520px, rail scroll width 1329px inside a
1280px rail (last item clipped). After: header 90px, hero 430px, rail exactly 1280px.

Additional checks:

- `/checkout` at 1280: no horizontal overflow; form 784px + summary 420px.
- `/trade` at 1280: no overflow; hero 426px.
- `/discover`, PDP, cart and trade pages: zero page errors at every tested viewport.
- The campaign strip is fully visible at 1280×800 and 1366×768; the chat launcher does not cover
  its CTA or the “View everything” section link.
- `npm run typecheck` and `npm run build` passed.

Screenshots: `laptop-ship-1280.png`, `laptop-ship-1366.png`, `laptop-ship-1440.png`,
`laptop-ship-checkout-1280.png`, `laptop-ship-trade-1280.png`, `laptop-live-390.png`.

## 4. Residual notes

- The reserved 168px right gutter on campaign strips/section headings is intentional space for the
  fixed chat launcher on short laptop windows; it is only applied at ≤920px height.
- The hero remains 430px on mobile via the existing mobile rules; this change does not alter the
  mobile layout.
- Production deployment remains governed by the normal release process.
