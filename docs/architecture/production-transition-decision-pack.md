# BuildKart Production Transition Decision Pack

**Change Contract:** `CHG-020`
**Revision:** 1
**Status:** Proposed — human approval required
**Scope:** Governed transition from the bounded hosted-staging pilot to a production release

## 1. Decision requested

Approve or amend the gate structure below. Approval of a gate decision authorizes **implementation
and evidence only**. Production release is a **separate** decision (`D-020-12`) that must be recorded
by its own accountable roles. Until `D-020-12` is recorded and its gate evidence accepted, all
production effects, production data and production providers remain prohibited.

Current baseline: `production_release_authorized: false`. Every gate in
`docs/architecture/production-release-gates.md` is FAIL, per
`docs/architecture/production-readiness-gap-assessment.md`.

## 2. Gate decisions

| Decision | Subject | Required roles |
|---|---|---|
| `D-020-01` | Production environment and perimeter (hosting, TLS, DNS, Cloudflare Access, private data stores) | Product, Architecture, Security, Operations |
| `D-020-02` | Real identity, OTP/SMS, sessions, consent and abuse controls | Product, Security, Legal/Privacy |
| `D-020-03` | Real payment provider adapter, signed webhooks and reconciliation | Finance, Security, Integration Owners |
| `D-020-04` | Multi-seller cart identity, immutable offer snapshot and allocation | Product, Architecture, Marketplace |
| `D-020-05` | Authoritative inventory projection and reservation (Tryton-authoritative) | Architecture, Operations, Integration Owners |
| `D-020-06` | Real logistics: rates, booking, signed events, delivery promise, SLA | Operations, Logistics, Integration Owners |
| `D-020-07` | Returns, refunds and settlement reconciliation | Finance, Operations, Legal/Privacy |
| `D-020-08` | Seller operational surfaces (KYC/onboarding, catalogue, orders, fulfilment, settlement) | Marketplace, Product, Operations |
| `D-020-09` | Marketplace administration (order handling, DLQ/reconciliation workbench, audited overrides) | Operations, Security, Marketplace |
| `D-020-10` | Security and privacy assurance (threat model, SAST/SCA/secret scan, pentest, ASVS, retention) | Security, Legal/Privacy, Architecture |
| `D-020-11` | Reliability, observability, backup/DR and rollback (SLOs, load/soak, restore to RPO/RTO, rollback) | Architecture, Operations, Security |
| `D-020-12` | **Production release authorization** for an immutable release candidate | Release Authority, Executive Sponsor, Security |

## 3. Gate closure requirement

Each gate decision is approved only when its record links:

- approved owner, policy and API/event schema versions;
- environment and exact release candidate;
- automated test run and negative/failure scenarios;
- security/RBAC/tenant-isolation evidence;
- provider sandbox or production-readiness evidence where applicable;
- observability dashboard, alerts and owned runbook;
- reconciliation/rollback/recovery proof;
- UAT result and named approver/date.

## 4. Production release authorization (D-020-12)

- Requires `G1`–`G8` and the cross-cutting gates to be `pass` for the **same immutable release
  candidate**.
- Requires Release Authority, Executive Sponsor and Security to each record approval.
- Is recorded as a distinct, hash-bound outcome; it is never inferred from gate approvals alone.
- Cannot be self-authorized by any agent, and cannot be granted from a chat instruction.

## 5. Explicitly prohibited until D-020-12 is recorded and accepted

- Production payment, real OTP/SMS, real logistics, production notifications.
- Production customer data, production providers or production endpoints.
- Production release, production app-store distribution or public launch.
- Reuse of staging secrets, test identities or the shared `123456` OTP in production.

## 6. Non-negotiable safeguards

- Simulated adapters must fail closed in production configuration.
- Cross-tenant and cross-seller isolation must hold under production identities.
- Consequential actions remain audited; super-admin actions require independent second approval.
- Notification and integration failures must never alter canonical order success.
- All numeric RPO/RTO, SLO and performance targets require explicit human approval.
