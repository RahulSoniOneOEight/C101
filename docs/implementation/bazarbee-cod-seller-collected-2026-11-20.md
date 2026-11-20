# Seller-collected COD — staging slice 1

Status: **B2C and B2B COD order placement verified on staging** · cash capture, dues ledger and TCS
still pending · production untouched.

Change contract: `CHG-099` (approved 2026-11-20). Design: `docs/architecture/payments-cod.md`.

## 1. What was built

### Medusa COD provider

`services/backend/packages/api/src/modules/cod-payment` (`id: cod`, provider
`pp_cod_cod`):

- `initiatePayment` creates a COD session for the cart amount with no external call;
- `authorizePayment` returns `authorized` — Medusa records cash due, never paid;
- `capturePayment` is only for the later seller cash-collection step;
- `refundPayment` throws: a COD refund is the seller's credit note, not a Bazarbee refund.

Registered alongside Razorpay in provider mode. `configure:razorpay-payment` now enables
`pp_razorpay_razorpay` **and** `pp_cod_cod` on the India region.

### Experience API

`POST /v1/checkouts/cod/place`:

- same validated checkout fields as prepaid, server-computed totals;
- guest B2C allowed with a valid Indian mobile; B2B requires a signed-in trade account;
- creates the cart, delivery, offer, promo and COD payment session, then completes the order;
- per-order caps enforced server-side (₹20,000 B2C / ₹50,000 B2B, env-overridable);
- returns payment evidence with `payment_mode: "cod"`, `cod_status: "pending"`,
  `expected_minor`, `collected_minor: 0`.

### Web checkout

- Payment step offers **Razorpay prepaid** or **Cash on delivery**.
- COD confirmation reads `Order confirmed — pay on delivery`, `Payment: Cash on delivery · pay the
  seller`, and states that no online payment was taken.
- A submit guard prevents double-click duplicate placement. There is no server-side idempotency key
  yet.

## 2. B2B region defect found and fixed

B2B COD initially failed with:

```text
Country with code in is not within region BuildKart B2B
```

The `BuildKart B2B` region has **no countries** because a Medusa country belongs to one region; the
India region already owns `in`. The B2B region is a read-side pricing context, not a delivery region.
The standard cart flow already used the India region for both channels; the Razorpay/COD cart builders
did not.

Both `prepareCodCart` and `prepareRazorpayCart` now create canonical carts in the India delivery
region. B2B pricing still resolves correctly: the verified B2B COD order totals **₹18,576.50**, the
same trade-priced total as the earlier B2B order `BK-261119-N6H7VJ`.

This also fixes the previously untested B2B **prepaid** cart path.

## 3. End-to-end evidence

| Order | Channel | Total | Payment evidence |
|---|---|---|---|
| `BK-261120-JHNQH7` | B2C guest | ₹479 | `cod` / `pending` / expected 47900 / collected 0 |
| `BK-261120-3ZJ4FA` | B2B trade | ₹18,576.50 | `cod` / `pending` / expected 1857650 / collected 0 |
| `BK-261120-Z00KVF` | B2C guest | ₹479 | copy-verification run |

B2B order metadata:

```text
order_01M7WGWVM10MBJ1NK9YMJ6TGKQ
channel=b2b
business_account_id=business_shakti_hardware
```

Medusa state:

```text
payment_session pp_cod_cod  authorized  479.00 / 18576.50
payment rows with captured_at NOT NULL: 0
```

The COD session is authorized, the cash is not collected, and nothing is captured.

### Negative checks

```text
99 x ₹479 (over B2C cap)     400 cod-not-eligible
guest, no mobile             400 mobile-required
guest, B2B cart              403 sign-in-required
prepaid Razorpay start       201, rzp_test order created (regression check)
```

### Browser checks

- B2C: card/UPI step is replaced by the COD choice; success page shows cash due, zero page errors.
- B2B: signed in with a trade pilot account, trade catalogue price, COD success, zero page errors.
- Payment selector rendered and reviewed at 1280×900.

## 4. Releases

- Backend: `release-backend-20261120-124346`
- Experience API: `release-api-20261120-125239`, `release-api-20261120-130259` (region fix)
- Web: `release-web-20261120-125303`, `release-web-20261120-130531` (copy fix)

## 5. Still pending

- Cash capture at delivery in seller/admin (`cod_collection`, amount, collector, proof, short/refused,
  audit). Not built in this slice.
- Seller dues ledger, monthly statement, fee invoice and TCS — not built.
- Seller opt-in, pincode/category allowlists and per-buyer/per-seller daily caps — not built. Slice 1
  enforces auth/channel and per-order value caps only.
- Server-side idempotency for COD placement.
- B2B still requires a `b2b_*` role; the later "all signed-in users can access B2B" decision is a
  separate change.
- Flutter COD UI.

## 6. Verdict

COD ordering is correct at the order/payment boundary: a confirmed canonical order, an authorized
COD session, no capture, and clear cash-due copy. It is **not** a complete COD system until cash
collection, the seller receivable and TCS reporting exist.
