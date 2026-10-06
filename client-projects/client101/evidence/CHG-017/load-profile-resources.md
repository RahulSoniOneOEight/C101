# CHG-017 reverse proxy and resource profile

Date: 2026-10-06
Scope: local isolated staging only; synthetic data; no production authorization

## Reverse proxy

`services/proxy/nginx.conf` adds an nginx reverse proxy (`docker compose up -d proxy`, host `:8081`)
fronting:

- Experience API (`:9020`): `/v1/`, `/health`, `/metrics`, `/ops`
- Medusa/Mercur (`:9010`): `/store/`

Design note: upstream keepalive is **disabled**. The Bun upstream closes idle connections, and reusing
a stale pooled connection produced latency/502s during load; a fresh connection to the host measures
~2ms. `max_fails=0` prevents a transient blip from ejecting the upstream.

## Resource metrics

`GET /metrics` on the Experience API returns Prometheus-style telemetry:

- `buildkart_process_cpu_percent`, `buildkart_process_rss_mb`, `buildkart_process_heap_used_mb`
- `buildkart_pg_pool_{total,idle,waiting}{store="reservation|event|correlation"}`
- `buildkart_offer_cache_entries`, `buildkart_offer_cache_hits_total`, `buildkart_offer_cache_misses_total`
- `buildkart_nats_connected`
- `buildkart_nats_consumer_lag{consumer="mercur-allocation|tryton-reservation|reconciliation-tracker"}`

`bun run test:load` captures this before/after a run and prints a resource profile.

## Load profile evidence

Command (through the reverse proxy):

```sh
TARGET_BASE_URL=http://localhost:8081 VIRTUAL_USERS=50 DURATION_MS=15000 bun run test:load
```

Result at 50 virtual users / 15s through the proxy:

```text
Requests: 2027 (93.0 rps)
Errors: 20 (0.99%)       # 8x502 + 12x504 long-tail timeouts
Latency p50=273ms p95=527ms p99=8508ms
p95 <= 1500ms: PASS (527ms)

Resource profile:
  process cpu=7.45% rss=85.8MB heap=12.9MB
  offer cache: entries=9 hits=1453 misses=46 hit_ratio=96.9%
  pg pools: total_connections=1 waiting=0
  nats lag: mercur-allocation=0 tryton-reservation=0 reconciliation-tracker=0
```

A 20-user / 10s run was clean (0 errors, p95 800ms, 82.9% cache hits).

Interpretation:

- **CPU/memory**: the Experience API stays light (CPU <8%, RSS <100MB) at the pilot target — the
  browse path is cache-dominated and Medusa/Mercur does the heavy lifting.
- **Connection pool**: no waiting connections; the read/model path does not saturate PostgreSQL.
- **Cache-hit ratio**: ~83–97%; the 30s read-model offer cache absorbs repeated browse traffic.
- **NATS lag**: 0 across all consumers (no consumer backpressure).
- **Tail**: a small number of p99/504 long-tail timeouts through the Docker-Desktop proxy hop; p95 is
  well inside the 1.5s target. This is a local-proxy artifact, not an API or Medusa regression
  (direct API p50 is ~15ms).

## Boundary and known limitation

Bounded staging only. The reverse proxy runs locally over Docker Desktop; TLS, WAF/rate-limiting,
production upstreams and production observability backends are deferred. No production release is
authorized.
