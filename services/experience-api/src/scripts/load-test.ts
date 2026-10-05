import { loadConfig } from "../config.js";

/**
 * E-017-008 load evidence: drive the staging Experience API and report throughput, latency and
 * error breakdown against the PS-10 targets (100 CCU, 20-30 rps, p95 <= 1.5s).
 *
 * The staging stack runs `medusa develop` (single-threaded dev server), so this measures the
 * dev-mode profile and flags the gap to the production-shaped deployment.
 *
 * Config via env: VIRTUAL_USERS (default 50), DURATION_MS (default 15000).
 */

const config = loadConfig(process.env);
const BASE = `http://localhost:${config.port}`;

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
  const t0 = Date.now();
  await Promise.all(Array.from({ length: VIRTUAL_USERS }, () => worker()));
  const elapsed = (Date.now() - t0) / 1000;

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

  const p95Pass = p95 <= P95_TARGET_MS;
  console.log(`\np95 <= ${P95_TARGET_MS}ms: ${p95Pass ? "PASS" : "FAIL"} (${p95}ms)`);
  console.log(`Achieved ${rps.toFixed(1)} rps (PS-10 peak 20-30 rps)`);

  process.exit(p95Pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
