# BuildKart Production Release Gates

**Rule:** A passing visual test, prototype journey or successful navigation is not production
evidence. All gates are fail-closed until the named approvers accept linked evidence.

## 1. Gate status summary

| Gate | Current status | Release effect |
|---|---|---|
| G1 Identity, OTP, sessions and consent | **FAIL — fixture/navigation only** | Blocks every production channel |
| G2 Multi-seller cart identity and allocation | **FAIL — variant-only cart/fixture offers** | Blocks marketplace ordering |
| G3 Canonical order creation | **FAIL — success without order API** | Blocks checkout launch |
| G4 Inventory and reservation | **FAIL — fixture stock/Tryton planned** | Blocks purchasability promises |
| G5 Logistics and shipment events | **FAIL — fixture tracking/provider unselected** | Blocks delivery promise/fulfilment |
| G6 Return/refund | **FAIL — in-memory status change only** | Blocks production launch |
| G7 Seller operational surfaces | **FAIL — no seller application** | Blocks marketplace launch |
| G8 Marketplace administration | **FAIL — no admin/ops application** | Blocks marketplace launch |

## 2. Mandatory gate template

Each gate record must link:

- approved owner, policy and API/event schema versions;
- environment and exact release candidate;
- automated test run and negative/failure scenarios;
- security/RBAC/tenant-isolation evidence;
- provider sandbox or production-readiness evidence where applicable;
- observability dashboard, alerts and runbook;
- reconciliation/rollback/recovery proof;
- UAT result and named approver/date.

## 3. G1 — Identity, OTP, sessions and consent

**Pass criteria**

- Real sign-in/OTP/registration/recovery and secure refresh/revocation.
- Backend-derived B2C/B2B/seller/operator context and least-privilege roles.
- OTP expiry, resend, attempt, enumeration and abuse controls.
- Versioned terms/privacy/marketing consent and auditable withdrawal where applicable.
- Tenant isolation and support/admin impersonation policy if enabled.

**Required evidence:** OWASP ASVS mapping, penetration test, rate-limit test, session theft/revocation
test, RBAC/tenant matrix and Legal/Security approval.

## 4. G2 — Multi-seller cart identity and allocation

**Pass criteria**

- Cart line persists variant, seller, offer and fulfilment context plus immutable offer snapshot.
- Different seller/offer lines never silently merge or substitute.
- Price, MOQ, stock, eligibility and serviceability revalidate on mutation and checkout.
- Changed/invalid offer blocks checkout with explicit buyer choices.
- Order-line snapshots map exactly to one or more versioned marketplace allocations.

**Required evidence:** Consumer contract, idempotency/concurrency, alternate-seller persistence,
price/stock race and allocation reconciliation tests; Product/Marketplace approval.

## 5. G3 — Canonical order creation

**Pass criteria**

- One idempotent checkout completion returns a persisted canonical order ID.
- Success UI cannot render without accepted canonical result.
- Payment success/failure/pending/timeout/webhook replay and COD branches are recoverable.
- Immutable totals, tax, seller, offer, address and payment snapshots exist.
- Duplicate taps, network retry and provider replay cannot create duplicate order/payment effects.

**Required evidence:** Sandbox payment suite, double-submit test, webhook signature/replay tests,
commercial totals reconciliation, end-to-end trace and Finance/Security approval.

## 6. G4 — Inventory and reservation

**Pass criteria**

- Tryton-authoritative ATP projection has source timestamp/version and stale behavior.
- Approved reservation point, TTL and payment-method release policy are implemented.
- Concurrent checkout cannot oversell the same constrained stock.
- Expired/failed payments release reservations and all mismatches surface operationally.

**Required evidence:** Load/concurrency and expiry tests, outage/recovery, projection-lag alert,
inventory reconciliation and Operations approval.

## 7. G5 — Logistics and shipment events

**Pass criteria**

- Serviceability, rate, delivery promise and split-shipment charges are validated before order.
- Seller allocations create traceable shipment legs and provider references.
- Signed/authenticated carrier events are deduplicated and ordered safely.
- Customer, seller and operator status reflects canonical/projection freshness and exceptions.

**Required evidence:** Provider sandbox certification, postcode/rate test pack, webhook replay/order
tests, exception/recovery drill, SLA monitoring and Logistics approval.

## 8. G6 — Return/refund

**Pass criteria**

- Backend provides item/quantity eligibility and allowed actions.
- Return captures reason, evidence, pickup/receipt, inspection and decision history.
- Permissioned/versioned transitions prevent stale or unauthorised decisions.
- Refund is created only after approved trigger and provider status is reconciled.
- Partial return/refund, rejection, replacement and provider failure are supported as approved.

**Required evidence:** State-machine/RBAC suite, reverse-logistics sandbox, duplicate-refund test,
accounting reconciliation, customer/seller/admin UAT and Finance/Operations approval.

## 9. G7 — Seller operational surfaces

**Pass criteria**

- Onboarding/KYC/remediation/approval is complete and audited.
- Seller catalogue/offer/inventory, order, fulfilment, return and settlement journeys exist.
- Organisation/role isolation prevents cross-seller access.
- Consequential and financial actions use confirmations, reason capture and approved SoD.
- Responsive WCAG 2.2 AA UX covers loading/empty/error/stale/degraded/conflict states.

**Required evidence:** All seller journey E2E tests, tenant penetration tests, accessibility audit,
settlement reconciliation and Seller Operations/Finance UAT.

## 10. G8 — Marketplace administration

**Pass criteria**

- Operators can receive, split, allocate, hold, release and recover marketplace orders.
- Stale concurrent actions fail safely; manual overrides require permission and reason.
- Integration failures, DLQ items and reconciliation mismatches are visible and recoverable without
  direct database edits.
- Audit timeline connects order, payment, allocation, reservation, shipment, return and settlement.

**Required evidence:** RBAC/SoD suite, fault injection and replay game day, reconciliation report,
audit completeness/export test and Operations/Security approval.

## 11. Cross-cutting release gates

These do not replace G1-G8:

| Gate | Minimum pass condition |
|---|---|
| Contract compatibility | Flutter and web consumer contracts pass against release API; no unapproved breaking change |
| Security/privacy | Threat model, SAST/SCA/secret scan, pentest, encryption, retention and data-subject handling approved |
| Reliability | SLOs defined; load/soak, dependency outage, retry/replay and failover tests pass |
| Observability | Correlation IDs, metrics/logs/traces, actionable alerts and owned runbooks validated |
| Data integrity | Scheduled order/payment/inventory/allocation/shipment/refund/settlement reconciliation passes |
| Backup/recovery | Restore and DR meet approved RPO/RTO |
| Accessibility | Customer, seller and admin critical paths meet WCAG 2.2 AA |
| UAT | Named customer/B2B/seller/ops/finance/support approvers sign the exact release candidate |
| Governance | Q-005A and provider/policy approvals resolved; Change Contracts/ADRs/Data Contract current |
| Rollback | Tested application/schema/config rollback or forward-fix strategy with no canonical data loss |

## 12. Evidence record format

```yaml
gate_id: G1
release_candidate: <immutable version>
environment: <staging/pre-production>
status: fail | conditional | pass
contract_versions: []
automated_runs: []
security_evidence: []
provider_evidence: []
observability_links: []
reconciliation_links: []
runbooks: []
uat_evidence: []
exceptions: []
approvals:
  - role: <required role>
    person: <named human>
    decision: approved | rejected
    date: <ISO-8601>
```

No gate may be marked `pass` by an AI agent or inferred from merged code. Human production
authorization remains mandatory.
