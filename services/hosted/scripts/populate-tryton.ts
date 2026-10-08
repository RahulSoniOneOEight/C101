/**
 * Populate Tryton: sync offer SKUs as products, then create ERP reservations for seeded carts.
 * Usage: bun populate-tryton.ts <carts.json>
 */
import { readFileSync } from "node:fs";

const API = "https://api-staging.pinakaplay.cloud";
const OPS = "https://ops-staging.pinakaplay.cloud";
const CARTS = process.argv[2] ?? "carts.json";

type Json = Record<string, any>;

async function api(base: string, path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(base + path, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: Json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 160) }; }
  return { status: res.status, json };
}

async function login(email: string): Promise<string> {
  const ch = await api(API, "/v1/auth/otp/challenges", { method: "POST", body: { identifier: email } });
  const vf = await api(API, "/v1/auth/otp/verify", { method: "POST", body: { challenge_id: ch.json.challenge_id, code: "123456" } });
  if (vf.status !== 200) throw new Error(`login ${email} -> ${vf.status}`);
  return String(vf.json.session_token);
}

// 1. Load offers (sku + product title + price)
const list = await api(API, "/v1/products?limit=100");
const offers: { sku: string; title: string; price: number }[] = [];
for (const p of list.json.products ?? []) {
  const d = await api(API, `/v1/products/${p.id}`);
  for (const o of d.json.offers ?? []) {
    offers.push({ sku: o.sku, title: p.title, price: o.unit_amount_minor ?? 0 });
  }
}
const unique = [...new Map(offers.map((o) => [o.sku, o])).values()].slice(0, 40);
console.log(`offers=${offers.length} unique syncing=${unique.length}`);

// 2. Sync variants to Tryton (ERP operator, operator host)
const erpToken = await login("erp.ops01@buildkart.test");
let synced = 0;
for (const o of unique) {
  const r = await api(OPS, "/v1/admin/tryton/variants", { method: "POST", token: erpToken, body: { sku: o.sku, name: o.title, price: o.price } });
  if (r.status < 300) synced++; else console.log(`  sync FAIL ${o.sku} -> ${r.status} ${JSON.stringify(r.json).slice(0, 100)}`);
}
console.log(`synced variants: ${synced}/${unique.length}`);

// 3. Create reservations per cart (as the owning customer)
const carts: { cart: string; owner: string }[] = JSON.parse(readFileSync(CARTS, "utf8"));
const emailById: Record<string, string> = {
  pilot_customer_b2c01: "rsoni001@gmail.com",
  pilot_customer_b2c02: "rs.jgd108@gmail.com",
};
const tokens: Record<string, string> = {};
async function tokenFor(email: string) {
  if (!tokens[email]) tokens[email] = await login(email);
  return tokens[email];
}

let ok = 0, fail = 0;
for (const c of carts) {
  const email = emailById[c.owner];
  if (!email) continue;
  const sku = unique[Math.floor(Math.random() * unique.length)].sku;
  const quantity = 1 + Math.floor(Math.random() * 2);
  try {
    const t = await tokenFor(email);
    const r = await api(API, `/v1/checkouts/${c.cart}/reserve`, { method: "POST", token: t, body: { sku, quantity } });
    if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(r.json).slice(0, 100)}`);
    ok++;
  } catch (e) {
    fail++;
    if (fail <= 3) console.log(`  reserve FAIL ${c.cart}: ${(e as Error).message}`);
  }
}
console.log(`reservations: ok=${ok} fail=${fail}`);
