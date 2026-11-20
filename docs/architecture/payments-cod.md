# COD with seller-collected cash

Status: **operating model confirmed** · build not started · production untouched.

Decision (2026-11-20): the **seller collects cash on delivery**. Bazarbee never receives the COD
goods money. COD is offered on both B2C and B2B.

This is a design document, not tax advice. The GST/TCS treatment needs CA sign-off before build.

## 1. What the decision changes

| | Prepaid | COD (seller collects) |
|---|---|---|
| Who holds goods money | Bazarbee, then pays seller | Seller, from the buyer |
| Order state after placement | paid + confirmed | **confirmed, not paid** |
| Goods tax invoice | Seller, after payment | Seller, on delivery |
| Payment receipt for goods | Bazarbee (agent for collection) | **Seller's cash receipt — Bazarbee issues none** |
| Bazarbee's cash movement | receives, deducts fees, pays out | **receives nothing; seller owes fees + TCS** |
| MDR / card chargeback | applies | does not apply |
| Settlement direction | payable **to** seller | receivable **from** seller |

The artefact set therefore differs by rail:

```text
Prepaid: seller tax invoice · Bazarbee payment receipt · Bazarbee fee invoice · settlement
COD:     seller tax invoice + cash receipt · Bazarbee fee invoice · seller dues statement
```

Bazarbee must **not** issue a payment receipt for COD goods, because it did not collect that money.
That was inherited from the prepaid model and would misstate who holds the cash.

## 2. COD ledger

```text
Seller keeps:            goods value collected (GST-inclusive)

Seller owes Bazarbee:    commission (ex-GST)
                       + GST on commission
                       + TCS
                       + COD fee, if configured
                       − agreed adjustments

Bazarbee pays seller:    nothing for goods
```

TCS is **not** part of Bazarbee's turnover and never appears on the fee invoice. It is a separate
line on the seller statement and in GSTR-8.

Delivery fee:

- if the seller collects it from the buyer, it is the seller's supply and stays out of Bazarbee's books;
- if Bazarbee sets the delivery price, the collected amount becomes part of the seller's dues.

This needs one decision (see §8).

## 3. Order and cash state

Do not reuse `paid` for COD.

```text
payment_method: prepaid | cod
payment_status: paid | cod_pending | cod_collected | cod_short | cod_refused
fulfilment:     separate (existing shipment statuses)
```

Rules:

- placing a COD order creates a **canonical confirmed order** with `payment_status=cod_pending`;
- `delivered` alone never means cash was collected — delivery and collection are recorded together by
  the seller, or corrected by an admin;
- collection captures amount, collector, timestamp, proof reference and any shortfall;
- admin corrections require a reason and write an audit row;
- a refused delivery moves to `cod_refused` and must produce a seller credit note, not a refund
  from Bazarbee.

## 4. Eligibility and controls

COD is not "prepaid without Razorpay". It needs limits because Bazarbee carries fee/TCS credit risk
even though it never carries the goods money.

Proposed launch defaults (all configurable, all needing sign-off):

```text
seller COD opt-in                    default off, per seller
B2C per-order cap                    ₹20,000
B2B per-order cap                    ₹50,000
B2B first order above ₹10,000        prepaid only
per-buyer daily cap                  ₹50,000
per-seller daily cap                 ₹2,00,000
pincode / category allowlist         required
delivery OTP                         B2B mandatory, B2C optional
proof of collection                  required (photo / signed receipt ref)
```

COD eligibility is computed server-side. The client never decides eligibility or price.

## 5. Recovering commission and TCS

This is the hard part of seller-collected COD: there is no payout to deduct from.

Proposed waterfall:

1. offset against the seller's next prepaid settlement;
2. otherwise a **monthly seller dues statement** (not a tax invoice) collected by UPI/NEFT;
3. dues older than 14 days → COD disabled for that seller;
4. dues older than 30 days → new listings blocked and account reviewed.

For a seller who is COD-only, step 1 never happens, so step 2 is the normal path. The dues statement
must show commission, GST on commission, TCS, COD fees and adjustments separately — never one net
figure.

Confirmed on 2026-11-20: the **dues statement is not a taxable document**. It is a demand/statement
of amounts payable, carries no GST on its own, and must not be numbered or formatted as a tax
invoice. Bazarbee's taxable supply remains the platform fee, invoiced separately with GST. TCS stays
off the fee invoice and appears only on the dues statement and in GSTR-8.

## 6. Refusals, returns and TCS corrections

- Refused before handover: cancel the order; no supply, no TCS.
- Refused after dispatch / RTO: seller credit note for the goods; TCS adjusted in the GSTR-8 period of
  the credit note, not silently in the next statement.
- Short collection: record the difference against the order; seller bears it unless admin approves a
  waiver with reason.
- Delivery fee forfeiture follows the policy decision in §8 and needs legal review.

## 7. Build slices

| Slice | Lane | Content |
|---|---|---|
| 1 | C | COD order placement on web, B2C and B2B: eligibility, `payment_method=cod`, `cod_pending`, no gateway call, confirmed order |
| 2 | C | Cash capture at delivery in seller portal and admin: amount, collector, proof, short/refused, audit |
| 3 | C/D | Seller dues ledger, monthly statement, TCS lines, fee invoice series, GSTR-8 export |
| 4 | B | Buyer-facing COD labels, eligibility messaging, delivery OTP; Flutter parity |
| 5 | E | Production configuration, caps, finance acceptance |

Slices 1–3 change money behaviour and schema, so they run under a governed change contract, not the
fast lane.

Touched surfaces:

