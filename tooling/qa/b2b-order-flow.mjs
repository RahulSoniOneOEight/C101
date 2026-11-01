/**
 * QC — B2B order flow, end to end, against staging.
 *
 * Places a real staging business order: trade PDP → quotation cart → business
 * checkout (delivery fee resolved before placement) → order → order history.
 *
 * Usage (from the repo root):
 *   node tooling/qa/b2b-order-flow.mjs
 *   node tooling/qa/b2b-order-flow.mjs --out=some/dir
 *
 * Requires `playwright-core` plus an installed Edge/Chrome channel. Writes one
 * screenshot per checkpoint and a results JSON into the output directory.
 * Exits 1 when any assertion fails.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

// `require` (not a static import) so NODE_PATH is honoured when playwright-core
// lives outside this repo.
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
const ACCOUNT = "buyer.b2b01@buildkart.test";
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
  await page.getByText("B2B Trade", { exact: true }).click();
  await page.waitForTimeout(2500);
  await page.locator('input[aria-label="Pilot email or 10-digit phone"]').fill(ACCOUNT);
  await page.getByText("Get OTP").click();
  await page.waitForTimeout(3000);
  await page.locator('input[aria-label="••••••"]').fill(OTP);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForTimeout(9000);
}

const body = async (page) =>
  (await page.locator("body").innerText()).replace(/\n/g, " | ");

/** Reads the Subtotal … Total block of the B2B cart/checkout summary. */
function summary(raw) {
  const i = raw.lastIndexOf("Subtotal");
  if (i < 0) return null;
  const block = raw.slice(i);
  const grab = (label) => {
    const m = block.match(new RegExp(`${label}\\s*\\|?\\s*([^|]+?)\\s*(?:\\||$)`));
    return m ? m[1].trim() : null;
  };
  return {
    raw: block.slice(0, 220),
    subtotal: grab("Subtotal"),
    discount: grab("Discount"),
    gst: grab("GST"),
    delivery: grab("Delivery"),
    total: grab("Total"),
  };
}

