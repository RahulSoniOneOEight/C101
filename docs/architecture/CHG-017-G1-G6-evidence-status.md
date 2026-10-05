# CHG-017 — G1–G6 Evidence Status

**Generated:** 2026-10-05
**After:** G0 governance closure (approved).

G0 approved the governance + verification plan. G1–G6 are the **implementation-evidence** gates:
each gate closes when its `E-017-xxx` evidence items move `planned → evidenced → accepted (RS)`.

## Gate → evidence map and current status

| Gate | Evidence items | Status |
|---|---|---|
| G1 contracts-and-access | E-017-019 (client connectivity), E-017-020 (env isolation), E-017-010 (membership, accepted-for-pilot) | partially evidenced |
| G2 checkout-integrity | E-017-013 (Tryton concurrency), E-017-015 (Medusa), E-017-016 (Mercur) | partially evidenced |
| G3 staging-simulation | E-017-014 (simulated-payment safety) | partially evidenced |
| G4 order-and-allocation | E-017-013, E-017-015, E-017-016, E-017-018 (reconciliation) | partially evidenced |
| G5 fulfilment-and-accounting | E-017-017 (Tryton movement/accounting), E-017-018 (reconciliation) | partially evidenced |
| G6 operational-readiness | E-017-008 (load), E-017-009 (RPO/RTO), E-017-006/007 (env/secrets) | missing |

## Already evidenced (verified staging behaviour)

- **E-017-019** shared client connectivity — Flutter consumes the Experience API (composed products,
  offer-based cart, OTP, logistics, notifications); parity check **6/6**.
- **E-017-015** Medusa Commerce — cart → add offer line → complete → order group (verified end-to-end).
- **E-017-016** Mercur Marketplace — composed product returns real seller offers + deterministic
  lowest-eligible-selected seller (verified).
- **E-017-017** Tryton movement — variant sync → reserve → commit → release via `stock.move` (verified).
- **E-017-018** reconciliation — `/v1/admin/orders/{id}/reconciliation` correlates order group +
  Tryton move with test markers (verified).
- **E-017-014** simulated payment — `pp_simulated_simulated` + fail-closed guard (basic flow verified).
- **E-017-020** env isolation — staging-only config, `PAYMENT_ADAPTER_MODE=simulated`, production
  fail-closed (code verified).
- **E-017-021** CMS boundary — seed content module is editorial-only, non-transactional (verified).
- **E-017-001** versions — pinned in `backend-local-staging-baseline.md`.
- **E-017-013** no-oversell under concurrency — atomic reservation ledger (Postgres conditional UPDATE);
  `test:concurrency` shows 10 concurrent reserves against `available=5` → exactly 5 succeed, 5
  rejected `409 insufficient-stock`, and an idempotent re-reserve does not double-count.

## Missing evidence (concrete next actions)

| Item | Missing evidence | How to produce |
|---|---|---|
| E-017-013 (remaining) | Reservation TTL/expiry, atomic commit-vs-expiry, late-payment re-reserve/recovery | add reservation expiry + competing commit/expiry transition + late-payment recovery test |
| E-017-008 | Load profile vs targets (100 CCU, 20–30 rps, 100 orders/hr, p95 ≤ 1.5s) | load test (k6/Artillery) against the staging stack |
| E-017-009 | RPO/RTO + restore drill (daily backup, ≤24h RPO, ≤4h RTO, monthly restore) | backup + restore-from-backup test |
| E-017-006/007 | Environment/secrets/observability mechanism | staging observability wiring (OTel traces, central logs, secret-manager reference) |
| E-017-002/004 | Identity/logistics provider evidence | **deferred** (pilot simulated) |
| E-017-003 | Razorpay sandbox evidence | **deferred** (provider G3) |

## Recommended next sequence

1. **E-017-013 remaining** — reservation expiry + commit-vs-expiry + late-payment recovery.
2. **G6 load + restore** (E-017-008/009) — run a load test and a backup/restore drill against the
   staging stack.
3. **G6 observability** (E-017-006/007) — wire OTel/central-log/secret-manager references for staging.
4. Then present G1–G6 to RS for per-item `accepted` sign-off.

No application code, provider, or credential is provisioned by this status report.
