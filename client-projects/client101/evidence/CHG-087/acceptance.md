# CHG-087 — Return inspection and simulated refund closure

**Change contract:** `client-projects/client101/changes/CHG-087.yaml` (Revision 1)
**Date:** 2026-10-28
**Lane / release mechanism:** D / `migration + event + api+ui + image-rebuild` (implementation only; no image or deployment performed)
**Environment:** disposable local PostgreSQL, Redis and NATS; isolated Experience API; local customer web production build; local fixture harness for the Admin/Seller route components
**Result:** **PASS — local only.** Staging deployment is not authorized and was not performed. Production was not touched.

---

## 1. Scope and authority

Implemented locally:

- Versioned return inspection with per-line evidence, mandatory notes and optimistic concurrency.
- Admin-only simulated refund projection with explicit amount/breakdown, `SIM-` reference, replay protection and constant `money_effect: none` / `stock_effect: none`.
- Seller-scoped reverse-logistics and inspection controls; decisions and refund projections remain Admin-only.
- Customer web OTP session, owner-scoped orders/tracking/returns/refund-simulation pages.
- Flutter return status copy and parsing for `refundSimulation`.
- Two canonical event subjects and owner notifications.

Deliberately not performed:

- No staging deployment, image release, shared staging data write or production change.
- No Medusa payment/refund mutation, Tryton stock/movement post, PSP call, carrier call, invoice, settlement or accounting write.
- No real refund, credit note, inventory disposition or Shiprocket integration.
- Policy Pack v1 remains planning-only pending legal/tax review.

---

## 2. Requirement ledger

| ID | Requirement | Result | Evidence |
|---|---|---|---|
| **R1** | Medusa/payment owns real refunds; Tryton owns stock; return projections mutate neither | **PASS (local)** | Return store has no Medusa/Tryton client; zero-effect fingerprints unchanged in `zero-effect-evidence.json`; Medusa `refund` count 0 before/after |
| **R2** | Complete versioned per-line inspection after receipt with immutable audit events | **PASS (local)** | `manual-transition-db-test` and `manual-transition-http-test`: stale version 409, incomplete/duplicate lines rejected, over-quantity rejected, exact-line inspection accepted, notes mandatory |
| **R3** | Cross-seller reads/writes denied without mutation; Seller cannot decide/cancel/refund | **PASS (local)** | Cross-seller read/inspection 404; Seller approve/reject/refund 403; Seller-scoped service identity rejected on operator routes; no event/count change on denial |
| **R4** | One idempotent Admin simulated refund after inspection, explicit math, no real money | **PASS (local)** | Mismatched math 400; stale version 409; Seller role 403; replay 200 `duplicate=true` with same `SIM-` reference; second simulation 409; zero-effect markers |
| **R5** | Customer visibility only for the owner, with no-real-money wording | **PASS (local)** | Owner OTP session; `/v1/me/orders`, `/v1/orders/:id`, `/v1/returns/:id`; other customer 404; anonymous redirect to sign-in; web screenshots at 390/1440; Flutter return-status layout tests at 390×844 and 1440×900 |
| **R6** | Admin decision/refund controls; Seller inspection-only controls; responsive and keyboard usable | **PASS (local)** | Real route components rendered at 390×844 and 1440×900; 82/82 checks; zero page overflow; zero console errors; keyboard tab audit; visual defects fixed and retested |
| **R7** | Both events publish with retry/dedupe and exactly one owner notification each | **PASS (local)** | `return-closure-events-test`: `return.inspection-completed.v1` and `return.refund-simulation-recorded.v1`; 2 forced retries, 2 duplicate publications, 2 owner notifications; forbidden `return.refund-paid` subject absent |
| **R8** | Isolated HTTP/browser acceptance plus fixture and container cleanup | **PASS (local)** | 82/82 browser checks; three acceptance scripts pass; retained fixture removed with `chg087_pg`; `chg087_pg`, `chg087_redis`, `chg087_nats` removed |

---

## 3. Verification results