const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `b2b_qc_${name}.png`), fullPage: false });

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
  const home = await body(page);
  check("B2B session established", home.includes("BuildKart Trade"));

  // 1. Catalogue → trade PDP. Flutter can swallow the first tap while the grid
  // settles, so retry until the PDP is on screen.
  await page.getByRole("button", { name: "Search the trade catalogue" }).click();
  await page.waitForTimeout(7000);
  let pdp = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    await page
      .getByRole("button", { name: /Wonder Cement/ })
      .first()
      .click({ timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(5000);
    pdp = await body(page);
    if (/Add to Cart/i.test(pdp)) break;
  }
  check("Trade PDP shows the SKU", /SKU WON-PPC-DAN-01/.test(pdp));
  check("Trade PDP has Add to Cart", /Add to Cart/i.test(pdp));
  await shot(page, "01_pdp");

  // 2. Add one unit (the add routes to the quotation cart)
  await page.getByRole("button", { name: /Add to Cart/i }).first().click();
  await page.waitForTimeout(5000);
  const added = await body(page);
  check("Add lands on the quotation cart", /Quotation Cart|Your order/.test(added), added.slice(0, 160));
  if (!/Quotation Cart/.test(added)) {
    await page.getByRole("button", { name: /Cart/ }).last().click();
    await page.waitForTimeout(7000);
  }
  const cart = await body(page);
  const cartSum = summary(cart);
  check("Cart shows the added line", /Wonder Cement/.test(cart));
  check("Cart line has an explicit Remove", /Remove Wonder Cement/.test(cart));
  check("Cart keeps related products", /You may also like|See All/.test(cart));
  check("Cart subtotal ₹350", cartSum?.subtotal === "₹350", cartSum?.raw);
  check(
    "Delivery is not guessed before a site is chosen",
    cartSum?.delivery === "Calculated at checkout",
    cartSum?.delivery,
  );
  check("Cart total is goods-only ₹350", cartSum?.total === "₹350", cartSum?.total);
  await shot(page, "02_cart_before_site");

  // 3. Checkout without a site
  await page.getByRole("button", { name: /Proceed to Checkout/i }).first().click();
  await page.waitForTimeout(7000);
  const noSite = await body(page);
  const noSiteSum = summary(noSite);
  check("Checkout blocks without a site", /Select delivery site to continue/.test(noSite));
  check(
    "Place button is disabled without a site",
    await page.getByRole("button", { name: /Select delivery site to continue/i }).isDisabled(),
  );
  check("Summary asks for a site", noSiteSum?.delivery === "Select site", noSiteSum?.delivery);
  await shot(page, "03_checkout_no_site");

  // 4. Choose a saved site → the fee resolves before placing
  await page.getByText("Choose from saved sites").click();
  await page.waitForTimeout(2500);
  await shot(page, "04_saved_sites");
  await page.getByText("Site A — Main block").first().click();
  await page.waitForTimeout(10000);
  const priced = summary(await body(page));
  check("Priced subtotal ₹350", priced?.subtotal === "₹350", priced?.raw);
  check("Engine discount -₹17.50 shown", /17\.50/.test(priced?.discount ?? ""), priced?.discount);
  check("Delivery ₹99 resolved before placing", priced?.delivery === "₹99", priced?.delivery);
  check("Payable total ₹431.50", priced?.total === "₹431.50", priced?.total);
  check(
    "Place button enabled once priced",
    await page.getByRole("button", { name: /Place Business Order/i }).isEnabled(),
  );
  await shot(page, "05_checkout_priced");

  // 5. Back to the cart: it shows the same resolved fee
  await page.getByRole("button", { name: /Back/i }).first().click();
  await page.waitForTimeout(6000);
  const cartPriced = summary(await body(page));
  check("Cart re-shows the resolved fee", cartPriced?.delivery === "₹99", cartPriced?.delivery);
  check("Cart total includes delivery ₹431.50", cartPriced?.total === "₹431.50", cartPriced?.total);
  await shot(page, "06_cart_priced");

  // 6. Change the basket → the stale fee is dropped, then re-resolved
  await page.getByRole("button", { name: /Increase Wonder Cement/ }).first().click();
  await page.waitForTimeout(3000);
  const bumped = summary(await body(page));
  check("Quantity change drops the stale fee", bumped?.delivery === "Calculated at checkout", bumped?.delivery);
  check("Bumped cart total is goods-only ₹700", bumped?.total === "₹700", bumped?.total);
  await shot(page, "07_cart_qty2");

  await page.getByRole("button", { name: /Proceed to Checkout/i }).first().click();
  await page.waitForTimeout(9000);
  const priced2 = summary(await body(page));
  check("Re-resolved subtotal ₹700", priced2?.subtotal === "₹700", priced2?.raw);
  check("Re-resolved discount -₹35", /35/.test(priced2?.discount ?? ""), priced2?.discount);
  check("Re-resolved delivery ₹99", priced2?.delivery === "₹99", priced2?.delivery);
  check("Re-resolved total ₹764", priced2?.total === "₹764", priced2?.total);
  await shot(page, "08_checkout_priced_qty2");

  // 7. Place the order
  await page.getByRole("button", { name: /Place Business Order/i }).first().click();
  await page.waitForTimeout(15000);
  const confirm = await body(page);
  const group = (confirm.match(/og_[A-Z0-9]+/) || [null])[0];
  check("Order confirmed", /Purchase order placed/.test(confirm));
  check("Confirmation returns an order group", !!group, group);
  check("Confirmation shipping ₹99", /Shipping\s*\|?\s*₹99/.test(confirm));
  check("Confirmation total ₹764", /Total\s*\|?\s*₹764/.test(confirm), confirm.slice(0, 320));
  check("Payment is the simulated staging mode", /simulated · test data/.test(confirm));
  await shot(page, "09_confirmation");

  // 8. The engine recorded the same money
  const completion = completions[completions.length - 1];
  const completionGroup = completion?.order_group?.id ?? null;
  check("Completion response carries the order group", group != null && completionGroup === group, completionGroup);
  check(
    "Completion total is 76400 minor (₹764)",
    completion?.total_minor === 76400 || completion?.order_group?.total === 764,
    `${completion?.total_minor}`,
  );

  // 9. Order history lists it
  await page.getByRole("button", { name: /Cart/ }).last().click();
  await page.waitForTimeout(6000);
  await page.getByText("Order History").first().click();
  await page.waitForTimeout(6000);
  const orders = await body(page);
  check("Order history screen opens", /Order History/.test(orders));
  check(
    "Order card is rendered for the new group",
    group ? (await page.locator(`[aria-label*="${group}"]`).count()) > 0 : false,
  );
  await shot(page, "10_order_history");

  check("No console or page errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" / "));
  check("No HTTP 4xx/5xx responses", httpErrors.length === 0, httpErrors.slice(0, 3).join(" / "));

  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[aria-label]"))
      .map((el) => el.getAttribute("aria-label"))
      .join(" | "),
  );
  const banner = labels.match(/STAGING\s*[·:]\s*([0-9a-f]{7})/);
  const failed = results.filter((r) => !r.ok);
  const payload = {
    captured_at: new Date().toISOString(),
    live_build: banner ? banner[1] : null,
    account: ACCOUNT,
    order_group: group,
    order_total_minor: completion?.total_minor ?? null,
    results,
    passed: results.length - failed.length,
    failed: failed.length,
  };
  fs.writeFileSync(path.join(OUT, "b2b_qc_results.json"), JSON.stringify(payload, null, 2));

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  console.log(`\nORDER_GROUP ${group}`);
  console.log(`TOTAL ${results.length} PASS ${results.length - failed.length} FAIL ${failed.length}`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await browser.close();
}
