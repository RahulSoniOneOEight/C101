const API = "https://api-staging.pinakaplay.cloud";
type J = Record<string, any>;
async function api(path: string, o: { method?: string; token?: string; body?: unknown } = {}) {
  const r = await fetch(API + path, {
    method: o.method ?? "GET",
    headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(o.body ? { "content-type": "application/json" } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const t = await r.text();
  let j: J = {}; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t.slice(0, 160) }; }
  return { status: r.status, json: j };
}
async function login(email: string) {
  const c = await api("/v1/auth/otp/challenges", { method: "POST", body: { identifier: email } });
  const v = await api("/v1/auth/otp/verify", { method: "POST", body: { challenge_id: c.json.challenge_id, code: "123456" } });
  return String(v.json.session_token);
}

const cases: [string, string][] = [["B2B", "buyer.b2b01@buildkart.test"], ["B2C", "rsoni001@gmail.com"]];
for (const [who, email] of cases) {
  const token = await login(email);
  const list = await api("/v1/products?limit=1", { token });
  const p = list.json.products[0];
  const detail = await api(`/v1/products/${p.id}`, { token });
  const offer = detail.json.offers[0];
  const cart = await api("/v1/carts", { method: "POST", token, body: {} });
  const cartId = cart.json.id;
  const line = await api(`/v1/carts/${cartId}/lines`, { method: "POST", token, body: { offer_id: offer.id, quantity: 1 } });
  const item = line.json.items?.[0];
  await api(`/v1/carts/${cartId}/customer-details`, { method: "POST", token, body: { email, shipping_address: { first_name: "Pilot", last_name: "T", address_1: "12 Road", city: "Bengaluru", postal_code: "560001", country_code: "in" } } });
  const opts = (await api(`/v1/carts/${cartId}/shipping-options`, { token })).json.shipping_options ?? [];
  const opt = opts.find((x: J) => x.seller_id === offer.seller_id) ?? opts[0];
  if (opt) await api(`/v1/carts/${cartId}/shipping-methods`, { method: "POST", token, body: { option_id: opt.id } });
  const done = await api(`/v1/checkouts/${cartId}/complete`, { method: "POST", token });

  console.log(`${who} (${email})  channel=${list.json.channel}/${cart.json.channel}`);
  console.log(`  product best_price : list=${offer.list_amount_minor} selling=${offer.selling_amount_minor} discount=${offer.discount_minor} (${offer.discount_percent}%) source=${offer.price_source}`);
  console.log(`  cart line          : unit_price=${item?.unit_price}  total=${item?.total}`);
  console.log(`  checkout           : ${done.status} type=${done.json.type}  cart=${cartId}`);
}
