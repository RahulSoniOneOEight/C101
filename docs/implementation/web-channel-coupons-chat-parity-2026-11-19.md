# Web channel choice, coupons and product chat — 19 Nov 2026

Status: **shipped to staging web** · Release `release-web-20261119-185718` · Source `039e892`
Host: `https://gobazarbee.com` · Branch: `feat/bazarbee-branding`
Previous web release: `release-web-20261119-185334` (first chat/product bundle); earlier
`release-web-20261119-184011` (sign-in/coupon/product/chat bundle) and
`release-web-20261119-182252` (trade access path).

## 1. What changed

### Sign-in channel choice

The web sign-in page now carries the Flutter-style **Consumer D2C / B2B Trade** choice:

- Consumer D2C is the default for a normal sign-in.
- B2B Trade sends the user to `/trade` after verification, or to the original `/trade/...`
  destination when one was supplied.
- Switching the tab also switches the welcome banner (B2C vs B2B CMS placement).
- The channel choice changes the destination only. It does not grant a B2B role: a consumer-only
  account that chooses Trade lands on the trade marketing page with the trade-account notice and a
  **Sign in with a trade account** action.

The header Shop/Trade switch remains independent of the sign-in choice. A trade-enabled account
can sign in either way and switch channels afterwards.

### Offers and promo codes

The cart now exposes an **Offers & promo codes** panel. A saved code is persisted in the browser
and carried to checkout, while the authoritative quote still comes from the server.

Checkout applies the same one-offer-at-a-time model as the Flutter app:

1. The server quote returns the automatic offer (`FLAT5` in staging).
2. A code entered at checkout replaces the automatic offer.
3. A rejected code returns a friendly reason and the server restores the automatic offer.
4. The applied code is passed into the order completion request, not just the quote.

Promotion failures are mapped by problem type (`promotion-rejected`, `promotion-not-found`,
`promotion-usage-limit`, `promotion-unavailable`) instead of surfacing a generic 502. A transport
or service failure while a code is present is no longer blamed on the code.

### B2C/B2B product page parity

Both product pages now show:

- the fulfilment card with Delivery/Pickup tabs, the saved pincode, serviceability and the
  staging delivery promise;
- seller comparison rows (B2C consumer sellers, B2B trade sellers with MOQ and stock);
- richer specs from real catalogue data: brand, category, SKU, seller, offer count, delivery and
  payment terms;
- the real delivery note / standard 3–5 day promise instead of the old hardcoded 1–3 days;
- **Discuss this product**, which shares the product into the human conversation channel.

The B2C page already had the Bought Together pair. The B2B page keeps its trade pricing panel,
MOQ tiers, add-to-quote and add-to-cart actions.

### Chat / Discuss

The web drawer remains the same server-backed workspace conversation:

- the assistant and human channels are read from the workspace service;
- the selected channel is remembered in the browser;
- opening the drawer refreshes messages, and an 8-second poll picks up messages written by the app
  or another browser without a reload;
- polling pauses while a message is being sent so an optimistic message is not dropped.

**Discuss** is now a real product capture, not only a prefilled question. The product is written to
the project/procurement channel as a `product_share` message with a `message_reference` snapshot.
The drawer switches to that channel and renders the product title, SKU, seller, quantity, price and
a **View product** link. The workspace service de-duplicates a repeat share of the same variant.

The drawer is still intentionally read-only for the cart, list and orders; it never changes them.

## 2. Verification

Browser QC at 1440 px against `https://gobazarbee.com`.

