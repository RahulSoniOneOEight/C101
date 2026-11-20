# COD per-order commission and dues statements — 2026-11-21

Status: **closed — code complete; staging deploy verification pending** · production untouched.
Change lane: **C — UI + API + schema** (`docs/implementation/change-delivery-sop.md`).

Closes the two open items from `BazarBee-session-note-2026-11-20.md` §6:

- *Per-order seller commission rules; settlement page shows Medusa seed statements.*

## 1. Commission rule

Resolution order, per COD order and seller:

```text
1. cod_order_commission.commission_bps   (admin override, reason + actor recorded)
2. cod_seller_policy.commission_bps      (existing seller policy, default 300 bps)
```

An override is set from the admin COD screen (Collections tab) and requires a reason. Setting or
clearing it on an order whose cash was already recorded reprices that order immediately, so the
ledger and the statement stay in step. The commission ledger note records both the rate and where it
came from, e.g. `450 bps (per-order override: negotiated)` or `300 bps (seller policy)`.

## 2. Ledger and statement

New tables in the Experience API COD store (idempotent `CREATE ... IF NOT EXISTS`):

- `cod_order_commission` — per-order override: order group + seller, bps, reason, actor, timestamps.
- `cod_order_due` — per-order statement snapshot: goods value, resolved rate and source, commission,
  GST on commission, TCS, COD fee, adjustments, amount due, TCS-default flag, invoice ref, status.

`postCodDues` now writes both the existing `seller_dues_ledger` rows and the per-order snapshot. The
snapshot keeps the period it was first posted in, so `POST /v1/admin/cod/recompute-dues` reprices
without moving historical dues into the current month.

New endpoints:

```text
GET    /v1/admin/cod/settlement-statements?period=YYYY-MM   seller + period statements, per-order lines
GET    /v1/admin/cod/settlement-statements?period=…&format=csv
POST   /v1/admin/cod/commission                             { order_group_id, seller_id, commission_bps, reason }
DELETE /v1/admin/cod/commission?order_group_id=…&seller_id=…
```

Statement columns follow `docs/architecture/payments-cod.md` §10.4 and are never net-only:

```text
order ref · invoice ref · goods value · GST in goods · commission · GST on commission
TCS · COD fee · adjustments · amount due · carry-forward
```

`invoice_ref` and GST-in-goods are left empty until the seller tax invoice is linked; they are not
estimated. Carry-forward is the sum of earlier-period snapshots still marked `open`.

## 3. Admin console

- **Settlement statements** (`/dashboard/settlement-statements`) now reads the COD dues ledger instead
  of the Mercur fixture statements. The fixture screen and its serializer are gone; the seeded
  `settlement_statement` rows are untouched but no longer displayed.
- The detail page lists one row per order with the rate source (`Per-order override` / `Seller policy`),
  commission, GST, TCS, COD fee, adjustments and amount due.
- **COD → Collections** gained a “Per-order commission override” panel: order group, seller id,
  commission %, required reason. It reports whether the order was repriced.

## 4. Verification

Run in this workspace:

```text
experience-api   bunx tsc --noEmit                    pass
admin + api      bunx tsc -b                          pass
admin            bunx vite build                      pass (33.9 s)
admin eslint     cod/page.tsx: react-hooks/set-state-in-effect
                 pre-existing (unchanged effect at the top of the page)
```

Not run here: there is no local Postgres/Docker stack in this workspace, so placement, capture,
override, statement totals and CSV still need runtime verification on staging.

Staging verification plan (after one Lane C deploy):

1. Apply the schema by starting the Experience API (idempotent, no manual migration).
2. `POST /v1/admin/cod/recompute-dues` once, to backfill `cod_order_due` from the existing collections.
3. Place a fresh COD order; check the statement shows the seller policy rate (3% default).
4. `POST /v1/admin/cod/commission` with 4.5% and a reason on that order; confirm the ledger commission
   changes and the statement line shows `Per-order override`.
5. `DELETE` the override; confirm the line returns to the policy rate.
6. Check the statement page and detail render with zero console errors; compare amounts with the CSV.

## 5. Residual limitations

- Override history is last-write only (`updated_at` + actor); there is no append-only rule history.
- `invoice_ref` and GST-in-goods stay blank until seller invoices are linked to COD orders.
- Carry-forward treats every `open` snapshot as unpaid; the settlement/payment flow that closes dues
  is still pending.
- The settlement page has no CSV button; CSV is available from the Experience API and the COD screen.
- Production remains unauthorized: no live Razorpay, no production identity/infra, no money movement.
