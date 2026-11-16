# Checkout-time Tryton reservation — isolated preview contract

**Lane D** (Experience API, Medusa/Mercur, Tryton, preview-only PostgreSQL journal).
**Status:** prototype for an isolated integration stack only. Do not publish to shared
staging or production. This does not approve D-017-08's outstanding ERP Operations
and Finance conditions or change the two existing QC orders (#195 and #196).

## Scope and gates

- Off by default; explicitly opt in only in `BUILDKART_ENVIRONMENT=integration`
  with a dedicated preview Medusa database, Experience database and Tryton database.
  Refuse known staging/production service endpoints and refuse startup in staging
  or production when the flag is enabled. Never invoke it against a staging cart.
- For this bounded slice, accept exactly **one cart line** with a positive integer
  quantity and a unique, matching seller offer/SKU. Reject empty, multi-line,
  ambiguous or unidentifiable carts before payment or any stock write.
- Use Tryton's actual on-hand minus assigned quantity at a **single storage
  location that can fulfill the entire line**, not the existing
  `reservation_ledger`'s permissive default. Serialize the preview's same-SKU
  read/reserve/commit across API processes; this is not a global Tryton lock or
  a substitute for seller-to-warehouse mapping. Refuse an incomplete/truncated
  Tryton move-history read rather than trusting a partial ATP calculation.
- Keep the existing manual reserve/commit/release endpoints unavailable in preview
  mode so they cannot invalidate the preview journal. The default staging behavior
  stays unchanged on the unmodified release branch.

## State and retry boundaries

1. Under the per-cart lock, return an existing completed order only if the
   preview journal says confirmed and the matching Tryton move is still assigned.
   Never retroactively reserve an already completed cart.
2. With a per-SKU lock, check ERP ATP and write an intent **before** creating a
   move. Journal `creating` before Tryton `create`; after obtaining the move ID
   record `draft`; journal `committing` before Tryton `assign`; verify `assigned`
   and exact quantity, then journal `committed`.
3. Only then initialize the simulated Medusa payment session and call cart
   completion. Journal `completing` before doing so. Persist the order-group
   correlation and event before journal `confirmed` and returning confirmation.
4. Any uncertain remote outcome, missing journal transition, error, or retry from
   an intermediate state fails closed as `needs_review`. It must **not** create
   another Tryton move, retry Medusa completion, release an uncertain move,
   or claim confirmation. A separate operator-led reconciliation is required;
   stock may remain assigned until that review. Preview TTL/expiry is not
   implemented and cannot be treated as an automatic recovery mechanism.
   Insufficient ATP leaves no intent or payment session and may be retried.

## Verification and limitations

Run isolated unit tests for single-line resolution, multi-line/unknown offer
rejection, ordering, insufficient ATP, repeated completion, failed move creation/
commit, and ambiguous Medusa completion. Typecheck. When an isolated stack is
available, exercise a full simulated checkout, retry and failure-injection cycle
against separate Postgres/Medusa/Tryton instances, verify order-group count,
Tryton move ID/state/quantity and reconciliation, and review the event outbox.
**Not proven without that cycle:** global ATP atomicity against external Tryton
writers; Medusa direct-store checkout bypass; recovery of an interrupted Medusa
workflow or an orphaned Tryton move created just before a network failure;
distributed atomicity across PostgreSQL, Tryton and Medusa. Those are release
blockers, not implied guarantees of the preview.

## Local evidence and next gate

- `bun run test:checkout-preview`: unit tests passed (offer/line validation,
  configuration gate, exact move/state checks, state transitions, interrupted
  retry, ATP rejection, and partial-failure blocking).
- `bun run typecheck`: passed. No Docker Linux daemon is available on this
  workstation, so **no isolated Postgres/Medusa/Tryton integration cycle was
  run** and no database migration or Tryton write was attempted.
- Do not copy the flag, journal, or code into shared staging. Before any
  activation: provision a separate preview stack and receipt/stock fixtures;
  run the end-to-end and failure-injection cycle described above; settle the
  outstanding CHG-017 approvals and multi-line/warehouse policy separately.