| Check | Result |
|---|---|
| Contract validation (5 YAML files, 27 AsyncAPI channels, 127 refs, unique keys) | **PASS** |
| Experience API TypeScript typecheck | **PASS** |
| Admin production build | **PASS** (known simulated-payment config warning, build completes) |
| Seller production build | **PASS** (known simulated-payment config warning, build completes) |
| Customer web typecheck | **PASS** |
| Customer web production build | **PASS** |
| Flutter analyze | **PASS — no issues** |
| Flutter tests | **PASS — 286/286**, including the new return-status layout tests at 390×844 and 1440×900 |
| `manual-transition-db-test` | **PASS** |
| `manual-transition-http-test` | **PASS** |
| `return-closure-events-test` | **PASS** — 2 subjects, 2 retries, 2 duplicates, 2 owner notifications |
| Browser QC | **PASS — 82/82**, 28 screenshots, 0 console errors, 0 unexpected failed requests |

Browser QC ran at **390×844** and **1440×900**:

- Customer web: sign-in, simulated OTP, orders list, order detail, return detail, sign-out, unauthenticated redirect, other-owner 404.
- Admin: approved, received (inspection form), inspection complete (refund form), closed (simulated refund summary).
- Seller: approved, received (inspection form), inspection complete, closed (refund projection redacted).

Page-level horizontal overflow was absent at both widths after fixes. Tables scroll inside their cards on narrow screens.

---

## 4. Visual QC findings fixed during acceptance

1. **Long return ID overflowed a 390 px viewport.** Fixed with `break-all` on the Admin and Seller heading.
2. **Tables could force page-level horizontal scroll.** Wrapped the Admin/Seller data tables in `overflow-x-auto`.
3. **Admin audit JSON expanded the table far beyond the card.** Replaced the raw JSON cell with a collapsible `View detail` disclosure and a width-constrained, wrapped `<pre>`.
4. **Signed-in web header still offered “Sign in”; “Sign out” wrapped on mobile.** Removed the redundant Sign in nav item and set the text button to `white-space: nowrap`.

All fixes were retested; the final browser run is the 82/82 evidence above.

---

## 5. Immutable-effect evidence

Captured around a real Admin replay plus owner and Seller reads on the isolated API:

| System | Before | After | Unchanged |
|---|---|---|---|
| Medusa `payment` | 1 row, fingerprint `1b75b3cd22…` | same | **Yes** |
| Medusa `refund` | 0 rows | 0 rows | **Yes** |
| Medusa `order_transaction` | 0 rows | 0 rows | **Yes** |
| Medusa `payment_collection` / `payment_session` | 1 / 1 row | 1 / 1 row | **Yes** |
| Tryton `stock_move` | 80 rows, fingerprint `188ed54a16…` | same | **Yes** |
| Tryton shipment tables (`in`, `out`, returns, internal) | 0 rows each | 0 rows each | **Yes** |
| Isolated return | `closed:5`, 1 simulation, 5 events | same after replay | **Yes** |
| Seller view of refund projection | `null` | `null` | **Yes** |

Full data: `zero-effect-evidence.json`.

The replay returned `duplicate: true`, kept the original `SIM-REFUND-1572BC00` reference, and did not add an event or simulation row.

---

## 6. Fixture used for visual review

| Field | Value |
|---|---|
| Fixture | `chg087_qc_01` |
| Order | `checkout_chg087_qc_01` |
| Order reference | `BK-261028-QC087` |
| Return | `ret_38b875490a284f808956cbaca24e3b98` |
| Seller | `seller_qc_01` |
| Owner | `pilot_01` |
| Final status / version | `closed` / `5` |
| Refund projection | `SIM-REFUND-1572BC00`, ₹3,047.00, `simulated_completed` |
| Money / stock effect | `none` / `none` |

State snapshots for all four stages: `fixtures/lifecycle-snapshots.json`; summary: `fixtures/fixture-summary.json`.

The fixture was intentionally retained through visual review, then removed with the disposable PostgreSQL container after acceptance.

---

## 7. Browser evidence

- Machine-readable report: `browser-qc.json`
- Screenshots (28): `screenshots/web/{mobile,desktop}/…`, `screenshots/admin/{mobile,desktop}/…`, `screenshots/seller/{mobile,desktop}/…`
- Customer-web automation script: `tools/browser-qc.cjs` (the Admin/Seller portion of that run depended on the temporary fixture harness described above).

