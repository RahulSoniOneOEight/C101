/**
 * Seed staging orders through the real Experience API checkout flow.
 * Usage: bun seed-orders.ts <count> <customerEmail> <sellerName>
 */
const BASE = process.env.BASE ?? "https://api-staging.pinakaplay.cloud";

type Json = Record<string, any>;

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: Json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function login(email: string): Promise<string> {
  const ch = await api("/v1/auth/otp/challenges", { method: "POST", body: { identifier: email } });
  if (ch.status !== 201) throw new Error(`challenge ${ch.status}: ${JSON.stringify(ch.json)}`);
  const vf = await api("/v1/auth/otp/verify", {
    method: "POST",
    body: { challenge_id: ch.json.challenge_id, code: "123456" },
  });
  if (vf.status !== 200) throw new Error(`verify ${vf.status}`);
  return String(vf.json.session_token);
}

async function loadOffers() {
  const list = await api("/v1/products?limit=100");
  const products: any[] = list.json.products ?? [];
  const offers: { offer_id: string; seller_id: string; seller_name: string; sku: string; price: number; product_id: string }[] = [];
  for (const p of products) {
    const d = await api(`/v1/products/${p.id}`);
    for (const o of d.json.offers ?? []) {
      offers.push({
        offer_id: o.id,
        seller_id: o.seller_id,
        seller_name: o.seller_name,
        sku: o.sku,
        price: o.unit_amount_minor ?? 0,
        product_id: p.id,
      });
    }
  }
  return offers;
}

const [countArg, email, sellerName] = process.argv.slice(2);
const count = Number(countArg ?? 1);
if (!count || !email || !sellerName) { console.error("usage: seed-orders.ts <count> <email> <sellerName>"); process.exit(2); }

const token = await login(email);
const all = await loadOffers();
const pool = all.filter((o) => o.seller_name === sellerName);
console.log(`offers total=${all.length} for seller "${sellerName}"=${pool.length}`);
if (!pool.length) { console.error("no offers for that seller"); process.exit(2); }

let ok = 0, fail = 0;
for (let i = 0; i < count; i++) {
  const offer = pool[Math.floor(Math.random() * pool.length)];
  const qty = 1 + Math.floor(Math.random() * 3);
  try {
    const cart = await api("/v1/carts", { method: "POST", token, body: {} });
    const cartId = cart.json.id;
    if (!cartId) throw new Error(`cart ${cart.status} ${JSON.stringify(cart.json).slice(0, 120)}`);

    const line = await api(`/v1/carts/${cartId}/lines`, { method: "POST", token, body: { offer_id: offer.offer_id, quantity: qty } });
    if (line.status >= 300) throw new Error(`line ${line.status} ${JSON.stringify(line.json).slice(0, 120)}`);

    const details = await api(`/v1/carts/${cartId}/customer-details`, {
      method: "POST", token,
      body: {
        email,
        shipping_address: {
          first_name: "Pilot", last_name: "Tester",
          address_1: "12 Industrial Estate Road", city: "Bengaluru",
          postal_code: "560001", country_code: "in",
        },
      },
    });
    if (details.status >= 300) throw new Error(`details ${details.status} ${JSON.stringify(details.json).slice(0, 120)}`);

    const optsRes = await api(`/v1/carts/${cartId}/shipping-options`, { token });
    const options: any[] = optsRes.json.shipping_options ?? [];
    const option = options.find((o) => o.seller_id === offer.seller_id) ?? options[0];
    if (!option) throw new Error("no shipping option");

    const method = await api(`/v1/carts/${cartId}/shipping-methods`, { method: "POST", token, body: { option_id: option.id } });
    if (method.status >= 300) throw new Error(`method ${method.status} ${JSON.stringify(method.json).slice(0, 120)}`);

    const done = await api(`/v1/checkouts/${cartId}/complete`, { method: "POST", token });
    if (done.status >= 300) throw new Error(`complete ${done.status} ${JSON.stringify(done.json).slice(0, 140)}`);

    ok++;
    if (i % 5 === 0 || i === count - 1) console.log(`  ${i + 1}/${count} ok=${ok} fail=${fail}`);
  } catch (e) {
    fail++;
    console.log(`  ${i + 1}/${count} FAIL: ${(e as Error).message}`);
  }
}
console.log(`DONE seller=${sellerName} customer=${email} ok=${ok} fail=${fail}`);