| Step | Result |
|---|---|
| `/sign-in?next=%2Ftrade` | Tabs `Consumer D2C`, `B2B Trade`; B2B active |
| B2B sign-in `buyer.b2b01` | Redirected to `/trade`; header shows `Shop`, `Trade` |
| Click Shop | Redirected to `/` |
| `/sign-in` default | Consumer D2C active; toggling B2B makes B2B Trade active |
| Cart promo panel | Saved `ORDER10`; panel shows `Code ORDER10 saved` |
| Checkout with saved code | `APPLIED CODE ORDER10`; `Promo ORDER10 −₹399`; total `₹3,690` |
| Invalid code `NOPE` | `That code is not eligible for this cart.`; `FLAT5` automatic offer restored; total `₹3,889.50` |
| Coded order | `BK-261119-SSQWMK`, total `₹3,690`; line adjustment `ORDER10` amount `399` |
| B2C product page | Fulfilment card, 2 seller offers, Discuss; delivery `Standard · 3–5 days`; specs show brand `baum`, category `Tools & hardware`, SKU, seller, offers, delivery, payment |
| B2B product page | Trade pricing, MOQ 5, add-to-quote/add-to-cart, fulfilment, Discuss; specs show brand, category, MOQ, base trade rate, payment, delivery |
| Discuss on B2C product | Drawer opens on `Procurement`; message `Shared 1/2in Drive 24 Pcs Socket Set for discussion.`; product reference shows SKU, seller, qty, price and `View product` → `/trade/pdp/prod_...` |
| Chat send/reply | Message and assistant reply both persisted and rendered |

### Order evidence

`BK-261119-SSQWMK` (`order_01M7THTY8TDBEPQMZ6JD01902X`):

- channel `b2b`; business `business_shakti_hardware`;
- order total `₹3,690`; `auto_offer_opt_out: true`;
- line item adjustment code `ORDER10`, amount `399`;
- payment collection `pay_col_01M7THTY2ZX7BQ2GZX6M386H69` authorized `₹3,690`, captured `₹0`,
  status `authorized`;
- one reservation row (qty 1 for the tested socket-set line).

The order is still pending capture, as with the earlier B2B orders in this line.

## 3. Files

- `apps/web/app/sign-in/sign-in-form.tsx`, `apps/web/app/sign-in/page.tsx`
- `apps/web/app/cart/promo-code-entry.tsx`, `apps/web/lib/promo-code.ts`
- `apps/web/app/checkout/checkout-form.tsx`, `apps/web/app/api/cart/quote/route.ts`,
  `apps/web/app/api/checkout/route.ts`
- `apps/web/app/products/[id]/page.tsx`, `apps/web/app/trade/pdp/[id]/page.tsx`
- `apps/web/app/components/product-fulfilment.tsx`, `apps/web/app/api/serviceability/route.ts`
- `apps/web/app/components/discuss-product-button.tsx`, `apps/web/app/components/chat-drawer.tsx`,
  `apps/web/app/api/chat/route.ts`, `apps/web/lib/experience-api.ts`
- `apps/web/app/globals.css`

## 4. Remaining gaps / not claimed

- **Full Flutter conversation dock** — the web drawer does not yet expose the shared-list tab,
  invitations/participant management, draft revisions, the cart-build sheet, or read cursors/unread
  counts. The underlying workspace service supports them; the web UI is still the assistant + human
  chat subset.
- **Ratings/reviews and market comparison** — the Experience API exposes no seller/product rating
  or live marketplace comparison. The Flutter price-reference block is a local staging fixture, so
  it was not ported to avoid presenting a fabricated comparison as live data.
- **B2B Bought Together** — the B2C pair renders; the B2B PDP does not yet render one. Staging has
  only active `b2c` pairs, so adding the section today would render nothing.
- **B2B payment capture** — the coded order is authorized, not captured; `order_payment_collection`
  remains absent and the order stays `pending`.
- **`rsoni001` trade access** — still customer-only. Trade access needs a `b2b_buyer` role and a
  business account; the UI now explains this instead of hiding the path.
- **Consumer sign-in re-test** — the OTP simulation notice was not available for the consumer pilot
  e-mails during this QC, so the signed-in consumer → Trade denial path was not re-run. The
  trade-access release (`release-web-20261119-182252`) recorded that path.

## 5. Rollback

Redeploy `release-web-20261119-184011` (before the final chat reference card) or
`release-web-20261119-182252` (before the sign-in/coupon/product bundle). No schema or data
migration was part of this bundle.
