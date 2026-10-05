# CHG-017 bounded-pilot payment-simulation acceptance

Date: 2026-10-06  
Scope: local isolated staging only; synthetic data; no production authorization

## Implemented path

1. India region links both `pp_system_default` and `pp_simulated_simulated`.
2. Experience API validates the customer address, discovers eligible seller shipping options and
   persists the buyer's explicit selection before completion.
3. Experience API creates/reuses the canonical Medusa payment collection.
4. It initializes `pp_simulated_simulated` with `payment_mode=simulated` and `test_data=true`.
5. Mercur completes the cart into a canonical order group and seller order.
6. Experience API appends one `order.confirmed` event to the PostgreSQL outbox.
7. The publisher maps it to `commerce.order.created.v1` in NATS JetStream.
8. The durable `mercur-allocation` consumer receives and acknowledges the message.

## Acceptance evidence

Command: `bun run test:payment-flow` from `services/experience-api`.

Passing run:

- cart: `cart_01M46VD3VTET4A007GA7P6EPE0`
- payment collection: `pay_col_01M46VD6JJKZ3S95X151T6ZQNM`
- authorized payment session: `payses_01M46VD6M8DJT7V0WBWHBN6QWT`
- order group: `og_01M46VD7VBX2Q46VM90PS2003X`
- outbox event: `43965d93-00a0-4184-93de-09b952c9eabc`
- NATS subject/consumer: `commerce.order.created.v1` → `mercur-allocation`

The automated acceptance checks prove:

- direct cart completion without a payment session is rejected;
- shipping discovery and selection run through Experience API rather than a direct Medusa test
  workaround;
- the selected local provider is `pp_simulated_simulated`;
- payment-session and canonical seller-order metadata retain `payment_mode=simulated` and
  `test_data=true`;
- the selected offer and seller are preserved in Mercur's persisted allocation links;
- duplicate completion returns the original order group and payment session, creates no second order
  group, and emits no duplicate `order.confirmed` event;
- `order.confirmed` is published from the outbox and delivered to the durable Mercur consumer;
- production + simulated mode is rejected by both Experience API configuration and Medusa provider
  registration configuration.

Static inspection of `services/backend/packages/api/src/modules/simulated-payment/service.ts` confirms
that the local provider has no PSP SDK, HTTP client or network call. Razorpay remains deferred and no
production credentials were introduced.

## Simulator outcome matrix (E-017-014)

Command: `bun run test:payment-matrix` from `services/experience-api`.

| Outcome | Recorded status | Non-financial |
| --- | --- | --- |
| success | `simulated_accepted` | yes |
| failure | `failed` | yes |
| pending | `pending` | yes |
| duplicate | unchanged (marker refresh only) | yes |
| late | `simulated_accepted` | yes |
| refund | `simulated_refunded` (`evidence_status=simulated_result`) | yes |

The matrix also proves: an unknown outcome is rejected `400`; an unknown session is rejected `404`;
re-applying the same outcome is idempotent (state is byte-for-byte unchanged); the simulator never
emits `authorised`/`captured`; and a failed outcome cannot be treated as accepted (no fallback to
simulation). Client selection of `PAYMENT_ADAPTER_MODE=provider` is refused by configuration.

## Canonical order reconciliation

`bun run test:payment-flow` now reserves and commits Tryton inventory for the selected offer's SKU
before completion (`POST /v1/checkouts/{id}/reserve` → `POST /v1/checkouts/{id}/commit`) and then
asserts `GET /v1/admin/orders/{id}/reconciliation` returns:

- `reconciled: true` (order group + allocation + committed reservation),
- `reservation.status: committed`, `allocation.status: confirmed`,
- `accounting_treatment: staging_test_clearing`, `bank_receipt_claimed: false`.

## Additional regression evidence

- `bun run test:payment-matrix` — pass (see matrix above).
- `bun run test:payment-safety` — pass.
- `bun run test:concurrency` — pass (5/5 accepted, 5/5 rejected, no oversell).
- `bun run test:expiry` — pass (expiry, rejection and late re-reserve).
- `bun run test:nats` — pass (`BUILDKART_EVENTS`, 69 messages across four subjects at the time of run).
- Experience API and backend TypeScript checks — pass.
- Production-shaped `medusa build` — pass.
- Flutter `flutter analyze` — pass.
- Flutter `flutter test test/checkout_canonical_flow_test.dart` — pass; verifies one selected option
  per seller and prevents client-manufactured success by requiring the canonical simulated order
  response.
- `flutter test` (full app suite) — 100 tests pass.
- `flutter analyze` — no issues.

## Hosted device journey (Android emulator APK)

A bounded-staging debug APK was built against the local stack through the emulator host bridge:

```sh
flutter build apk --debug \
  --dart-define=MEDUSA_BASE_URL=http://10.0.2.2:9010 \
  --dart-define=EXPERIENCE_API_BASE_URL=http://10.0.2.2:9020 \
  --dart-define=MEDUSA_PUBLISHABLE_KEY=pk_...
```

Journey on the emulator (installed `app-debug.apk`): home → add offer to cart → cart → checkout →
customer address + explicit `Standard Shipping` selection → Place order → **Order Confirmed**.

Server-verified canonical result of that device journey (queried, not client-asserted):

- cart: `cart_01M46WFGRGHQCN79KZQC8H37X1`
- order group: `og_01M46WQCM960YSY3F8C35016A7` (total `64200`, `seller_count` 1)
- payment collection: `pay_col_01M46WQADDBSV8YNKAVVPKW7Q1`
- authorized payment session: `payses_01M46WQASD64890CBVYJT955K5`
- outbox event: `ce97cbf4-3860-482f-9824-80651b6b8d8f` (`order.confirmed`), `published_at`
  `2026-10-05T20:40:19Z`
- NATS `BUILDKART_EVENTS` last sequence advanced to 79 with zero unpublished outbox rows.

The client displayed success only after the Experience API returned `type=order_group` with
`payment_mode=simulated` and `test_data=true`; the identifiers above come from the PostgreSQL outbox
and NATS, confirming the app did not manufacture the order.

## Boundary and known limitation

This evidence authorizes no production release. Real PSP, signed webhooks, financial refunds and
production routing remain deferred. The bundled Mercur 2.3.4 documentation claims cart completion is
idempotent, but runtime verification produced a second order group when the split workflow was called
again. The Experience API therefore serializes completion with a PostgreSQL advisory lock and persists
the first canonical completion snapshot so retries never invoke Mercur twice.