- Medusa: COD payment provider (authorise-only, never capture) + region enablement;
- Experience API: eligibility endpoint, COD checkout completion, cash-collection endpoints, dues ledger;
- schema: COD collection/evidence table keyed to order group + shipment, dues ledger, audit;
- seller portal and admin: collection capture and correction;
- web checkout: COD option and confirmation copy;
- Flutter: later slice.

## 8. Decisions still open

1. **Recovery mechanism** — waterfall accepted; dues statement confirmed non-taxable (2026-11-20).
   Remaining: confirm the 14/30-day suspension thresholds.
2. **Delivery fee ownership** — seller-collected or Bazarbee-charged?
3. **COD fee** — proposed ₹0 at launch, configurable per seller.
4. **Caps** — accept the §4 defaults, or set different B2C/B2B limits?
5. **Delivery OTP** — mandatory for B2B, optional for B2C?
6. **Refusal/forfeiture policy** — needs legal sign-off.
7. **Exempt goods** — which categories, and who approves the mapping?

None of these block the design; all of them block slice 1 acceptance criteria.

## 9. Acceptance criteria for slice 1

- A COD order creates a canonical order with `payment_method=cod` and no captured payment.
- The order is visible to the buyer, seller and admin as **confirmed, cash due** — never "paid".
- COD is rejected server-side when the seller, pincode, category or cap does not allow it.
- Amounts and eligibility are server-computed; the client cannot set price or eligibility.
- Prepaid flow is unchanged; Razorpay is never called for a COD order.
- Zero production change.

## 10. Technical contract (for CHG-099 implementation)

### 10.1 Medusa provider

New provider `cod` under `src/modules/cod-payment`, id `pp_cod_cod`:

- `initiatePayment` creates a session for the cart amount with no external call.
- `authorizePayment` authorises the session at order placement — Medusa records
  `authorized`, never `captured`, so the order is not paid.
- `capturePayment` is called only when the seller records cash collection; the captured amount is
  the amount actually collected (partial collection captures partially).
- `refundPayment` is **not** supported: goods refunds on COD are the seller's credit note, not a
  Bazarbee refund. The provider must throw an explicit error rather than fake one.

Register in the payment module only when `PAYMENT_ADAPTER_MODE=provider`, and enable
`pp_cod_cod` on the India region in addition to `pp_razorpay_razorpay`. COD must not require
Razorpay keys, but the region enablement script should be able to run both.

### 10.2 Schema (Experience API)

```sql
CREATE TABLE IF NOT EXISTS cod_collection (
  id                text PRIMARY KEY,
  order_group_id    text NOT NULL UNIQUE,
  checkout_ref      text,
  seller_id         text NOT NULL,
  shipment_id       text,
  status            text NOT NULL CHECK (status IN ('pending','collected','short','refused')),
  expected_minor    bigint NOT NULL,
  collected_minor   bigint NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'INR',
  collector_kind    text CHECK (collector_kind IN ('seller','admin','delivery_agent')),
  collector_user_id text,
  collected_at      timestamptz,
  proof_ref         text,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cod_collection_event (
  id             text PRIMARY KEY,
  collection_id  text NOT NULL REFERENCES cod_collection(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  actor_user_id  text NOT NULL,
  actor_roles    jsonb NOT NULL,
  payload        jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_dues_ledger (
  id            text PRIMARY KEY,
  seller_id     text NOT NULL,
  period        text NOT NULL,              -- YYYY-MM
  kind          text NOT NULL CHECK (kind IN
                  ('commission','gst_on_commission','tcs','cod_fee','adjustment','payment','waiver')),
  amount_minor  bigint NOT NULL,            -- signed: positive = seller owes
  currency      text NOT NULL DEFAULT 'INR',
  source_ref    text,                       -- order group / statement id
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled','waived')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, period, kind, source_ref)
);

CREATE INDEX IF NOT EXISTS seller_dues_open_idx ON seller_dues_ledger (seller_id, status);
```

Idempotent `CREATE ... IF NOT EXISTS` under the existing advisory-lock pattern; no destructive
migration.

### 10.3 Endpoints

```text
GET  /v1/checkouts/cod/eligibility?cart_id=…     server-computed eligibility + reason
POST /v1/checkouts/cod/place                     create/complete cart as COD, return order group
POST /v1/seller/orders/:group/cod-collection     record collected/short/refused + proof
POST /v1/admin/orders/:group/cod-collection      admin correction, reason required
GET  /v1/seller/dues?period=YYYY-MM              statement lines + totals
```

Rules:

- `place` re-checks eligibility and totals server-side; a stale or tampered client value is rejected.
- `place` is idempotent on a client request key, like the prepaid guest flow.
- collection transitions: `pending → collected | short | refused`; `short → collected` only when the
  balance is recorded; `refused` is terminal.
- every transition writes `cod_collection_event`; admin corrections always do.
- the seller portal and admin read the same collection record; no local copies.

### 10.4 Settlement statement output

One row per seller per period, columns in this order:

```text
order ref · invoice ref · goods value · GST in goods · commission · GST on commission
TCS · COD fee · adjustments · amount due / (payable) · carry-forward
```

No net-only figure. TCS lines carry the GSTR-8 period; fee invoice and credit-note numbers are
referenced, not recomputed.

### 10.5 Test matrix

| Case | Expected |
|---|---|
| COD order B2C under cap | confirmed, `payment_status=cod_pending`, no Razorpay call |
| COD order B2B under cap | same, with business account context |
| over cap / blocked pincode / seller not opted in | rejected server-side, no order |
| seller records exact collection | `cod_collected`, capture equals collected, dues ledger written |
| seller records short collection | `cod_short`, shortfall visible, no auto-waiver |
| refused delivery | `cod_refused`, credit note required, no Bazarbee refund |
| admin correction without reason | rejected |
| prepaid Razorpay order | unchanged, no COD rows |