The customer web ran against the **real isolated Experience API**. The Admin/Seller review rendered the **real route components** against exact API snapshots captured at each lifecycle stage; the temporary fixture harness and its client stub were removed after QC and were not included in either shipped dashboard.

Flutter layout evidence: `apps/prototype_app/test/return_status_layout_test.dart` (3 tests) renders the real return-status screen at 390×844 and 1440×900, asserts the simulated-refund amount/reference and no-real-money wording, and checks the post-inspection pending boundary. No overflow exception is raised at either width.

The scripts under `tools/` are historical evidence-capture utilities. They require the disposable CHG-087 stack and local preview ports; they are not production code and are not part of either shipped dashboard.

---

## 8. Cleanup evidence

Removed after all captures:

- `chg087_pg` (isolated PostgreSQL, host port 55487)
- `chg087_redis` (isolated Redis, host port 56387)
- `chg087_nats` (isolated NATS JetStream, host port 63639)
- Isolated API process on `127.0.0.1:59020`
- Local customer web servers (3000/3001) and temporary Admin/Seller preview servers (7061/7062)
- Temporary Admin/Seller fixture harness directories
- The retained CHG-087 fixture, which lived only in the disposable database

Post-cleanup checks:

- No `chg087_*` containers exist.
- No listeners remain on 3000, 3001, 55487, 56387, 59020, 63639, 7061 or 7062.
- Existing BuildKart, Penpot, PinCommerce and Akos containers were not modified.

The unrelated `services/backend/apps/admin/fulfillment-preview*` harness was preserved and not overwritten.

---

## 9. Deferred register

| ID | Item | Status |
|---|---|---|
| **D1** | Real refund execution | Deferred — requires PSP/Medusa payment integration, Finance/Tax approval and production governance |
| **D2** | Real inventory disposition | Deferred — Tryton remains authoritative; no stock/movement post authorized |
| **D3** | Shiprocket integration | Deferred by requester |
| **D4** | NDR and auto-RTO | Deferred — requires a separate delivery-exception contract |
| **D5** | Exchange, store credit, B2B contract overrides | Deferred — policy and accounting behavior incomplete |

Policy/legal gates remain open: return-policy-2026-11-01 is planning-only; restocking fee, refundable tax/shipping, COD bank-transfer behavior and customer-facing production wording require legal/tax approval.

---

## 10. Residual risks and honest limitations

1. **Admin/Seller browser coverage used captured isolated API snapshots**, not a live Medusa-backed dashboard shell. The real route components and their controls were rendered; proxy/auth behavior is covered by the HTTP acceptance tests and production builds, not by a live operator session.
2. **Customer web was end-to-end**, but only the post-purchase journey was exercised. The catalogue home page depends on catalogue/Medusa data unavailable in the isolated stack and is outside CHG-087.
3. **The customer return read is owner-scoped but returns more internal fields than the UI renders** (for example policy snapshot, idempotency key and actor IDs). This is not an ownership bypass, but a narrower customer projection would be preferable before production.
4. **No staging or production behavior was observed.** Staging deployment remains separately gated and is not authorized by this evidence.

---

## 11. Rollback

- **Local:** containers and fixture are already removed; no rollback action remains.
- **Code:** revert only the CHG-087 paths in the change contract; preserve CHG-035 history.
- **Staging:** not applicable — not deployed.
- **Production:** not applicable — not released and not authorized.

---

## 12. Staging release plan

A scoped staging release plan has been prepared but **not executed**:

- `client-projects/client101/evidence/CHG-087/staging-release-plan.md`
- `client-projects/client101/evidence/CHG-087/staging-release-manifest.yaml`

The plan targets a scoped `release/chg-087` commit based on the verified staging baseline (last recorded `ecb01e1`), rebuilds the Medusa, Experience API and customer web images, rehearses the additive Experience API schema, deploys with a health/proxy gate, runs a synthetic Experience-only staging fixture, and records rollback. Staging deployment remains unauthorized; the plan's open decisions must be answered and explicitly approved before execution.
