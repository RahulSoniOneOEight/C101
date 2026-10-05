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

| Item | Title | Current status | Work done so far | Sign-off roles |
|---|---|---|---|---|
| E-017-001 | Core platform versions | in-progress | Versions pinned (`backend-local-staging-baseline.md`) | Architecture, Security, Integration Owners |
| E-017-002 | Identity/OTP provider | missing (dummy for pilot) | Dummy OTP built; real provider deferred | Architecture, Security, Integration Owners |
| E-017-003 | Payment provider | planned/deferred (Razorpay) | Simulated provider only | Finance, Security, Integration Owners |
| E-017-004 | Logistics provider | missing (dummy for pilot) | Simulated logistics built; real provider deferred | Logistics, Ops, Security, Integration Owners |
| E-017-005 | Queue/storage/notifications | in-progress | Redis (queue/cache) selected; storage/notifications pending | Architecture, Security, Integration Owners, Ops |
| E-017-006 | Environment topology | in-progress | Local staging stack defined | Architecture, Security, Ops, Integration Owners |
| E-017-007 | Secrets/observability/on-call | missing | Not yet assigned | Security, Ops, Integration Owners |
| E-017-008 | Peak load / transaction profile | missing | Not yet measured | Architecture, Ops, Release Authority |
| E-017-009 | Recovery objectives | missing | Not yet set | Architecture, Ops, Release Authority |
| E-017-010 | Membership/access rules | in-progress | Pilot allowlist + dummy OTP | Product, Security, Architecture, Ops |
| E-017-011 | Tax/invoice policy | missing | Test-clearing only; real tax/invoice pending | Finance/Tax, Legal, ERP Ops |
| E-017-012 | Accounting projection policy | missing | Test-clearing projection only | Finance/Tax, ERP Ops |
| E-017-013 | Tryton reservation concurrency | in-progress | reserve/commit/release via stock.move | Architecture, ERP Ops, Finance |
| E-017-014 | Simulated payment safety | in-progress | `pp_simulated_simulated` + fail-closed guard | Product, Architecture, Security, Finance, Ops, Release Authority |
| E-017-015 | Medusa Commerce integration | in-progress | products/cart/order group real | Architecture, Product, Ops |
| E-017-016 | Mercur Marketplace integration | in-progress | offers/eligibility/allocation real | Architecture, Marketplace, Marketplace Ops |
| E-017-017 | Tryton movement/accounting | in-progress | stock.move + test-clearing | Architecture, ERP Ops, Finance/Tax |
| E-017-018 | Cross-system reconciliation | in-progress | durable correlation + reconciliation view | Architecture, Ops, Marketplace, ERP Ops, Finance/Tax |
| E-017-019 | Shared client connectivity | in-progress | Flutter client + admin endpoints | Architecture, Security, Ops, Product |
| E-017-020 | Environment routing/production isolation | in-progress | staging-only config, fail-closed payment | Architecture, Security, Ops, Integration Owners, Release Authority |
| E-017-021 | Editorial CMS boundary | in-progress | Seed content module (non-transactional) | Product, Architecture, Security |

## G0 blockers (cannot be closed by AI)

1. **Named owners/reviewers** for every item above.
2. **Provider selections + capability evidence** for identity/OTP, logistics, notifications, storage,
   CMS, analytics, recommendation, Chatwoot (all currently dummy/deferred).
3. **Real tax/invoice/accounting policy** (Finance/Tax + Legal + ERP Ops).
4. **Load profile, RPO/RTO, on-call/secrets ownership** (Operations + Architecture + Release Authority).
5. **Razorpay sandbox evidence** for provider G3 (deferred; does not block the dummy pilot).

## What G0 closing authorizes (and does not)

- **Authorizes:** governance + the verification plan for the bounded staging slice.
- **Does not authorize:** production release, real payment/logistics/OTP providers, or customer data.

## Suggested first sign-off batch

The most impactful first signatures are the **functional integration** items already substantively
implemented: E-017-013, 014, 015, 016, 017, 018, 019, 020, 021 — these can be signed based on the
verified staging behaviour (reservation, allocation, order group, reconciliation, collections, OTP,
logistics). Provider/tax/load items (E-017-002, 003, 004, 007, 008, 009, 011, 012) remain blocked on
provider selection and business policy.
