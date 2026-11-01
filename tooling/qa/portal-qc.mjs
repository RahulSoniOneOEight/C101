/**
 * QC — admin and seller portals (Mercur/Medusa dashboards) against staging.
 *
 * Signs in to both consoles, opens the operational pages an operator uses for
 * orders, products and delivery rates, and records console/page errors.
 *
 * Usage (from the repo root):
 *   ADMIN_PASSWORD=... node tooling/qa/portal-qc.mjs
 *   ADMIN_PASSWORD=... node tooling/qa/portal-qc.mjs --out=some/dir
 *
 * Requires `playwright-core` and an installed Edge/Chrome channel. The seller
 * password defaults to the seeded staging vendor account.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  console.error(
    "playwright-core not found. Install it here or set NODE_PATH to a node_modules that has it.",
  );
  process.exit(1);
}

const BASE = "https://ops-staging.pinakaplay.cloud";
const ADMIN = { email: "admin@buildkart.test", password: process.env.ADMIN_PASSWORD };
const SELLER = {
  email: process.env.SELLER_EMAIL ?? "buildmaster@mercur.dev",
  password: process.env.SELLER_PASSWORD ?? "supersecret",
};
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT = path.resolve(
  outArg ? outArg.slice("--out=".length) : "client-projects/client101/evidence/qc/screenshots",
);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") =>
  results.push({ name, ok: !!ok, detail: String(detail) });
const body = async (page) =>
  (await page.locator("body").innerText()).replace(/\n/g, " | ");
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `portal_${name}.png`), fullPage: false });

async function login(page, pathname, email, password) {
  await page.goto(`${BASE}${pathname}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForTimeout(9000);
}

async function rows(page) {
  return page.locator("table tbody tr").count();
}

const browser = await chromium.launch({ channel: "msedge", headless: true });

// ---------------------------------------------------------------- admin
const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const adminErrors = [];
admin.on("pageerror", (e) => adminErrors.push(String(e)));
admin.on("console", (m) => m.type() === "error" && adminErrors.push(m.text()));
await login(admin, "/dashboard/login", ADMIN.email, ADMIN.password);
adminErrors.length = 0; // pre-login 401s are expected

check("Admin sign-in lands on Orders", /\/dashboard\/orders/.test(admin.url()), admin.url());
check(
  "Admin navigation is complete",
  /Orders/.test(await body(admin)) && /Delivery rates/.test(await body(admin)),
);
const adminOrderRows = await rows(admin);
check("Admin orders list has rows", adminOrderRows > 0, `${adminOrderRows} rows`);
await shot(admin, "admin_orders");

// The QC order placed minutes ago must be visible to the operator. The row
// opens on click in the console UI, but the money is the reconciliation signal.
const adminOrders = await body(admin);
check(
  "Admin sees the B2C QC order (₹479)",
  /₹\s?479\.00/.test(adminOrders),
  adminOrders.slice(0, 220),
);

await admin.goto(`${BASE}/dashboard/products`, { waitUntil: "networkidle", timeout: 60000 });
await admin.waitForTimeout(5000);
const adminProductRows = await rows(admin);
check("Admin products list has rows", adminProductRows > 0, `${adminProductRows} rows`);
await shot(admin, "admin_products");

if (adminProductRows > 0) {
  await admin.locator("table tbody tr").first().click();
  await admin.waitForTimeout(6000);
  const studio = await body(admin);
  check(
    "Admin Product Studio opens",
    /Product Studio|Edit product/i.test(studio) && /\/product-studio\//.test(admin.url()),
    admin.url(),
  );
  await shot(admin, "admin_product_studio");
}

for (const [name, pathname, marker] of [
  ["delivery_rates", "/dashboard/delivery-rates", /Delivery rates/],
  ["shipments", "/dashboard/shipments", /Shipments/],
]) {
  await admin.goto(`${BASE}${pathname}`, { waitUntil: "networkidle", timeout: 60000 });
  await admin.waitForTimeout(5000);
  check(`Admin ${name} renders`, marker.test(await body(admin)));
  await shot(admin, `admin_${name}`);
}
check("Admin has no page/console errors", adminErrors.length === 0, adminErrors.slice(0, 3).join(" / "));

// --------------------------------------------------------------- seller
const seller = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const sellerErrors = [];
seller.on("pageerror", (e) => sellerErrors.push(String(e)));
seller.on("console", (m) => m.type() === "error" && sellerErrors.push(m.text()));
await login(seller, "/seller/login", SELLER.email, SELLER.password);
sellerErrors.length = 0;

const select = await body(seller);
check("Seller sign-in shows the store picker", /Select a store/.test(select), select.slice(0, 120));
if (/Select a store/.test(select)) {
  await seller.getByText("BuildMaster Supplies").first().click();
  await seller.waitForTimeout(7000);
}
check("Seller store opens", /BuildMaster Supplies/.test(await body(seller)), seller.url());

const sellerOrderRows = await rows(seller);
check("Seller orders list has rows", sellerOrderRows > 0, `${sellerOrderRows} rows`);
await shot(seller, "seller_orders");

if (sellerOrderRows > 0) {
  await seller.locator("table tbody tr").first().click();
  await seller.waitForTimeout(5000);
  check(
    "Seller order detail opens",
    /\/seller\/orders\//.test(seller.url()) && /Order/.test(await body(seller)),
    seller.url(),
  );
  await shot(seller, "seller_order_detail");
}

await seller.goto(`${BASE}/seller/products`, { waitUntil: "networkidle", timeout: 60000 });
await seller.waitForTimeout(5000);
const sellerProducts = await body(seller);
check(
  "Seller catalogue renders",
  /Products/.test(sellerProducts) && /Create a product|Product Studio/i.test(sellerProducts),
);
await shot(seller, "seller_products");

await seller.goto(`${BASE}/seller/delivery-rates`, { waitUntil: "networkidle", timeout: 60000 });
await seller.waitForTimeout(5000);
check("Seller delivery rates render", /Your pincodes only/.test(await body(seller)));
await shot(seller, "seller_delivery_rates");
check("Seller has no page/console errors", sellerErrors.length === 0, sellerErrors.slice(0, 3).join(" / "));

await browser.close();

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(
  path.join(OUT, "portal_qc_results.json"),
  JSON.stringify({ captured_at: new Date().toISOString(), results, passed: results.length - failed.length, failed: failed.length }, null, 2),
);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\nTOTAL ${results.length} PASS ${results.length - failed.length} FAIL ${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
