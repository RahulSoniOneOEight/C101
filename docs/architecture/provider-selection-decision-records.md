# BuildKart Provider-Selection Decision Records (Draft)

**Status:** DRAFT — proposal for human approval. Nothing here is selected or approved.
**Change contract:** CHG-017 (Revision 5) · `unresolved_provider_and_environment_details`
**Authorization basis:** `drafting_authorization` (contract-drafts only) — this document does **not**
select or approve any provider; it proposes candidates, a recommendation, and evidence requirements
for accountable humans to decide.
**Approval ledger:** decisions recorded here map to `D-017-03/10/11/21` and evidence items `E-017-002 … E-017-021`.

## 1. Purpose

Resolve the open provider/environment selections so the `missing` evidence items can move to
`planned → evidenced`. Each section is a single decision ready for sign-off: the accountable role
picks or overrides the recommendation and names the owner.

## 2. Selection summary

| # | Decision | Recommendation (draft) | Blocks | Approval roles |
|---|---|---|---|---|
| PS-01 | Identity / OTP | MSG91 OTP (DLT) + governed session; Auth0/Firebase for later strong auth | E-017-002 | architecture, security, integration-owners |
| PS-02 | Logistics | Shiprocket aggregator (Delhivery fallback) | E-017-004 | logistics, operations, security, integration-owners |
| PS-03 | Queue / storage / notifications | Redis (kept) + S3-compatible R2 + FCM/SES/MSG91 | E-017-005 | architecture, security, integration-owners, operations |
| PS-04 | CMS (editorial) | Strapi (self-hosted) | E-017-021 | product, architecture, security |
| PS-05 | Search | Meilisearch (self-hosted, derived index) | GAP-P1-13 | architecture, product |
| PS-06 | Analytics | PostHog (self-hostable) | GAP-P1-13 | product, security |
| PS-07 | Support | Chatwoot (self-hosted) | GAP-P1-14 | product, operations |
| PS-08 | Recommendation | Keep configurable-rules framework; defer dedicated engine | GAP-P1-13 | product, architecture |
| PS-09 | Secrets / observability / environments | Secret manager + OTel stack; **human owners required** | E-017-006/007 | security, operations, integration-owners |
| PS-10 | Load / RPO / RTO | Approve targets; **human owners required** | E-017-008/009 | architecture, operations, release-authority |

## 3. Decisions

### PS-01 — Identity and OTP provider

- **Scope:** B2C + B2B phone-first OTP sign-in, session/refresh, consent. Pilot is allowlisted dummy OTP.
- **Candidates:**
  - **MSG91** — Indian OTP/SMS, DLT-compliant transactional route, low cost, Indian support.
  - **Twilio Verify** — global, managed Verify API, strong delivery, higher cost.
  - **Firebase Auth (Phone)** — Google, minimal infra, free tier, OTP built-in.
  - **Auth0 / AWS Cognito** — full IdP, stronger for B2B roles/SAML, heavier than OTP-first needs.
- **Recommendation (draft):** MSG91 for OTP/SMS delivery (DLT) + a governed opaque session token; introduce Auth0 or Firebase Auth when B2B role/SAML/refresh-revocation requirements firm up.
- **Evidence required:** DLT registration; sandbox send/verify/resend; rate-limit + abuse controls; session revocation; consent versioning; tenant-isolation tests.
- **Approval roles:** architecture, security, integration-owners.

### PS-02 — Logistics provider

- **Scope:** serviceability (postcode), rate, booking, tracking; construction-goods geography (India).
- **Candidates:**
  - **Shiprocket** — multi-carrier aggregator: serviceability + rate + booking + tracking + COD in one API.
  - **Delhivery** — direct carrier, strong express network, full API.
  - **Xpressbees / Ecom Express / Blue Dart** — direct alternatives.
- **Recommendation (draft):** Shiprocket aggregator for the slice (single API across carriers), with Delhivery as the direct fallback candidate.
- **Evidence required:** sandbox serviceability/rate; booking + AWB; tracking webhook; ambiguous-booking + physical-split → exception; SLA monitoring.
- **Approval roles:** logistics, operations, security, integration-owners.

### PS-03 — Queue / object storage / notifications

- **Scope:** event bus/queue, blob storage, push/SMS/email notifications.
- **Recommendation (draft):**
  - Queue/broker — **Redis** (already in stack) for event bus/locking/queue in staging; upgrade path to a managed broker (AWS SQS or RabbitMQ) for production throughput.
  - Object storage — **S3-compatible** (Cloudflare R2, MinIO for local).
  - Notifications — **FCM** (push) + **MSG91** (SMS/OTP) + **AWS SES** (transactional email).
- **Evidence required:** exact versions/tiers, retention + security constraints, delivery/retry/dedupe semantics.
- **Approval roles:** architecture, security, integration-owners, operations.

### PS-04 — CMS (editorial content only)

