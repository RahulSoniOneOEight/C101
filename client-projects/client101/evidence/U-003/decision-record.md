# U-003 / B002 — decision record

- **Status:** staging implementation approved by the requester through brief B002; formal CHG number pending.
- **Environment:** staging only. Production is not authorised and remains human-gated.
- **Base:** `33c6add` (host-verified staging release, 2026-10-27T12:55Z).
- **Related evidence:** `client-projects/client101/evidence/U-003-promo-code-qc-2026-10-27.md` (control room), this folder.

## Decision

A marketplace-funded **5% discount applies to every new cart** (B2C and B2B) with no customer
action, and the customer may remove it or replace it with exactly one code offer. `ORDER10` is a
new code-based 10% order discount. `PLY5` is retired from new carts.

This is a commercial rule because it changes the price every customer pays. It is scoped to
staging until a production decision is recorded and authorised.

## Locked rules

| # | Rule | Why |
|---|---|---|
| D1 | Exactly one offer is active per cart. Applying a code removes the current offer first; a rejected code restores the previous offer. | Requested behaviour ("remove and apply different"); keeps the maximum discount at 10% and never produces a 15% cart. |
| D2 | Removing or replacing an offer is sticky for that cart: Flat5% must not return on re-fetch, quantity change, address/shipping update or checkout. A new cart auto-applies it again. | The U-003 QC proved the engine re-applies a true automatic promotion, so deletion was a no-op. |
| D3 | B2C **and** B2B carts receive Flat5%. Trade codes remain alternatives under D1. | Requested literally. |
| D4 | `ORDER5` stays active as a 5% alternative; `ORDER10` is a new code. | "Create ORDER10 as new code based promo"; D1 prevents stacking. |
| D5 | The promotion code is `FLAT5`; the customer-facing label is `Flat5%`. `%` is display-only. | Promotion codes are alphanumeric; `%` in a typed code is error-prone. |
| D6 | `PLY5` is set inactive, not deleted, and is no longer automatic. | Preserves redemption history and existing order adjustments. |
| D7 | Flat5% and ORDER10 belong to the new campaign **Pilot Flat Offers** (INR 500,000 spend budget, ends 2026-12-31). | Avoids exhausting the bounded offer lab mid-QC. |

## Funding and ownership

- Funding source: **marketplace** (same as every seeded staging promotion).
- No seller link is created; the discount is not charged back to a seller in staging.
- Campaign: `BK-STG-CAMP-PILOT-FLAT` — "Pilot Flat Offers".
- Promotions: `FLAT5` (5%, order-level, code-triggered), `ORDER10` (10%, order-level, code-triggered).

## Implementation choice

The engine cannot make a true automatic promotion removable, because it re-applies it on every
cart recalculation. The Experience API therefore applies `FLAT5` as a normal code on the first
line and records the applied code / opt-out in **cart metadata** (no schema change). The cart view
derives the `Flat5% · Auto` marker from that metadata, so removal is honest and the app can offer
a delete action.

## What this decision does *not* authorise

- No production release, production promotion, or production data write.
- No change to any other promotion (TOOLS10, FREESHIP, TRADE7, TRADEVIP, ORDER5, TOOLS200, PIPES5,
  QTY3, BOGO, campaign budgets or PLY5 redemption history).
- No change to carts, orders, price lists or products that are not created by the governed QC.
- The known `TOOLS200` ₹2 defect (candidate C-07) is out of scope.

## Approvals

| Item | State |
|---|---|
| Requester brief B002 (D1–D7) | Recorded 2026-10-27 |
| Decision record | This file |
| Formal CHG registration | Pending — requester to assign a number |
| Staging deploy | Not yet authorised; human gate required |
| Production | Forbidden |
