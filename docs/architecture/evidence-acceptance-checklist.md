# CHG-017 Evidence Acceptance Checklist — G0 sign-off

**Purpose:** collect the named human owners/reviewers required to move evidence items from
`planned`/`in-progress` to `accepted`, and to close G0. AI cannot self-approve; every row below must
be signed by a named accountable human.

## How to sign

For each item, record in the approval ledger (`CHG-017-approvals.yaml`) or a reply here:

```
Item ID:
Owner (name + role):
Reviewer (name + role):
Outcome: accepted | accepted-with-conditions | rejected
Evidence reference (artifact/URL):
Conditions (if any):
UTC timestamp:
```

## Evidence items and sign-off

Owner `RS` (Accountable Project / Architecture Owner) is recorded for every item, and `RS` is
recorded as Reviewer (self-review explicitly authorized by the human).

| Item | Title | Current status | Owner | Reviewer | Sign-off roles |
|---|---|---|---|---|---|
| E-017-001 | Core platform versions | in-progress | RS | RS | Architecture, Security, Integration Owners |
| E-017-002 | Identity/OTP provider | missing · deferred-for-pilot | RS | RS | Architecture, Security, Integration Owners |
| E-017-003 | Payment provider | planned · deferred (Razorpay) | RS | RS | Finance, Security, Integration Owners |
| E-017-004 | Logistics provider | missing · deferred-for-pilot | RS | RS | Logistics, Ops, Security, Integration Owners |
| E-017-005 | Queue/storage/notifications | planned · NATS+Valkey/Redis+R2 | RS | RS | Architecture, Security, Integration Owners, Ops |
| E-017-006 | Environment topology | missing · accepted-with-conditions | RS | RS | Architecture, Security, Ops, Integration Owners |
| E-017-007 | Secrets/observability/on-call | missing · accepted-with-conditions | RS | RS | Security, Ops, Integration Owners |
| E-017-008 | Peak load / transaction profile | missing · accepted-with-conditions | RS | RS | Architecture, Ops, Release Authority |
| E-017-009 | Recovery objectives | missing · accepted-with-conditions | RS | RS | Architecture, Ops, Release Authority |
| E-017-010 | Membership/access rules | missing · accepted-with-conditions | RS | RS | Product, Security, Architecture, Ops |
| E-017-011 | Tax/invoice policy | missing · deferred | RS | RS | Finance/Tax, Legal, ERP Ops |
| E-017-012 | Accounting projection policy | missing · deferred | RS | RS | Finance/Tax, ERP Ops |
| E-017-013 | Tryton reservation concurrency | in-progress | RS | RS | Architecture, ERP Ops, Finance |
| E-017-014 | Simulated payment safety | in-progress | RS | RS | Product, Architecture, Security, Finance, Ops, Release Authority |
| E-017-015 | Medusa Commerce integration | in-progress | RS | RS | Architecture, Product, Ops |
| E-017-016 | Mercur Marketplace integration | in-progress | RS | RS | Architecture, Marketplace, Marketplace Ops |
| E-017-017 | Tryton movement/accounting | in-progress | RS | RS | Architecture, ERP Ops, Finance/Tax |
| E-017-018 | Cross-system reconciliation | in-progress | RS | RS | Architecture, Ops, Marketplace, ERP Ops, Finance/Tax |
| E-017-019 | Shared client connectivity | in-progress | RS | RS | Architecture, Security, Ops, Product |
| E-017-020 | Environment routing/production isolation | in-progress | RS | RS | Architecture, Security, Ops, Integration Owners, Release Authority |
| E-017-021 | Editorial CMS boundary | planned · Strapi | RS | RS | Product, Architecture, Security |

## G0 blockers

None. G0 governance is closed — all mandatory owners and reviewers (RS) are named, and PS-01…PS-13
are approved. Razorpay sandbox evidence (provider G3) remains deferred and non-blocking for the
bounded staging pilot.

## What G0 closing authorizes (and does not)

- **Authorizes:** governance + the verification plan for the bounded staging slice.
- **Does not authorize:** production release, real payment/logistics/OTP providers, or customer data.

## Suggested first sign-off batch

The most impactful first signatures are the **functional integration** items already substantively
implemented: E-017-013, 014, 015, 016, 017, 018, 019, 020, 021 — these can be signed based on the
verified staging behaviour (reservation, allocation, order group, reconciliation, collections, OTP,
logistics). Provider/tax/load items (E-017-002, 003, 004, 007, 008, 009, 011, 012) remain blocked on
provider selection and business policy.
