# CHG-017 cross-system event consumer operations

Date: 2026-10-06
Scope: local isolated staging only; synthetic data; no production authorization

## Implemented

Continuous, service-owned JetStream consumers (`services/experience-api/src/workers/event-consumers.ts`)
replace the bounded batch harnesses for cross-system domain events.

| Consumer | Filter subject | Owning service |
| --- | --- | --- |
| `mercur-allocation` | `commerce.>` | Mercur |
| `tryton-reservation` | `inventory.>` | Tryton ERP |
| `reconciliation-tracker` | `logistics.>` | Reconciliation |

Operational guarantees:

- **At-least-once with explicit ack** — a message is acked only after the handler succeeds.
- **Bounded retry** — a failing handler `nak`s with a 500 ms backoff.
- **Dead-letter** — after `WORKER_MAX_DELIVER` attempts (default 5) a poison message is published to
  `buildkart.dlq.v1` and removed from the work stream, so one bad event cannot block the consumer.
- **Idempotency** — an already-processed event id is acked without re-handling.
- **Lag + counters** — processed / duplicates / failed / dead-lettered / lag are exposed as
  Prometheus text on `:9030/metrics` and JSON on `:9030/health`.

Command: `bun run start:workers` (process). Health/metrics: `GET :9030/health`, `:9030/metrics`.

## Evidence

Command: `bun run test:consumers` from `services/experience-api`.

Passing run:

```text
PASS: continuous consumers process, dedupe and dead-letter.
  ok: processed=1 duplicates=1
  poison: failed=2 deadLettered=1
```

This proves: a normal event is processed exactly once even when delivered twice; and a poison event
that fails repeatedly is dead-lettered after the retry cap instead of looping.

Live check: starting `start:workers` drained the existing `inventory.>` backlog (66 reservation
events, `tryton-reservation` -> `lag=0`) and served metrics/health.

## Boundary and known limitation

Bounded staging only. Worker reactions are side-effect-free logging placeholders; the owning
Mercur/Tryton/reconciliation services must supply the real reactions and run these workers in their
own deployment before production. No production effect is performed and no production release is
authorized.
