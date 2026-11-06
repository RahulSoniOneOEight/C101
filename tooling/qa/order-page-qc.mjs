/**
 * QC — order detail pages in the admin and seller consoles.
 *
 * Opens the B2C (#191, ₹479) and B2B (#192, ₹764) staging orders that the app
 * QC flows produced, checks the operational panels (payment, delivery, returns,
 * refund, summary, customer) and records console/page errors.
 *
 * Usage (from the repo root):
 *   ADMIN_PASSWORD=... node tooling/qa/order-page-qc.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  console.error("playwright-core not found (set NODE_PATH to a node_modules that has it).");
  process.exit(1);
}

const BASE = "https://ops-staging.pinakaplay.cloud";
const ADMIN = { email: "admin@buildkart.test", password: process.env.ADMIN_PASSWORD };
const SELLER = {
  email: process.env.SELLER_EMAIL ?? "powermax@mercur.dev",
  password: process.env.SELLER_PASSWORD ?? "supersecret",
};
const ORDERS = {
  b2c: { id: "order_01M6CBBFHCVPWZC8SP0Y1ADA9C", label: "#191 · ₹479 · rsoni001@gmail.com" },
  b2b: { id: "order_01M6CBX2FK40Q0VTM8VK5M4F9B", label: "#192 · ₹764 · buyer.b2b01@buildkart.test" },
};
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT = path.resolve(
  outArg ? outArg.slice("--out=".length) : "client-projects/client101/evidence/qc/screenshots",
);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") =>
  results.push({ name, ok: !!ok, detail: String(detail) });
// Flutter/React tables separate labels and values with layout newlines; collapse
// all whitespace so the assertions can read "Label value" pairs.
const body = async (page) =>
  (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `order_page_${name}.png`), fullPage: false });

async function login(page, pathname, email, password) {
  await page.goto(`${BASE}${pathname}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForTimeout(9000);
}

async function openOrder(page, port, id) {
  await page.goto(`${BASE}/${port}/orders/${id}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(6000);
  return body(page);
}

const browser = await chromium.launch({ channel: "msedge", headless: true });

// ------------------------------------------------------------------ admin
const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const adminErrors = [];
admin.on("pageerror", (e) => adminErrors.push(String(e)));
admin.on("console", (m) => m.type() === "error" && adminErrors.push(m.text()));
await login(admin, "/dashboard/login", ADMIN.email, ADMIN.password);
adminErrors.length = 0;

const a191 = await openOrder(admin, "dashboard", ORDERS.b2c.id);
check("Admin #191 opens", /#191/.test(a191));
check("Admin #191 origin is the B2C storefront", /from B2C Storefront/.test(a191));
check(
  "Admin #191 payment is authorized for the order total",
  /Authorized/.test(a191) && /₹479\.00/.test(a191) && /OUTSTANDING\s*₹479\.00/.test(a191),
);
check("Admin #191 returns/refund are clear", /No return requested/.test(a191) && /No refund issued/.test(a191));
check(
  "Admin #191 summary reconciles",
  /Wonder Cement/.test(a191) &&
    /Item Subtotal\s*₹400\.00/.test(a191) &&
    /Shipping Subtotal\s*₹99\.00/.test(a191) &&
    /Discount Total\s*₹20\.00/.test(a191) &&
    /Total After Discount\s*₹479\.00/.test(a191),
);
check("Admin #191 customer contact", /rsoni001@gmail\.com/.test(a191) && /\+91 98765 43210/.test(a191));
check("Admin #191 delivery is booked", /Delivery/.test(a191) && /Booked/.test(a191) && /0 of 1 units/.test(a191));
await shot(admin, "admin_191_top");

// Jump to the money + delivery sections and capture them.
await admin.getByText("Payments", { exact: true }).first().click();
await admin.waitForTimeout(1500);
await shot(admin, "admin_191_payments");
await admin.getByText("Delivery", { exact: true }).first().click();
await admin.waitForTimeout(1500);
await shot(admin, "admin_191_delivery");

const a192 = await openOrder(admin, "dashboard", ORDERS.b2b.id);
check("Admin #192 opens", /#192/.test(a192));
check(
  "Admin #192 is flagged as a B2B trade order",
  /B2B trade/.test(a192) && /business_arjun_traders/.test(a192),
);
check(
  "Admin #192 summary reconciles",
  /₹700\.00/.test(a192) &&
    /Shipping Subtotal\s*₹99\.00/.test(a192) &&
    /Discount Total\s*₹35\.00/.test(a192) &&
    /Total After Discount\s*₹764\.00/.test(a192),
);
check(
  "Admin #192 payment matches the total",
  /AUTHORIZED/.test(a192) && /₹764\.00/.test(a192) && /OUTSTANDING\s*₹764\.00/.test(a192),
);
check("Admin #192 customer is the business buyer", /buyer\.b2b01@buildkart\.test/.test(a192));
check("Admin #192 delivery is booked for 2 units", /0 of 2 units/.test(a192));
const b2bOriginIsB2C = /from B2C Storefront/.test(a192);
await shot(admin, "admin_192_top");
// Capture the dated header that carries the origin label.
await admin.getByText("Summary", { exact: true }).first().click();
await admin.waitForTimeout(1500);
await shot(admin, "admin_192_summary");
check("Admin has no page/console errors", adminErrors.length === 0, adminErrors.slice(0, 3).join(" / "));

// ----------------------------------------------------------------- seller
const seller = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const sellerErrors = [];
seller.on("pageerror", (e) => sellerErrors.push(String(e)));
seller.on("console", (m) => m.type() === "error" && sellerErrors.push(m.text()));
await login(seller, "/seller/login", SELLER.email, SELLER.password);
if (/Select a store/.test(await body(seller))) {
  await seller.getByText("PowerMax Depot").first().click();
  await seller.waitForTimeout(7000);
}
sellerErrors.length = 0;

const s191 = await openOrder(seller, "seller", ORDERS.b2c.id);
check("Seller #191 opens", /#191/.test(s191));
check(
  "Seller #191 is seller-scoped for payments",
  /Payment and refunds are managed by BuildKart Admin/.test(s191),
);
check(
  "Seller #191 summary reconciles",
  /Wonder Cement/.test(s191) &&
    /Item Total\s*₹380\.00/.test(s191) &&
    /Shipping Total\s*₹99\.00/.test(s191) &&
    /FLAT5/.test(s191) &&
    /Order Total\s*₹\s*479\.00 INR/.test(s191),
);
check("Seller #191 customer contact", /rsoni001@gmail\.com/.test(s191));
check("Seller #191 delivery is booked", /Booked/.test(s191) && /0 of 1 units/.test(s191));
await shot(seller, "seller_191_top");

const s192 = await openOrder(seller, "seller", ORDERS.b2b.id);
check("Seller #192 opens", /#192/.test(s192));
check(
  "Seller #192 shows the trade price against the list price",
  /₹400\.00₹350\.00/.test(s192),
);
check(
  "Seller #192 summary reconciles",
  /Item Total\s*₹665\.00/.test(s192) &&
    /Shipping Total\s*₹99\.00/.test(s192) &&
    /Order Total\s*₹\s*764\.00 INR/.test(s192),
);
check("Seller #192 customer is the business buyer", /buyer\.b2b01@buildkart\.test/.test(s192));
check("Seller #192 delivery is booked for 2 units", /0 of 2 units/.test(s192));
await shot(seller, "seller_192_top");
check("Seller has no page/console errors", sellerErrors.length === 0, sellerErrors.slice(0, 3).join(" / "));

await browser.close();

const failed = results.filter((r) => !r.ok);
const payload = {
  captured_at: new Date().toISOString(),
  orders: ORDERS,
  findings: [
    {
      id: "OP-1",
      finding: "Admin/seller order header labels a B2B order 'from B2C Storefront'",
      observed: b2bOriginIsB2C,
      why: "Medusa stores every order on the single publishable-key sales channel; B2B is carried in cart/order metadata. The Channel panel says B2B trade, the header does not.",
      recommendation: "Render the origin label from order metadata channel (b2b → 'B2B Trade Portal') while keeping the sales-channel name as the technical field.",
    },
  ],
  results,
  passed: results.length - failed.length,
  failed: failed.length,
};
fs.writeFileSync(path.join(OUT, "order_page_qc_results.json"), JSON.stringify(payload, null, 2));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\nFINDINGS ${payload.findings.map((f) => f.id).join(", ")}`);
console.log(`TOTAL ${results.length} PASS ${results.length - failed.length} FAIL ${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
