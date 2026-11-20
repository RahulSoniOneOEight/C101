# Razorpay prepaid checkout — staging implementation

Status: **B2C web checkout verified on staging** · B2B prepaid uses the same server flow, not yet
browser-tested · Production untouched.

## 1. Scope

- Both web channels are **prepaid**. Credit/RFQ stays out of production v1.
- Payments use Razorpay **test keys** in staging. Live keys are not committed.
- Manual seller/admin logistics is unchanged; no carrier integration is involved.

## 2. Implemented

### Medusa payment provider

New module `services/backend/packages/api/src/modules/razorpay-payment`:

- creates a Razorpay order from the Medusa payment session amount;
- verifies the buyer’s Razorpay payment by order ID (never trusts a client amount);
- captures an authorized payment when needed;
- supports Razorpay refunds;
- records provider payment/order/status evidence in the Medusa session.

`PAYMENT_ADAPTER_MODE=provider` now registers the Razorpay provider instead of throwing.
`configure:razorpay-payment` adds `pp_razorpay_razorpay` to the India region.

### Experience API

- `POST /v1/checkouts/razorpay/start` creates the cart, delivery, customer details, Razorpay
  payment collection/session and returns the public key ID + Razorpay order ID.
- `POST /v1/checkouts/razorpay/confirm` verifies `HMAC-SHA256(order_id|payment_id)` and completes
  the Medusa cart.
- `POST /v1/checkouts/razorpay/status` is a server-side fallback: it queries Razorpay, and only
  when a captured/authorized payment exists does it complete the cart. This covers delayed or
  blocked Razorpay browser callbacks.
- Guest checkout uses a short-lived HMAC checkout token bound to cart, collection, session, email
  and mobile.
- Signed-in B2C and B2B use the owner-scoped session and `authorizeCheckoutOwner`.

### Web checkout

- `/checkout` shows **Pay with Razorpay** when provider mode is enabled.
- Razorpay Checkout opens with the server-created order.
- The page also polls the status endpoint every 2.5 seconds; a captured payment completes the
  order even if Razorpay’s `handler` callback does not fire.
- Confirmation shows `Payment: Razorpay`.
- `PAYMENT_ADAPTER_MODE=provider` is supplied to the web container through
  `/etc/buildkart/secrets/web.env`.

### Hosting

- `medusa-api`, `medusa-worker` and `experience-api` now join the `egress` network for Razorpay
  API/webhook calls.
- `web.env` is loaded by the web service; test keys remain only in host secret files.

## 3. Staging evidence

Razorpay test order created through the web proxy:

```text
POST /api/checkout/razorpay (start) -> 200
order_U2PgwM34yUC3Ub · amount 47900 INR · key rzp_test_…
```

Razorpay Checkout opened with Test Mode. Domestic test card ending `5449`, OTP `1111`:

```text
Payment Successful
Razorpay payment pay_U2PhAKHOAv1mxT
captured: true · amount: 47900 · currency: INR
```

Final browser run after the status fallback:

```text
ORDER CONFIRMED
BK-261120-FZ637G
Order total ₹479
Payment: Razorpay
```

Server evidence:

```text
checkout_ref  cart_...
owner_user_id null
guest_contact {"email":"razorpay.success@gmail.com","mobile":"+919123456789"}
provider_id   pp_razorpay_razorpay
payment_mode  provider
provider_payment_id pay_U2Ps6MvuWewy64 (earlier run pay_U2PhAKHOAv1mxT)
test_data     true
```

An earlier captured payment was reconciled through the status endpoint to
`BK-261120-1M5REY`; a later browser run created `BK-261120-T2YQBZ`, and the final run created
`BK-261120-FZ637G`.

## 4. Verification

- `bunx tsc --noEmit` — backend API
- `bun run typecheck` — Experience API
- `npm run typecheck` / `npm run build` — web
- `bun run src/scripts/payment-safety-test.ts` — PASS
- Browser: Razorpay modal, domestic test card, OTP, success screen, polling completion,
  confirmation page, zero page errors.

Screenshots: `razorpay-checkout-07-card.png`, `razorpay-checkout-16-success.png`,
`razorpay-final-success.png` (local QC folder).

## 5. Remaining before production

- B2B prepaid browser test with a trade-enabled account and B2B offer.
- Razorpay **webhook** endpoint and reconciliation; current completion is synchronous + status
  polling.
- Refund flow through a return case and Razorpay refund API.
- Flutter Razorpay SDK integration; the app still uses the mock gateway.
- Live keys, merchant account activation and finance/ERP posting approval.
- Production egress/firewall allowlist for Razorpay and webhook source.
- Production webhook secret rotation; staging test secret is in host files only.

## 6. Release record

- Backend: `release-backend-20261120-105614`
- Experience API: `release-api-20261120-113838`
- Web: `release-web-20261120-114057`
- Source: `1fbccd0`