- **Scope:** app-shell editorial content (banners, onboarding, help, FAQ, legal) — never transactional state.
- **Candidates:** Strapi (self-hosted, evaluated in `BuildKart-Strapi-Medusa-CMS-Evaluation.md`), Sanity, Contentful, Payload.
- **Recommendation (draft):** **Strapi** (self-hosted, already evaluated as a candidate).
- **Evidence required:** publish/preview/rollback; CMS cannot own price/stock/seller/order; locale/audience/fallback.
- **Approval roles:** product, architecture, security.

### PS-05 — Search

- **Scope:** derived product search + facets. CHG-017 already constrains "Meilisearch remains a derived index".
- **Candidates:** Meilisearch (self-hosted), Typesense, Algolia (managed).
- **Recommendation (draft):** **Meilisearch** (self-hosted) as a derived index, excluded from transactional authority.
- **Evidence required:** index consistency, zero-result/facet, only-eligible-products indexed.
- **Approval roles:** architecture, product.

### PS-06 — Analytics

- **Scope:** approved derived signals for merchandising (never transactional authority).
- **Candidates:** PostHog (self-hostable), Mixpanel, Amplitude, GA4.
- **Recommendation (draft):** **PostHog** (self-hostable, privacy-friendly) or Mixpanel if managed is preferred.
- **Evidence required:** event schema, consent/PII boundaries, retention.
- **Approval roles:** product, security.

### PS-07 — Customer support

- **Scope:** support conversations + tickets. Already named "Chatwoot".
- **Recommendation (draft):** **Chatwoot** (self-hosted).
- **Evidence required:** support authorisation (only authorised entities), SLA, privacy/retention.
- **Approval roles:** product, operations.

### PS-08 — Recommendation engine

- **Scope:** merchandising recommendation. The `configurable-rules-framework` (59 rules) already powers collections.
- **Recommendation (draft):** keep the rules framework for the slice; defer a dedicated recommendation provider until analytics signals exist.
- **Evidence required:** rule determinism, ranking correctness, no transactional authority.
- **Approval roles:** product, architecture.

### PS-09 — Secrets, observability, environments

- **Scope:** secret manager, logs/metrics/traces/alerts, dev/CI/staging/prod owners.
- **Recommendation (draft):** secret manager (**AWS Secrets Manager** or **Doppler**); observability (**OpenTelemetry + Grafana/Loki/Prometheus** or managed APM). **The environment owners must be named humans — this cannot be proposed by an agent.**
- **Evidence required:** secret rotation/break-glass, alert/escalation/on-call ownership, isolation + access boundaries.
- **Approval roles:** security, operations, integration-owners.

### PS-10 — Load profile, RPO/RTO

- **Scope:** peak request rate, concurrency, transaction mix, RPO/RTO.
- **Recommendation (draft):** approve conservative pilot targets (single-region, low concurrency) and scale them up for production. **Targets must be approved by humans.**
- **Evidence required:** load/soak tests, backup/restore drill, DR plan.
- **Approval roles:** architecture, operations, release-authority.

## 4. Sign-off (to be completed by accountable humans)

| # | Provider / policy | Selected (final) | Owner (name+role) | Reviewer | Outcome | UTC |
|---|---|---|---|---|---|---|
| PS-01 | Identity/OTP |  |  |  |  |  |
| PS-02 | Logistics |  |  |  |  |  |
| PS-03 | Queue/storage/notifications |  |  |  |  |  |
| PS-04 | CMS |  |  |  |  |  |
| PS-05 | Search |  |  |  |  |  |
| PS-06 | Analytics |  |  |  |  |  |
| PS-07 | Support |  |  |  |  |  |
| PS-08 | Recommendation |  |  |  |  |  |
| PS-09 | Secrets/observability/env |  |  |  |  |  |
| PS-10 | Load/RPO/RTO |  |  |  |  |  |

## 5. Mapping to evidence and decisions

| Selection | Evidence item(s) | Governing decision(s) |
|---|---|---|
| PS-01 | E-017-002, E-017-010 | D-017-03 |
| PS-02 | E-017-004 | D-017-11 |
| PS-03 | E-017-005 | D-017-15, D-017-21 |
| PS-04 | E-017-021 | D-017-01, D-017-02, D-017-21 |
| PS-05 | GAP-P1-13 | D-017-21 (Meilisearch exclusion/version) |
| PS-06/07/08 | GAP-P1-13, GAP-P1-14 | D-017-21 |
| PS-09 | E-017-006, E-017-007 | D-017-14, D-017-21, D-017-23 |
| PS-10 | E-017-008, E-017-009 | D-017-23 |

## 6. Rules of this record

- Silence is not approval; each row in §4 must be signed by a named accountable human.
- A role's approval never substitutes for another required role's.
- Deferred/rejected selections block G0 for the dependent scope.
- This document cannot authorise provider credentials, production configuration, or production release.
