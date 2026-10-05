# CHG-017 — G0 Closure Report

**Generated:** 2026-10-05
**Change contract:** CHG-017 Revision 5
**Owner:** RS (Accountable Project / Architecture Owner)

## G0_STATUS: OPEN

G0 is **not** closed. Owners are now named (`RS`), but every item still lacks a named **reviewer**,
and several items retain outstanding conditions (numeric targets, tax/accounting policy, membership
policy approval).

## Provider decisions (PS-01 … PS-13)

| Item | Owner | Reviewer | Outcome | Conditions outstanding | Closure status |
|---|---|---|---|---|---|
| PS-01 Identity/OTP | RS | missing | accepted-with-conditions | Production OTP provider deferred | open |
| PS-02 Logistics | RS | missing | accepted-with-conditions | Production logistics provider deferred | open |
| PS-03 Queue/storage/notifications | RS | missing | accepted | Exact versions/tiers/owners | open |
| PS-04 Editorial CMS | RS | missing | accepted | — | open |
| PS-05 Search | RS | missing | accepted | — | open |
| PS-06 Analytics | RS | missing | accepted-with-conditions | Retention/consent/PII/residency/access | open |
| PS-07 Support | RS | missing | accepted-with-conditions | Retention/attachment/roles/escalation/SLA | open |
| PS-08 Recommendations | RS | missing | accepted | — | open |
| PS-09 Secrets/env/observability | RS | missing | accepted-with-conditions | Delegated operators unassigned | open |
| PS-10 Load/RPO/RTO | RS | missing | accepted-with-conditions | Numeric targets | open |
| PS-11 Tax/invoice | RS | missing | deferred | Finance/Tax + Legal + ERP Ops approval | open |
| PS-12 Accounting-posting | RS | missing | deferred | Finance/Tax + ERP Ops approval | open |
| PS-13 Membership/access | RS | missing | accepted-with-conditions | Explicit policy approval + reviewer | open |

## Evidence items (E-017-001 … E-017-021)

| Item | Owner | Reviewer | Outcome | Conditions outstanding | Closure status |
|---|---|---|---|---|---|
| E-017-001 Core platform versions | RS | missing | in-progress | Exact compatible versions recorded | open |
| E-017-002 Identity/OTP capability | RS | missing | missing · deferred-for-pilot | Real provider evidence | open |
| E-017-003 Payment provider | RS | missing | planned · deferred | Razorpay sandbox evidence | open |
| E-017-004 Logistics provider | RS | missing | missing · deferred-for-pilot | Real provider evidence | open |
| E-017-005 Queue/storage/notifications | RS | missing | planned | Exact versions/tiers/owners | open |
| E-017-006 Environment topology | RS | missing | missing · accepted-with-conditions | Environment owners | open |
| E-017-007 Secrets/observability/on-call | RS | missing | missing · accepted-with-conditions | Security/observability/on-call owners | open |
| E-017-008 Peak load / transaction profile | RS | missing | missing · accepted-with-conditions | Numeric targets | open |
| E-017-009 Recovery objectives | RS | missing | missing · accepted-with-conditions | RPO/RTO/restore numbers | open |
| E-017-010 Membership/access rules | RS | missing | missing · accepted-with-conditions | Policy approval + reviewer | open |
| E-017-011 Tax/invoice policy | RS | missing | missing · deferred | Finance/Tax + Legal + ERP Ops | open |
| E-017-012 Accounting projection policy | RS | missing | missing · deferred | Finance/Tax + ERP Ops | open |
| E-017-013 Tryton reservation concurrency | RS | missing | planned | Concurrency/atomicity evidence | open |
| E-017-014 Simulated payment safety | RS | missing | planned | Safety + fail-closed evidence | open |
| E-017-015 Medusa Commerce integration | RS | missing | planned | Persistence/recovery evidence | open |
| E-017-016 Mercur Marketplace integration | RS | missing | planned | Allocation evidence | open |
| E-017-017 Tryton movement/accounting | RS | missing | planned | Movement/accounting evidence | open |
| E-017-018 Cross-system reconciliation | RS | missing | planned | Reconciliation evidence | open |
| E-017-019 Shared client connectivity | RS | missing | planned | Consumer contract tests | open |
| E-017-020 Environment routing/isolation | RS | missing | planned | Routing/isolation evidence | open |
| E-017-021 Editorial CMS boundary | RS | missing | planned · Strapi | CMS boundary evidence | open |

## Exact remaining blockers to G0 closure

1. **Named reviewers** for all PS-01…PS-13 and E-017-001…E-017-021 (independent review required; `RS` is owner, not reviewer).
2. **PS-10 numeric targets** — peak concurrent users, peak requests/sec (if used), peak orders/hour, p95 API latency, backup interval, RPO, RTO, restore-test frequency.
3. **PS-09 operational delegation** — named delegates for security/secrets, environment, observability and on-call.
4. **PS-11 / PS-12** — GST/tax/invoice and accounting-posting policy approval (Finance/Tax + Legal + ERP Ops), or a formal scope amendment moving them out of G0.
5. **E-017-010 / PS-13** — explicit membership/access policy approval + named reviewer.

## Not in scope of this update

- No application code or infrastructure was modified.
- No provider or credential was provisioned.
- The Redis → NATS production-gap disposition is unchanged (staging=Redis, canonical=NATS JetStream).
