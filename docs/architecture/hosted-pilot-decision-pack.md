# BuildKart Hosted-Pilot Decision Pack

**Change Contract:** `CHG-018`  
**Revision:** 1  
**Status:** Proposed — human approval required  
**Target:** A bounded hosted-staging pilot for no more than 20 allowlisted Android testers

## Decision requested

Approve or amend the seven decisions below for **bounded hosted staging only**. Approval permits
implementation and test work within this boundary. It does not authorise production providers,
production customer effects, production data or a production release.

| Decision | Baseline | Required roles |
|---|---|---|
| `D-018-01` Bounded pilot | Maximum 20 allowlisted testers; rollout gates at 2–3, 5 and 20 users; every wave requires human review | Product, Operations, Release Authority |
| `D-018-02` Identity and ownership | Configurable tester allowlist, `PILOT_OTP_CODE=123456` in staging, Redis-backed challenges/sessions, revocation and per-user order/notification isolation | Product, Architecture, Security |
| `D-018-03` Notification boundary | Experience API owns the durable per-user inbox/read state; four versioned templates only; notification failure cannot change canonical order success | Product, Architecture, Operations |
| `D-018-04` Staging FCM | Dedicated staging Firebase project, server-side credentials, allowlisted pilot devices, durable delivery records, bounded retry and DLQ; production Firebase configuration fails closed | Security, Operations, Integration Owners |
| `D-018-05` Hosted topology | Hosted Medusa/Mercur, Tryton, Experience API, NATS, PostgreSQL and Redis with TLS, secret references, health/metrics/logs/alerts and evidenced backup/restore | Architecture, Security, Operations |
| `D-018-06` Android distribution | Protected release keystore, non-debug APK pinned to staging HTTPS endpoints, staged Firebase App Distribution only | Security, Operations, Release Authority |
| `D-018-07` Production isolation | Simulated payment/OTP/logistics remain mandatory; production notifications, customer data, credentials, endpoints and release remain prohibited and fail closed | Architecture, Security, Release Authority |

## Ownership and failure semantics

- Medusa remains the owner of carts and canonical orders.
- Mercur remains the owner of sellers, offers and allocation.
- Tryton remains the owner of inventory movements and accounting projections.
- The Experience API owns pilot orchestration, staging identities/sessions, notification inbox/read
  state, device-registration records and normalised delivery-attempt records.
- FCM delivery evidence is external-provider evidence. It cannot manufacture or modify order success.
- `order.confirmed` and simulated `shipment.status-changed` target only the canonical order owner.
- Product-launch and price-drop notifications target only the configured pilot allowlist.

## Authorised notification set

| Template | Audience | Source |
|---|---|---|
| Product launch | All allowlisted testers | Medusa or governed manual staging trigger |
| Price drop | All allowlisted testers for the initial pilot | Mercur offer change or governed manual staging trigger |
| Order confirmed | Canonical order owner only | `order.confirmed` |
| Delivery update | Canonical order owner only | Simulated `shipment.status-changed` |

Template wording must be approved before external FCM delivery. In-app development fixtures may be
replaced during implementation, but no external delivery may begin until the dedicated staging
Firebase project, credential handling and tester list have been reviewed.

## Required external inputs

1. Twenty tester identifiers supplied through an approved secret/configuration path.
2. Hosting provider and authorised deployment access.
3. Domain and DNS access for staging TLS.
4. Dedicated Firebase staging project and server credentials.
5. Protected Android release keystore and signing configuration.
6. Final wording for all four templates.

No secret, keystore or tester list belongs in the repository, approval ledger or chat.

## Verification and rollout gates

1. Governance approval is recorded against the exact Revision 1 hashes.
2. Identity, restart, multi-replica and ownership-isolation tests pass.
3. Inbox persistence, targeting, dedupe, retry, audit and DLQ tests pass.
4. Hosted TLS, ingress, secret references, monitoring and restore proof pass.
5. A release-signed APK is verified to use only staging HTTPS endpoints.
6. Human review approves each rollout expansion: 2–3 users, then 5, then all 20.

## Explicitly prohibited

- Live payment processing or production payment credentials.
- Real SMS/OTP or a production identity provider.
- Real carrier booking or production logistics.
- Production Firebase projects, customer notifications or production customer data.
- Production release or any implication that pilot acceptance authorises production.
