# CHG-017 Capability Test Plan

These are provider-neutral evidence scenarios. They are not runtime implementation tests and must be
executed only in an approved sandbox or disposable technical investigation environment.

## P0 — Staging simulated-payment adapter

1. Server configuration selects simulation; clients cannot select adapter mode or outcome.
2. Success records `simulated_accepted`, never `captured`, and carries test-data markers.
3. Failure and pending do not permit confirmation.
4. Duplicate result delivery has one effect; reordered results follow the approved state machine.
5. Late acceptance after reservation expiry re-reserves or enters test recovery.
6. Simulated refund request/completion remains visibly non-financial.
7. Production configuration with the simulator fails startup or disables checkout.
8. Provider-adapter failure cannot fall back to simulation.

## P0 — Tryton reservation

1. Repeating reserve with the same operation key returns one reservation and one effect.
2. Concurrent reserve requests for constrained stock cannot oversell.
3. Commit and expiry race against the same reservation version; exactly one succeeds.
4. Release is idempotent and cannot release a committed reservation.
5. A configurable TTL change does not extend existing reservations.
6. Late captured payment obtains a fresh reservation or creates a durable refund-recovery outcome.
7. Evidence records reservation ID, operation key, versions, timestamps and resulting ATP.

## P0 — Functional staging owner services

1. Medusa persists the seller-aware cart, durable checkout link and one canonical test order.
2. Mercur returns actual staging offers/eligibility and confirms one allocation without substitution.
3. Tryton reserves, commits/releases and records staging stock movement.
4. Tryton produces only approved staging test-clearing accounting projections.
5. Checkout, order, allocation, reservation, movement and accounting references reconcile by one correlation ID.
6. Every downstream record retains `payment_mode=simulated`, `test_data=true` and staging environment.
7. App, web, seller and operator views read the same shared backend state.
8. Local fixtures or client flags cannot manufacture order, allocation, inventory or accounting success.

## P0 — Environment routing isolation

1. Resolve Medusa, Mercur and Tryton through staging-only endpoint/credential references.
2. Block production ERP, live payment, production logistics and production notification routes.
3. Fail startup or disable checkout when environment and endpoint classification conflict.
4. Demonstrate that no simulated test order can be promoted or replayed into production.

## Deferred — Real payment provider

1. Server creates the payment session and binds amount/currency to the checkout snapshot.
2. Valid signed webhook produces one normalised effect.
3. Invalid signature is rejected and audited without changing payment state.
4. Duplicate and out-of-order webhooks do not repeat capture/order/refund effects.
5. Timeout produces `unknown`; provider query resolves outcome before any repeat.
6. Authorised is not treated as captured.
7. Refund requested and provider-completed refund remain distinct and idempotent.
8. Provider evidence references are immutable and sensitive payloads are protected.

## P1 — Identity and membership

1. OTP expiry, attempt limit and abuse throttling operate without account enumeration.
2. Refresh token rotation invalidates replayed tokens; revocation terminates the session.
3. Buyer cannot manufacture a business-account, seller or operator context.
4. Business-account membership enforces account and role status.
5. Seller membership cannot access another seller's order or customer fields.
6. Operator actions enforce action-level permission and approved step-up authentication.

## P1 — Logistics

1. Serviceability, rate and promise are evaluated for the approved destination and seller context.
2. Booking intent is persisted before the provider call.
3. Timeout is classified ambiguous and resolved by provider lookup before retry.
4. Duplicate booking command returns the prior result without a second shipment.
5. Booking failure preserves an accepted order and creates an operational exception.
6. Unsupported physical split creates an exception without changing customer charges or promises.
7. Tracking webhooks are authenticated, deduplicated and normalised.

## Evidence requirements

For every scenario retain the provider/version, sandbox, input fingerprint, operation/correlation IDs,
timestamps, expected result, observed result, redacted evidence reference and named reviewer. Do not
store credentials, signing secrets or unrestricted provider payloads.
