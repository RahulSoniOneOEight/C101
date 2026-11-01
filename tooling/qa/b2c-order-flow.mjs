/**
 * QC — B2C order flow, end to end, against staging.
 *
 * Places a real staging order: search → PDP → cart (delivery fee) → checkout
 * (address + fee) → order → confirmation, and asserts the money at each step.
 *
 * Usage (from the repo root):
 *   node tooling/qa/b2c-order-flow.mjs
 *   node tooling/qa/b2c-order-flow.mjs --out=some/dir
 *
 * Requires `playwright-core` plus an installed Edge/Chrome channel.
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

const BASE = "https://buildkart-staging.web.app";
const ACCOUNT = "rsoni001@gmail.com";
const OTP = "123456";
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT = path.resolve(
  outArg ? outArg.slice("--out=".length) : "client-projects/client101/evidence/qc/screenshots",
);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") =>
  results.push({ name, ok: !!ok, detail: String(detail) });

async function login(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(9000);
  await page.locator("flt-semantics-placeholder").evaluate((el) => el.click());
  await page.waitForTimeout(2500);
  await page.getByText("Get Started").click();
  await page.waitForTimeout(3000);
  await page.locator('input[aria-label="Pilot email or 10-digit phone"]').fill(ACCOUNT);
  await page.getByText("Get OTP").click();
  await page.waitForTimeout(3000);
  await page.locator('input[aria-label="••••••"]').fill(OTP);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForTimeout(9000);
}

const body = async (page) =>
  (await page.locator("body").innerText()).replace(/\n/g, " | ");

/** Opens the cart from the bottom navigation (the badge prefixes its name). */
async function openCart(page) {
  const badged = page.getByRole("button", { name: /^\d+\s+Cart$/ });
  if (await badged.count()) {
    await badged.last().click();
    return;
  }
  await page.getByRole("button", { name: "Cart", exact: true }).last().click();
}

/** Polls the page text so an assertion waits for the route/async render. */
async function waitForBody(page, regex, timeoutMs = 15000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    last = await body(page);
    if (regex.test(last)) return last;
    await page.waitForTimeout(400);
  }
  return last;
}

/** Reads the Subtotal … Total block of the cart/checkout summary. */
function summary(raw) {
  const i = raw.lastIndexOf("Subtotal");
  if (i < 0) return null;
  const block = raw.slice(i);
  const grab = (label) => {
    const m = block.match(new RegExp(`${label}\\s*\\|?\\s*([^|]+?)\\s*(?:\\||$)`));
    return m ? m[1].trim() : null;
  };
  // The retail cart labels the fee row "Delivery" on the card and "Shipping"
  // inside the money summary; accept either.
  return {
    raw: block.slice(0, 220),
    subtotal: grab("Subtotal"),
    discount: grab("Discount"),
    delivery: grab("Delivery") ?? grab("Shipping"),
    total: grab("Total"),
  };
}

const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `b2c_qc_${name}.png`), fullPage: false });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const consoleErrors = [];
const httpErrors = [];
const completions = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", async (r) => {
  if (r.status() >= 400)
    httpErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  if (r.request().method() === "POST" && r.url().includes("/complete")) {
    try {
      completions.push(await r.json());
    } catch {
      /* non-JSON response */
    }
  }
});

