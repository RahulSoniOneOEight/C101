# CHG-017 — G1–G6 Evidence Status

**Generated:** 2026-10-06
**After:** G0 governance closure (approved) and G1–G6 bounded-pilot evidence closure.

**G1–G6 STATUS: CLOSED for the bounded staging pilot.** All bounded-pilot evidence is recorded and
accepted — reservation concurrency + expiry, backup/restore drill, **load validation (N+1 fix + offer
cache)**, Medusa/Mercur/Tryton integration, reconciliation, connectivity, env isolation. Production-only
items remain deferred (non-blocking): real OTP/logistics providers, Razorpay sandbox, and production
OTel/secret-manager.

## Gate → evidence map and current status

| Gate | Evidence items | Status |
|---|---|---|
| G1 contracts-and-access | E-017-019, E-017-020, E-017-010 | closed |
| G2 checkout-integrity | E-017-013, E-017-015, E-017-016 | closed |
| G3 staging-simulation | E-017-014 | closed |
| G4 order-and-allocation | E-017-013, E-017-015, E-017-016, E-017-018 | closed |
| G5 fulfilment-and-accounting | E-017-017, E-017-018 | closed |
| G6 operational-readiness | E-017-008, E-017-009, E-017-006/007 | closed |

## Accepted evidence

- **E-017-008 load** — N+1 fix (bulk offers) + read-model offer cache (30s TTL) + production-shaped
  Medusa. At 50 virtual users / 20s: error rate 55% → 0%, p95 ~22s → **630ms**, throughput ~7 → **128 rps**,
  p50 416ms / p99 705ms. Browse uses cached commercial data; transactions revalidate live.
- **E-017-009 RPO/RTO** — `pg_dump` (Fc) + restore to throwaway DB (52 products verified).
- **E-017-013 concurrency + expiry** — atomic no-oversell ledger, idempotent re-reserve, expiry-vs-commit,
  late-payment re-reserve (`test:concurrency`, `test:expiry`).
- **E-017-019 connectivity**, **E-017-015 Medusa**, **E-017-016 Mercur**, **E-017-017 Tryton movement**,
  **E-017-018 reconciliation**, **E-017-014 simulated payment**, **E-017-020 env isolation**,
  **E-017-021 CMS boundary**, **E-017-001 versions** — verified.

## Deferred (production-only, non-blocking for the bounded pilot)

| Item | Reason |
|---|---|
| E-017-002 / E-017-004 identity & logistics | real providers deferred; pilot uses simulated OTP/logistics |
| E-017-003 Razorpay | provider G3 sandbox evidence deferred |
| E-017-006/007 production OTel/secret-manager | staging observability recorded (logs, health, events, correlation ids); production mechanism deferred |

No application code, provider, or credential is provisioned by this status report.
