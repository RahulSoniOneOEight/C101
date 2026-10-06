# CHG-017 environment routing and production-effect isolation (E-017-020)

Date: 2026-10-06
Scope: local isolated staging only; synthetic data; no production authorization

## Implemented

- **Redacted routing surface** — `GET /v1/admin/environment` returns the non-secret routing
  (host:port only, credentials stripped), the environment, the payment mode, the simulated-provider
  summary and `production_release_authorized=false`. It returns `404` in production.
- **Fail-closed guards** — the Experience API configuration refuses `production + simulated` and
  refuses unimplemented `provider` mode; the Medusa provider registration applies the equivalent
  guard (`bun run test:payment-safety`).
- **Visible markers** — every composed/health response carries `environment` and `test_data` so a
  client can always distinguish staging from production.

## Evidence

Command: `bun run test:isolation` from `services/experience-api`.

```text
PASS: production-effect isolation holds and simulated adapters are network-free.
  production + simulated -> refused; local routing, no credentials
  providers: payment/otp/logistics = simulated; production_release_authorized=false
```

Proves:

- `BUILDKART_ENVIRONMENT=production` with `PAYMENT_ADAPTER_MODE=simulated` is refused
  (`/Refusing to start/`), and `provider` mode is refused as unimplemented — unsafe routing and
  simulated payment in production fail closed;
- staging routing is local only (Experience API, Medusa, Tryton, NATS, DB all `localhost`/`127.0.0.1`);
- the routing payload contains **no credentials** (the Tryton password and DB credentials are absent);
- providers are `simulated` for payment, OTP and logistics and `production_release_authorized=false`;
- composed product/health responses carry `environment=staging` and `test_data=true`;
- the simulated payment adapter (`services/experience-api/src/payment/simulated-adapter.ts`) and the
  Medusa simulated-payment provider
  (`services/backend/packages/api/src/modules/simulated-payment/service.ts`) contain **no network
  calls** (`fetch`, `axios`, `http(s).request`), so live payment providers are unreachable from the
  pilot.

## Boundary

Bounded staging only. Production ERP, live payments, production logistics and production
notifications remain unreachable and unimplemented; no production release is authorized.