try {
  await login(page);
  check("B2C session established", (await body(page)).includes("BuildKart"));

  // 1. Search → PDP
  await page.getByRole("button", { name: "Search products" }).click();
  await page.waitForTimeout(5000);
  await page.keyboard.type("cement");
  await page.waitForTimeout(6000);
  let opened = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: /Wonder Cement/ }).first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const text = await body(page);
    if (/Add to Cart/i.test(text) && /SKU/i.test(text)) {
      opened = true;
      break;
    }
  }
  check("Search result opens the PDP", opened, (await body(page)).slice(0, 160));
  await shot(page, "01_pdp");

  // 2. Add to cart
  await page.getByRole("button", { name: /Add to Cart/i }).first().click();
  const added = await waitForBody(page, /Added|added to cart/i, 6000);
  check("Add to cart confirms", /Added|added to cart/i.test(added), added.slice(0, 120));

  // 3. Cart. Flutter exposes the line and the money summary as aria-labels.
  // The fee resolves asynchronously from the saved address, so wait for it.
  await openCart(page);
  await page
    .locator('[aria-label*="Wonder Cement"]')
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  check("Cart shows the line", true);
  let cartSummary = "";
  for (let i = 0; i < 40; i++) {
    cartSummary =
      (await page.locator('[aria-label*="Subtotal"]').first().getAttribute("aria-label")) ?? "";
    if (/Shipping\s*\n?\s*₹99/.test(cartSummary)) break;
    await page.waitForTimeout(500);
  }
  check(
    "Cart resolves the delivery fee",
    /Shipping\s*\n?\s*₹99/.test(cartSummary),
    cartSummary.replace(/\n/g, " "),
  );
  check(
    "Cart total includes delivery",
    /Total\s*\n?\s*₹479/.test(cartSummary),
    cartSummary.replace(/\n/g, " "),
  );
  await shot(page, "02_cart");

  // 4. Checkout
  await page.getByRole("button", { name: /Continue checkout/i }).first().click();
  const checkout = await waitForBody(page, /Place order/, 15000);
  check(
    "Checkout opens with the sticky CTA",
    /Checkout/.test(checkout) && /Place order/.test(checkout),
    checkout.slice(0, 160),
  );
  check(
    "Checkout has the saved address",
    /Edit address/.test(checkout) && /Contact details from your account/.test(checkout),
  );
  // The sticky total carries the fee once the cart re-prices.
  let checkoutTotal = null;
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('[aria-label*="₹479"]').count()) > 0) {
      checkoutTotal = "479";
      break;
    }
    const m = checkout.match(/Total\s*\|?\s*₹([\d,.]+)/);
    if (m) checkoutTotal = m[1];
    if (checkoutTotal === "479") break;
    await page.waitForTimeout(500);
  }
  check(
    "Checkout shows the fee-inclusive total",
    checkoutTotal === "479",
    checkoutTotal,
  );
  await shot(page, "03_checkout");

  // 5. Place the order
  const place = page.getByRole("button", { name: /^Place order$/ }).first();
  await place.waitFor({ state: "visible", timeout: 20000 });
  await place.click({ timeout: 20000 });
  let confirm = await waitForBody(page, /Order Confirmed|Order placed successfully/, 20000);
  if (!/Order Confirmed|Order placed successfully/.test(confirm)) {
    // One retry: the sticky bar can re-render just as the tap lands.
    await place.click({ timeout: 20000 }).catch(() => {});
    confirm = await waitForBody(page, /Order Confirmed|Order placed successfully/, 20000);
  }
  const reference = (confirm.match(/BK-\d{6}-[A-Z0-9]+/) || [null])[0];
  check("Order confirmed", /Order confirmed|Thank you/i.test(confirm), confirm.slice(0, 200));
  check("Confirmation returns a BK reference", !!reference, reference);
  await shot(page, "04_confirmation");

  const completion = completions[completions.length - 1];
  check(
    "Completion response carries the order group",
    !!completion?.order_group?.id,
    completion?.order_group?.id ?? "none",
  );
  check(
    "Completion total matches the checkout total",
    !!completion?.total_minor && !!checkoutTotal &&
      completion.total_minor === Math.round(Number(checkoutTotal.replace(/,/g, "")) * 100),
    `${completion?.total_minor} vs ₹${checkoutTotal}`,
  );

  check("No console or page errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" / "));
  check("No HTTP 4xx/5xx responses", httpErrors.length === 0, httpErrors.slice(0, 3).join(" / "));

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(
    path.join(OUT, "b2c_qc_results.json"),
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        account: ACCOUNT,
        order_reference: reference,
        checkout,
        checkout_total: checkoutTotal,
        results,
        passed: results.length - failed.length,
        failed: failed.length,
      },
      null,
      2,
    ),
  );
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  console.log(`\nORDER_REF ${reference}`);
  console.log(`TOTAL ${results.length} PASS ${results.length - failed.length} FAIL ${failed.length}`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await browser.close();
}
