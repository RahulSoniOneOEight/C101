# C101 pilot access + B2C ERP slice — 20 Nov 2026

Status: **shipped to staging** · Web `release-web-20261120-054221` · API
`release-api-20261120-054806` · Source `97443c0`
Host: `https://gobazarbee.com` · Branch: `feat/bazarbee-branding`
Production: untouched.

## 1. Objective covered

1. Every allowlisted test user has both **Consumer D2C** and **B2B Trade** access.
2. A super-admin can change that access without rebuilding the API.
3. The C101 plan is used as the ERP boundary: Medusa owns the order, Tryton owns inventory,
   and accounting remains a test-clearing projection until the finance gates are signed.
4. A real B2C order was placed and the ERP chain was reconciled end to end.

## 2. Test-user access

### 2.1 Data model

`pilot_access_assignment` in `buildkart_experience` now stores per-user overrides:

- `roles` (JSON array)
- `business_account_id`
- `seller_id`
- `updated_by`, `updated_at`

The deployment's `PILOT_ROLE_ASSIGNMENTS_JSON` remains the safe baseline. Every authenticated
request reads the override first; if the override store is unavailable, the environment assignment
is used. A role change therefore applies on the tester's next request.

### 2.2 Admin surface

- Page: `https://gobazarbee.com/account/test-users` — super-admin only.
- API:
  - `GET /v1/admin/pilot-users`
  - `PATCH /v1/admin/pilot-users/{userId}`
  - `POST /v1/admin/pilot-users/grant-all`
- The page exposes Consumer / B2B Trade toggles, the business-account field, preserved seller and
  operator roles, a per-row Save, and **Grant both channels to all**.
- The page path is under `/account` because nginx routes `/admin/*` to the Mercur console.
- Every update is written to `pilot_privileged_audit` with the acting super-admin.

### 2.3 Current assignment

All 21 pilot users have `customer` and `b2b_buyer`.

- Consumer testers, sellers and operators use the shared staging account
  `business_bazarbee_pilot`.
- Existing B2B accounts are preserved:
  - `business_arjun_traders` for the three Arjun roles;
  - `business_shakti_hardware` for the Shakti buyer.
- A shared staging workspace `ws_bazarbee_pilot` was provisioned with:
  - Procurement, Approvals and Assistant channels;
  - 21 members;
  - super-admin as owner, the other testers as buyers.

### 2.4 Evidence

| Check | Result |
|---|---|
| `GET /api/admin/pilot-access` as super-admin | `200`, 21 users, 21 with both roles |
| `pilot_access_assignment` | `21` rows; `21` with both roles |
| UI summary | `21 of 21 testers have both channels` |
| Revoke rsoni001 B2B | `20 of 21`; checkbox false after reload |
| Restore rsoni001 B2B | `21 of 21`; checkbox true after reload |
| `/account` | Test-user access card only for `super_admin` |
| Non-admin `buyer.b2b01` | Page says “Test-user access is restricted”; API `404` |
| `/trade` as a dual-role tester | “Your trade desk, on the web.” |
| Trade chat workspace | `BazarBee Pilot Trade · trade workspace`; Assistant + Procurement |

## 3. Channel correctness correction

Before this slice, the Experience API defaulted any caller with a B2B role to a B2B cart. A
dual-role tester shopping in **Shop** therefore produced a B2B order.

Corrected:

- `CartItem` carries `channel`; trade tiles and the trade PDP mark lines `b2b`.
- Checkout derives one cart channel and sends it to both the quote and completion APIs.
- `GET /v1/carts` writes `business_account_id` only for a B2B cart; a B2C cart clears it.

## 4. B2C order + ERP reconciliation

### 4.1 B2C order

`BK-261120-381Y8D` (`order_01M7VR0MCFKAKHQRB3R6C0JSKN`, display 225):

- channel `b2c`; no `business_account_id`;
- total `₹3,889.50`;
- cart `cart_01M7VR0ERW4R5KWB8SVZM0TS5B`;
- order group `og_01M7VR0MD29Q3ZTX4FB0SPMS5E`;
- payment collection `pay_col_01M7VR0M22CQS0HMJZXSZN9YG5`, authorized `₹3,889.50`,
  captured `₹0`, status `authorized`.

The order is visible in `/orders` and its detail page.

### 4.2 Tryton reservation

