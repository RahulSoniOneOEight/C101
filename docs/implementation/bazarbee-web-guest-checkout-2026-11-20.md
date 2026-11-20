# Web guest checkout with mobile capture — 20 Nov 2026

Status: **implemented on staging** · Web `release-web-20261120-085736` · API
`release-api-20261120-085556` · Source `dceda27`, `ab9acc8`
Production: untouched.

## 1. What changed

The web store now allows a buyer to place a **Shop (B2C)** order without signing in.

- `/checkout` no longer redirects anonymous buyers to `/checkout` sign-in.
- The guest form collects **email + Indian mobile number + delivery address**. The mobile is
  required and normalized to `+91XXXXXXXXXX`.
- Guest quotes come from a public quote path, so subtotal, automatic offer, delivery and total are
  shown before placing the order.
- Guest completion uses an **Idempotency-Key**: a retry returns the first order instead of creating
  a second one.
- No password or sign-in account is created. Medusa may retain a guest customer record keyed by the
  supplied email, which is normal guest behaviour; the buyer still has no login.
- The order stores the guest contact explicitly:
  - `guest_checkout: true`
  - `guest_contact: { email, mobile }`
  - `shipping_address.phone` (E.164)
- **Trade (B2B) checkout still requires sign-in.** Guest requests for a B2B cart are rejected with
  `403`.
- Signed-in checkout keeps the existing owner-scoped flow and now shares the same completion helper,
  so there is one completion path rather than two copies.

API additions:

- `POST /v1/guest/cart-quote`
- `POST /v1/guest/checkout` (requires `Idempotency-Key`)
- `GuestCheckoutStore` table `guest_checkout_request` for request reservation and replay.

Web additions:

- Anonymous access to `/api/cart/quote` and `/api/checkout` for B2C.
- `completeGuestCheckout` / `quoteGuestCart` clients.
- Guest mobile field and guest-specific confirmation copy.
- Guest confirmation avoids the signed-in `/orders` link and offers sign-in only as an option.

## 2. Browser QC

Anonymous Chrome context, no session cookie:

```text
POST /api/cart/quote -> 200
subtotal 40000 · shipping 9900 · discount 2000 · total 47900 INR
itemCount 1 · FLAT5 automatic
```

Guest checkout form on `/checkout`:

```text
Guest checkout — no account needed. We will use this mobile for delivery updates.
Email
Mobile number
Delivery address
Order summary: Wonder Cement ₹400 · automatic offer −₹20 · delivery ₹99 · total ₹479
```

Completed guest orders:

```text
BK-261120-PT4NEZ   guest.qc@example.com        +919876543210
BK-261120-FQF34G   guest.qc.browser@example.com +919876543210
BK-261120-P6SXHG   guest.qc.browser@example.com +919876543210
```

Confirmation:

```text
Your guest order is confirmed with a simulated payment.
No sign-in account or password was created. Keep this reference for support;
the mobile you entered is recorded for delivery.
ORDER REFERENCE: BK-261120-P6SXHG
Order total ₹479 · Payment simulated · Delivery standard 3–5 days
GST invoice will be issued for this order
Sign in to track orders · Continue shopping
```

Database evidence (`buildkart_experience`):

```text
correlation.owner_user_id = null
guest_checkout = true
guest_contact = {"email": "...", "mobile": "+919876543210"}
shipping_address.phone = +919876543210
```

Idempotent retry with the original key and body:

```text
order BK-261120-PT4NEZ · replay True
```

Negative checks through the web proxy:

```text
no Idempotency-Key      -> 400
invalid mobile (12345)  -> 400
B2B guest checkout      -> 403
same key, different body -> 409
```

Signed-in regression after the shared completion refactor:

```text
BK-261120-CXNFRG · ₹479 · confirmation rendered · zero page errors
```

Screenshots: `guest-checkout-01-form.png`, `guest-checkout-02-confirmed.png`.

## 3. Verification

- `bun run typecheck` (Experience API) passed.
- `bun test src/guest/guest-checkout.test.ts` passed **6/6** (mobile normalization, validation,
  B2B rejection, duplicate offer, quote validation).
- `npm run typecheck` and `npm run build` (web) passed.
- Guest notification events are explicitly skipped by the notification processor, so an
  ownerless order does not create a dead-letter.

## 4. Residual limitations

- Guest order tracking by reference/mobile is not implemented yet; the confirmation is the only
  guest-facing receipt.
- Transactional guest email is not sent: the existing notification pipeline is pilot-account/FCM
  scoped and intentionally skips ownerless orders. The email/mobile are stored for operations.
- The public guest endpoints rely on input limits and the idempotency ledger; per-IP checkout rate
  limiting is not configured.
- A failed guest attempt after the cart was created but before completion leaves the idempotency key
  reserved (retry returns `409`). This avoids duplicate orders; operators must clear the row before
  a manual retry. A promotion rejection releases the key because no order was attempted.
- Production rollout still requires the normal release/finance gates. This change is staging-only
  and the simulated payment path remains unchanged.
