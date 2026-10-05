import { loadConfig } from "../config.js";

/**
 * E-017-008 load + resource evidence.
 *
 * Drives the staging Experience API (optionally through the reverse proxy) and reports throughput,
 * latency and errors against the PS-10 targets (100 CCU, 20-30 rps, p95 <= 1.5s), together with the
 * resource profile captured from `/metrics`: process CPU/RSS, PostgreSQL connection-pool usage,
 * offer read-model cache hit ratio and NATS consumer lag.
 *
 * Config via env:
 *   VIRTUAL_USERS (default 50), DURATION_MS (default 15000)
 *   TARGET_BASE_URL (default http://localhost:9020) — set to http://localhost:8080 for the proxy
 */

const config = loadConfig(process.env);
const BASE = process.env.TARGET_BASE_URL ?? `http://localhost:${config.port}`;
const METRICS_URL = `http://localhost:${config.port}/metrics`;

const VIRTUAL_USERS = Number(process.env.VIRTUAL_USERS ?? 50);
const DURATION_MS = Number(process.env.DURATION_MS ?? 15000);
const P95_TARGET_MS = 1500;

const latencies: number[] = [];
let requests = 0;
const errorsByStatus = new Map<string, number>();

function pct(p: number): number {
  if (!latencies.length) return 0;
  latencies.sort((a, b) => a - b);
  return latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];
}

async function readMetrics(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const res = await fetch(METRICS_URL);
    const text = await res.text();
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.lastIndexOf(" ");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const value = Number(line.slice(idx + 1));
      if (!Number.isNaN(value)) out.set(key, value);
    }
  } catch {
    // metrics unavailable — the resource report degrades to the counters we already have
  }
  return out;
}

const metric = (m: Map<string, number>, key: string): number => m.get(key) ?? 0;

async function main() {
  let productIds: string[] = [];
  try {
    const res = await fetch(`${BASE}/v1/products?limit=12`);
    const data = (await res.json()) as { products?: { id: string }[] };
    productIds = (data.products ?? []).map((p) => p.id);
  } catch {
    // product detail endpoints are skipped if the list fails
  }

  const endpoints: (() => Promise<Response>)[] = [
    () => fetch(`${BASE}/health`),
    () => fetch(`${BASE}/v1/collections/new_arrivals`),
    () => fetch(`${BASE}/v1/products?limit=20`),
    ...(productIds.length
      ? productIds.slice(0, 6).map((id) => () => fetch(`${BASE}/v1/products/${id}`))
      : []),
  ];

  const before = await readMetrics();
  const endTime = Date.now() + DURATION_MS;

  async function worker() {
    let i = 0;
    while (Date.now() < endTime) {
      const fn = endpoints[i % endpoints.length];
      i++;
      const start = Date.now();
      try {
        const res = await fn();
        if (!res.ok) {
          errorsByStatus.set(String(res.status), (errorsByStatus.get(String(res.status)) ?? 0) + 1);
        }
      } catch (e) {
        const key = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
        errorsByStatus.set(key, (errorsByStatus.get(key) ?? 0) + 1);
      }
      requests++;
      latencies.push(Date.now() - start);
    }
  }

  console.log(
    `Load test: ${VIRTUAL_USERS} virtual users, ${DURATION_MS}ms, ${endpoints.length} endpoints, p95 target ${P95_TARGET_MS}ms`,
  );
  console.log(`Target: ${BASE}`);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: VIRTUAL_USERS }, () => worker()));
  const elapsed = (Date.now() - t0) / 1000;
  const after = await readMetrics();

  const errors = [...errorsByStatus.values()].reduce((a, b) => a + b, 0);
  const rps = requests / elapsed;
  const errRate = requests ? (errors / requests) * 100 : 0;
  const p50 = pct(0.5);
  const p95 = pct(0.95);
  const p99 = pct(0.99);

  console.log(`\nRequests: ${requests} in ${elapsed.toFixed(1)}s (${rps.toFixed(1)} rps)`);
  console.log(`Errors: ${errors} (${errRate.toFixed(2)}%)`);
  if (errorsByStatus.size) {
    console.log(`Error breakdown: ${[...errorsByStatus.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  console.log(`Latency p50=${p50}ms p95=${p95}ms p99=${p99}ms max=${latencies[latencies.length - 1] ?? 0}ms`);

  // Resource profile (from /metrics).
  const hits = metric(after, "buildkart_offer_cache_hits_total") - metric(before, "buildkart_offer_cache_hits_total");
  const misses = metric(after, "buildkart_offer_cache_misses_total") - metric(before, "buildkart_offer_cache_misses_total");
  const hitRatio = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;
  const cpu = metric(after, "buildkart_process_cpu_percent");
  const rss = metric(after, "buildkart_process_rss_mb");
  const poolWaiting =
    metric(after, 'buildkart_pg_pool_waiting{store="reservation"}') +
    metric(after, 'buildkart_pg_pool_waiting{store="event"}') +
    metric(after, 'buildkart_pg_pool_waiting{store="correlation"}');
  const poolTotal =
    metric(after, 'buildkart_pg_pool_total{store="reservation"}') +
    metric(after, 'buildkart_pg_pool_total{store="event"}') +
    metric(after, 'buildkart_pg_pool_total{store="correlation"}');

  console.log("\nResource profile (from /metrics):");
  console.log(`  process cpu=${cpu.toFixed(2)}% rss=${rss.toFixed(1)}MB heap=${metric(after, "buildkart_process_heap_used_mb").toFixed(1)}MB`);
  console.log(`  offer cache: entries=${metric(after, "buildkart_offer_cache_entries")} hits=${hits} misses=${misses} hit_ratio=${hitRatio.toFixed(1)}%`);
  console.log(`  pg pools: total_connections=${poolTotal} waiting=${poolWaiting}`);
  console.log(
    `  nats lag: mercur-allocation=${metric(after, 'buildkart_nats_consumer_lag{consumer="mercur-allocation"}')} ` +
      `tryton-reservation=${metric(after, 'buildkart_nats_consumer_lag{consumer="tryton-reservation"}')} ` +
      `reconciliation-tracker=${metric(after, 'buildkart_nats_consumer_lag{consumer="reconciliation-tracker"}')}`,
  );

  const p95Pass = p95 <= P95_TARGET_MS;
  console.log(`\np95 <= ${P95_TARGET_MS}ms: ${p95Pass ? "PASS" : "FAIL"} (${p95}ms)`);
  console.log(`Achieved ${rps.toFixed(1)} rps (PS-10 peak 20-30 rps)`);

  process.exit(p95Pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