Order completion now reserves every cart line in Tryton before the correlation is recorded:

- B2C `tryton_move_59`: SKU `BAUM-237S1-SET-HEX`, quantity `1`, state `assigned`,
  from location `1` to `7`.
- `domain_event`: `inventory.reservation_created` (move 59) and `order.confirmed`
  (`og_01M7VR0MD29Q3ZTX4FB0SPMS5E`).
- Reconciliation (`/v1/admin/orders/{cart}/reconciliation`):
  - reservation `committed`
  - movement `staging-posted`
  - accounting `test-clearing-projected`
  - `bank_receipt_claimed: false`
  - `reconciled: true`, `mismatch_codes: []`.

### 4.3 B2B regression

`BK-261120-8Z2PDS` (`order_01M7VR37ENVC7KR72PSAF6VDN1`, display 226):

- channel `b2b`; `business_bazarbee_pilot`;
- total `₹514.05`; cart `cart_01M7VR32FDG4Z9SHEW2V57N7K5`;
- Tryton `tryton_move_60`, state `assigned`;
- reconciliation `committed` / `staging-posted` / `reconciled: true`.

Control totals from the order group: subtotal `₹436.90`, automatic discount `₹21.85`,
shipping `₹99.00`, total `₹514.05`.

## 5. C101 plan boundary

This slice is **not** an accounting release. The plan's gates still apply:

| Plan item | Status |
|---|---|
| P-GATE-01 principal/agent | Open — finance/legal decision |
| P-GATE-02 invoice authority | Open |
| P-GATE-03 money contract | Partially addressed: API order amounts are integer minor units; Medusa's internal `current_order_total` can carry a sub-paise fraction (e.g. `514.055`) |
| P-GATE-04 recognition/settlement | Open |
| P-GATE-05 B2B credit | Open |
| P-GATE-06 per-user Tryton posting identity | Open — Tryton still uses one service account |
| P-GATE-07 `account_payment` / `account_statement` | Open — modules not installed |
| A1 event inbox / `buildkart_accounting` | Not implemented as a Tryton module; this slice adds order-completion stock moves, correlation and domain events in the API adapter |
| A2 invoice and clearing | Not implemented |
| A3 settlement/payout | Not implemented |
| A4 receivables/project dimensions | Not implemented |
| A5 close/statutory/production | Not implemented |

The ERP response remains explicit: `accounting_treatment: staging_test_clearing`,
`bank_receipt_claimed: false`, and no invoice/document is created.

## 6. Verification commands / evidence

- API and web typechecks pass.
- `bun run test:rbac` → `PASS: server-owned pilot role assignments validate and fail closed.`
- `bun run test:cart-totals` → `PASS`.
- Browser QC at 1440 px against `https://gobazarbee.com`.
- DB evidence:
  - `pilot_access_assignment` 21/21 both channels;
  - `correlation.tryton_moves` populated for orders 225 and 226;
  - Tryton `stock_move` 59 and 60 `assigned`;
  - `domain_event` reservation + order-confirmed rows.
- Screenshots:
  - `pilot-access-02-all-granted.png`
  - `pilot-access-07-one-revoked.png`
  - `pilot-access-08-restored.png`
  - `pilot-access-09-trade-chat.png`
  - `b2c-erp-03-success.png`
  - `b2b-erp-order.png`

## 7. Remaining work

1. Install `account_payment` on a restored copy and rehearse A2 invoice/clearing (P-GATE-07).
2. Scaffold `buildkart_accounting` and move the event intake/source links out of the API adapter
   (A1 lane C).
3. Obtain finance sign-off on P-GATE-01/02/04 before any real invoice or journal.
4. Replace the shared Tryton service account with a per-user short-lived session before financial
   posting (P-GATE-06).
5. Normalize the Medusa internal sub-paise order total at the source, or keep it quarantined as a
   known control-total difference.
6. Add a per-line reservation ledger for operator stock views; Tryton remains authoritative, but
   the platform ledger currently records only the legacy single-line reserve path.

## 8. Rollback

- Web: redeploy `release-web-20261119-185718` (before pilot access / cart channel).
- API: redeploy `release-api-20261120-054806` is the current image; the prior API image is
  `release-api-20261119-190940`.
- Data: the pilot access rows and shared workspace are additive; remove them only if the access
  model is reverted.
