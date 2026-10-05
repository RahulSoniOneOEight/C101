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

Owner `RS` (Accountable Project / Architecture Owner) is recorded for every item. Reviewer is
unresolved for every item until a named reviewer is explicitly recorded (`reviewer_status: missing`).

| Item | Title | Current status | Owner | Reviewer | Sign-off roles |
|---|---|---|---|---|---|
| E-017-001 | Core platform versions | in-progress | RS | missing | Architecture, Security, Integration Owners |
| E-017-002 | Identity/OTP provider | missing · deferred-for-pilot | RS | missing | Architecture, Security, Integration Owners |
| E-017-003 | Payment provider | planned · deferred (Razorpay) | RS | missing | Finance, Security, Integration Owners |
| E-017-004 | Logistics provider | missing · deferred-for-pilot | RS | missing | Logistics, Ops, Security, Integration Owners |
| E-017-005 | Queue/storage/notifications | planned · NATS+Valkey/Redis+R2 | RS | missing | Architecture, Security, Integration Owners, Ops |
| E-017-006 | Environment topology | missing · accepted-with-conditions | RS | missing | Architecture, Security, Ops, Integration Owners |
| E-017-007 | Secrets/observability/on-call | missing · accepted-with-conditions | RS | missing | Security, Ops, Integration Owners |
| E-017-008 | Peak load / transaction profile | missing · accepted-with-conditions | RS | missing | Architecture, Ops, Release Authority |
| E-017-009 | Recovery objectives | missing · accepted-with-conditions | RS | missing | Architecture, Ops, Release Authority |
| E-017-010 | Membership/access rules | missing · accepted-with-conditions | RS | missing | Product, Security, Architecture, Ops |
| E-017-011 | Tax/invoice policy | missing · deferred | RS | missing | Finance/Tax, Legal, ERP Ops |
| E-017-012 | Accounting projection policy | missing · deferred | RS | missing | Finance/Tax, ERP Ops |
| E-017-013 | Tryton reservation concurrency | in-progress | RS | missing | Architecture, ERP Ops, Finance |
| E-017-014 | Simulated payment safety | in-progress | RS | missing | Product, Architecture, Security, Finance, Ops, Release Authority |
| E-017-015 | Medusa Commerce integration | in-progress | RS | missing | Architecture, Product, Ops |
| E-017-016 | Mercur Marketplace integration | in-progress | RS | missing | Architecture, Marketplace, Marketplace Ops |
| E-017-017 | Tryton movement/accounting | in-progress | RS | missing | Architecture, ERP Ops, Finance/Tax |
| E-017-018 | Cross-system reconciliation | in-progress | RS | missing | Architecture, Ops, Marketplace, ERP Ops, Finance/Tax |
| E-017-019 | Shared client connectivity | in-progress | RS | missing | Architecture, Security, Ops, Product |
| E-017-020 | Environment routing/production isolation | in-progress | RS | missing | Architecture, Security, Ops, Integration Owners, Release Authority |
| E-017-021 | Editorial CMS boundary | planned · Strapi | RS | missing | Product, Architecture, Security |

## G0 blockers (remaining human actions)

1. **Named reviewers** for every item above (owners now named `RS`; reviewers unresolved).
2. **PS-10 numeric targets** — peak concurrent users, peak orders/hour, p95 API latency, backup
   interval, RPO, RTO, restore-test frequency (Operations + Architecture + Release Authority).
3. **PS-09 operational delegation** — named delegates for security/secrets, environment,
   observability and on-call (RS remains accountable owner until delegation is named).
4. **PS-11 / PS-12** — GST/tax/invoice and accounting-posting policy approval (Finance/Tax + Legal +
   ERP Ops), or a formal scope amendment moving them out of G0.
5. **E-017-010 / PS-13** — explicit membership/access policy approval + reviewer.
6. **Razorpay sandbox evidence** for provider G3 (deferred; does not block the dummy pilot).

## What G0 closing authorizes (and does not)

- **Authorizes:** governance + the verification plan for the bounded staging slice.
- **Does not authorize:** production release, real payment/logistics/OTP providers, or customer data.

## Suggested first sign-off batch

The most impactful first signatures are the **functional integration** items already substantively
implemented: E-017-013, 014, 015, 016, 017, 018, 019, 020, 021 — these can be signed based on the
verified staging behaviour (reservation, allocation, order group, reconciliation, collections, OTP,
logistics). Provider/tax/load items (E-017-002, 003, 004, 007, 008, 009, 011, 012) remain blocked on
provider selection and business policy.
