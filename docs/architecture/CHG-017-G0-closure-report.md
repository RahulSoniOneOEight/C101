# CHG-017 — G0 Closure Report

**Generated:** 2026-10-05
**Change contract:** CHG-017 Revision 5
**Owner / Reviewer:** RS (Accountable Project / Architecture Owner) — self-review explicitly authorized by the human.

## G0_STATUS: OPEN

G0 is **not** closed. Owners and reviewers are named (`RS`); PS-09 delegation and PS-10 targets are
recorded; PS-11 (GST-inclusive tax/invoice) and PS-12 (accounting-posting) are approved for the
bounded pilot. One item remains open: **PS-13 membership/access policy** (explicit policy approval).

## Provider decisions (PS-01 … PS-13)

| Item | Owner | Reviewer | Outcome | Conditions outstanding | Closure status |
|---|---|---|---|---|---|
| PS-01 Identity/OTP | RS | RS | accepted-with-conditions | Production OTP provider deferred | open |
| PS-02 Logistics | RS | RS | accepted-with-conditions | Production logistics provider deferred | open |
| PS-03 Queue/storage/notifications | RS | RS | accepted | Exact versions/tiers/owners | open |
| PS-04 Editorial CMS | RS | RS | accepted | — | open |
| PS-05 Search | RS | RS | accepted | — | open |
| PS-06 Analytics | RS | RS | accepted-with-conditions | Retention/consent/PII/residency/access | open |
| PS-07 Support | RS | RS | accepted-with-conditions | Retention/attachment/roles/escalation/SLA | open |
| PS-08 Recommendations | RS | RS | accepted | — | open |
| PS-09 Secrets/env/observability | RS | RS | accepted | — (delegates = RS) | closed |
| PS-10 Load/RPO/RTO | RS | RS | accepted | — (targets recorded) | closed |
| PS-11 Tax/invoice | RS | RS | accepted | — (GST-inclusive policy recorded) | closed |
| PS-12 Accounting-posting | RS | RS | accepted | — (bounded-pilot test-clearing) | closed |
| PS-13 Membership/access | RS | RS | accepted-with-conditions | Explicit policy approval | open |

## Evidence items (E-017-001 … E-017-021)

| Item | Owner | Reviewer | Outcome | Conditions outstanding | Closure status |
|---|---|---|---|---|---|
| E-017-001 Core platform versions | RS | RS | in-progress | Exact compatible versions recorded | open |
| E-017-002 Identity/OTP capability | RS | RS | missing · deferred-for-pilot | Real provider evidence | open |
| E-017-003 Payment provider | RS | RS | planned · deferred | Razorpay sandbox evidence | open |
| E-017-004 Logistics provider | RS | RS | missing · deferred-for-pilot | Real provider evidence | open |
| E-017-005 Queue/storage/notifications | RS | RS | planned | Exact versions/tiers/owners | open |
| E-017-006 Environment topology | RS | RS | missing · accepted-with-conditions | Environment topology evidence | open |
| E-017-007 Secrets/observability/on-call | RS | RS | missing · accepted-with-conditions | Mechanism evidence | open |
| E-017-008 Peak load / transaction profile | RS | RS | planned | Load evidence (targets approved) | open |
| E-017-009 Recovery objectives | RS | RS | planned | Restore drill evidence (targets approved) | open |
| E-017-010 Membership/access rules | RS | RS | missing · accepted-with-conditions | Policy approval | open |
| E-017-011 Tax/invoice policy | RS | RS | planned · accepted | Implementation evidence | open |
| E-017-012 Accounting projection policy | RS | RS | planned · accepted-for-pilot | Implementation evidence | open |
| E-017-013 Tryton reservation concurrency | RS | RS | planned | Concurrency/atomicity evidence | open |
| E-017-014 Simulated payment safety | RS | RS | planned | Safety + fail-closed evidence | open |
| E-017-015 Medusa Commerce integration | RS | RS | planned | Persistence/recovery evidence | open |
| E-017-016 Mercur Marketplace integration | RS | RS | planned | Allocation evidence | open |
| E-017-017 Tryton movement/accounting | RS | RS | planned | Movement/accounting evidence | open |
| E-017-018 Cross-system reconciliation | RS | RS | planned | Reconciliation evidence | open |
| E-017-019 Shared client connectivity | RS | RS | planned | Consumer contract tests | open |
| E-017-020 Environment routing/isolation | RS | RS | planned | Routing/isolation evidence | open |
| E-017-021 Editorial CMS boundary | RS | RS | planned · Strapi | CMS boundary evidence | open |

## Exact remaining blockers to G0 closure

1. **PS-13 / E-017-010 — membership/access policy** — explicit approval of the bounded-pilot
   membership rules (allowlisted users, simulated OTP, backend-controlled B2B membership, account
   isolation, explicit roles, least privilege, revoked membership fails closed).
2. *(Deferred, non-blocking for the dummy pilot)* Razorpay sandbox evidence for provider G3.

## Not in scope of this update

- No application code or infrastructure was modified.
- No provider or credential was provisioned.
- The Redis → NATS production-gap disposition is unchanged (staging=Redis, canonical=NATS JetStream).
