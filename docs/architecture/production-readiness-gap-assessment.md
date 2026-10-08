# BuildKart Production Readiness Gap Assessment

**Date:** 08 October 2026
**Scope:** C101 repository at `main` (post PR #9)
**Status:** Advisory, read-only assessment. No production authorization is implied or granted.
**Related:** `docs/architecture/production-release-gates.md`, `docs/architecture/backend-production-gap-register.md`, `client-projects/client101/changes/CHG-020.yaml`

## 1. Conclusion

The repository is a deliberately **bounded staging/pilot scaffold**, not a production system. Every
production gate (G1–G8 and the cross-cutting gates) is currently **FAIL**, and every external
provider — payment, OTP/SMS, logistics and notifications — is simulated or stubbed. The repository
itself records this consistently:

- `services/README.md` — "Only payment is simulated … production must fail closed".
- `services/hosted/README.md` — "does not authorize production release".
- `client-projects/client101/changes/CHG-017..019` — `production_release_authorized: false`.
- `tooling/validate_chg017/018/019_approvals.py` — assert `production_release_authorized is False`.

Production readiness is therefore **not a configuration flag**. It is the majority of the remaining
engineering, security, operations and commercial backlog, and it requires a governed, human-approved
transition (CHG-020).

## 2. Method

Read-only inspection of repository source, contracts, change contracts, evidence registers, CI
workflows and deployment scripts. Each gate is rated against the pass criteria and required evidence
in `docs/architecture/production-release-gates.md`.

Ratings: **Missing** (no implementation) · **Fixture/Simulated** (works only with test substitutes) ·
**Staging-only** (real-shaped but not production-approved) · **Ready** (production evidence accepted).

## 3. Gate summary

| Gate | Status | Blocking reality |
|---|---|---|
| G1 Identity, OTP, sessions, consent | Missing / Simulated | Shared test OTP `123456`; no real IdP, no consent/registration/recovery |
| G2 Multi-seller cart identity and allocation | Fixture | No immutable offer snapshot; `revalidate`/`validate` paths unimplemented |
| G3 Canonical order creation | Simulated | Order success depends on the simulated PSP; no provider webhook/COD |
| G4 Inventory and reservation | Staging-only | ATP is the Experience API's own ledger, not a Tryton-authoritative projection |
| G5 Logistics and shipment events | Simulated | No carrier; no rate/booking/signed webhooks/SLA |
| G6 Return/refund | Missing | No return domain, state machine, reverse logistics or refund reconciliation |
| G7 Seller operational surfaces | Missing | Stock Mercur vendor shell; no KYC/onboarding/settlement |
| G8 Marketplace administration | Missing | Stock Mercur admin shell + minimal static `/ops` page |
| Contract compatibility | Partial | Draft Data Contract; several OpenAPI paths unimplemented; no live consumer-contract run |
| Security / privacy | Missing | No SAST/SCA/secret-scan, threat model, pentest, ASVS or privacy artifacts |
| Reliability | Staging-only | Load tested locally only; no SLOs, soak, outage or failover tests |
| Observability | Partial | `/health` + `/metrics` only; no traces/central logs/alerts/dashboards |
| Data integrity | Partial | Reconciliation covers checkout↔allocation↔reservation only; not scheduled |
| Backup / recovery | Partial | Scripts exist; RPO/RTO still `targets-pending`; no hosted drill evidence |
| Accessibility | Missing | No WCAG 2.2 AA tests or audit anywhere |
| UAT | Missing | `human_approvals: []`; no named approvers |
| Governance | Partial | CHG-017..019 approved for **staging**; Q-005A open; Data Contract draft |
| Rollback | Missing | No rollback/forward-fix strategy or test |

## 4. Provider gaps (the hard dependencies)

| Provider | Candidate | Repo state | Consequence |
|---|---|---|---|
| Payment (PSP) | Razorpay (candidate, deferred) | Only `simulated-payment` module + in-memory simulator | Cannot accept real money |
| OTP / SMS | Unselected | Shared Redis test code | Cannot authenticate real users |
| Logistics | Shiprocket (candidate) / Delhivery (fallback) | In-memory simulator, all postcodes "serviceable" | Cannot fulfil or track |
| Notifications | Staging FCM only | Staging-only gateway, external delivery disabled | Cannot notify production users |
| Hosting / DNS / perimeter | Hostinger + Cloudflare (decided) | Compose/Tunnel artifacts prepared, not deployed | No production environment |

## 5. Shortest credible path to each gate

1. **G1** — select OTP/SMS + identity approach (provider decision record), implement registration/
   consent/refresh/recovery, OTP abuse controls, then ASVS + pentest. *(Large; security-gated.)*
2. **G2** — immutable offer snapshot, implement `POST /v1/carts/{cartId}/revalidate` and
   `/v1/checkouts/{cartId}/validate`, price/stock race + alternate-seller tests.
3. **G3** — implement the provider payment adapter behind the existing `PaymentAdapter` seam, signed
   webhook verification, replay/duplicate tests, COD branch, commercial totals reconciliation.
4. **G4** — make Tryton the authoritative ATP projection with source timestamp/version and stale
   handling; projection-lag alerting; inventory reconciliation.
5. **G5** — implement the carrier adapter (rates, booking, signed event ingestion with dedupe),
   delivery-promise validation before order, SLA monitoring, exception drill.
6. **G6** — build the return/refund domain (eligibility, case, evidence, inspection, decision,
   reverse logistics, duplicate-refund guard, accounting reconciliation).
7. **G7** — replace the stock vendor shell with the seller journeys (KYC/onboarding, catalogue,
   orders, fulfilment, returns, settlement) plus tenant-isolation and accessibility evidence.
8. **G8** — replace the stock admin shell with operator order handling, DLQ/reconciliation workbench,
   audited overrides and an end-to-end audit timeline.

**Cross-cutting:** SAST/SCA/secret-scan in CI; threat model + pentest; SLOs, load/soak, dependency
outage and failover; OpenTelemetry traces + central logs + actionable alerts + owned runbooks;
scheduled reconciliation runs; production RPO/RTO with a restore drill; WCAG 2.2 AA audit; named UAT
approvers; and a tested rollback/forward-fix strategy.

## 6. Recommended sequencing

1. **Finish the staging pilot** (nearest milestone): deploy behind Cloudflare Tunnel, signed APK,
   wave rollout to the 20 allowlisted testers, hosted acceptance + restore proof.
2. **Close the governance prerequisites**: Q-005A, draft → approved Data Contract, provider selection
   records (payment/OTP/logistics).
3. **Implement provider adapters** (G1, G3, G5) behind the existing seams, plus G2/G4 corrections.
4. **Build operational surfaces** (G7/G8) and the return/refund domain (G6).
5. **Assurance block**: security scans/pentest, reliability/observability, backup/DR drill,
   accessibility, rollback.
6. **UAT + production transition decision** recorded in `CHG-020`.

## 7. Explicit non-claims

- This assessment does not authorize production, production data, production providers or release.
- It does not replace `production-release-gates.md`; the gate document remains authoritative.
- No RPO/RTO, SLO or security target here is approved; all numeric targets require human approval.
