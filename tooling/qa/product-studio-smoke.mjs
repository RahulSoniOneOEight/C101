#!/usr/bin/env node
/**
 * Product Studio smoke gate.
 *
 * Replaces manual click-through after a deploy. Requires a Chromium binary and an admin session
 * that can create products on staging.
 *
 * Dependency: playwright-core (not a runtime dependency of the apps).
 *   npm i -g playwright-core   OR   npm i -D playwright-core in this folder.
 *
 *   ADMIN_EMAIL=... ADMIN_PASS=... \
 *   BASE_URL=https://ops-staging.pinakaplay.cloud \
 *   node tooling/qa/product-studio-smoke.mjs
 *
 * Exit code 0 = pass. Any failed assertion exits non-zero with the failing step.
 */
import { chromium } from "playwright-core";

const BASE = (process.env.BASE_URL ?? "https://ops-staging.pinakaplay.cloud").replace(/\/$/, "");
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASS;
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

if (!EMAIL || !PASSWORD) {
  console.error("ADMIN_EMAIL and ADMIN_PASS are required");
  process.exit(2);
}

const stamp = Date.now().toString().slice(-6);
const title = `Smoke ${stamp}`;
const sku = `SMOKE-${stamp}`;
const steps = [];
const step = (name, detail = "") => {
  steps.push({ name, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

try {
  await page.goto(`${BASE}/dashboard/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Log in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 });
  step("login");

  await page.goto(`${BASE}/dashboard/products/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.getByLabel("Product name", { exact: false }).first().fill(title);
  await page.getByRole("button", { name: /Organisation/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByLabel("Category", { exact: false }).first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /Variants & offers/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByLabel("Seller (owns this variant", { exact: false }).first().selectOption({ index: 1 });
  await page.getByPlaceholder("Unique SKU").first().fill(sku);
  await page
    .getByPlaceholder("What the buyer should see for this variant")
    .first()
    .fill("Smoke variant");
  step("create filled");

  await page.getByRole("button", { name: "Save variant", exact: true }).click();
  await page.waitForURL(/product-studio\/prod_/, { timeout: 120000 });
  await page.waitForTimeout(3500);
  const productId = page.url().match(/product-studio\/(prod_[^?/]+)/)[1];
  step("variant saved", productId);

  const list = page.locator('input[id^="offer-price-"]').first();
  if ((await list.count()) === 0) throw new Error("pricing editor did not open after save");
  await list.fill("1200");
  await page.locator('input[id^="offer-selling-"]').first().fill("999");
  const b2bList = page.getByLabel("B2B list price", { exact: false }).first();
  if (await b2bList.count()) {
    await b2bList.fill("1100");
    await page.getByLabel("B2B selling price", { exact: false }).first().fill("950");
    await page.getByLabel("MOQ (minimum order)", { exact: false }).first().fill("5");
  }
  await page.getByRole("button", { name: /Save pricing/i }).click();
  await page.waitForTimeout(5000);
  step("pricing saved");

  await page.goto(`${BASE}/dashboard/product-studio/${productId}?view=review`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3500);
  const review = await page.locator("body").innerText();
  if (!/B2C live/.test(review)) throw new Error("B2C is not live after pricing");
  if (/\d+ blockers?/.test(review) && !/0 blockers?/.test(review)) {
    throw new Error("review still reports blockers");
  }
  step("review live");

  const response = await fetch(`${BASE}/v1/products/${productId}?channel=b2c`);
  if (response.status !== 200) throw new Error(`storefront detail ${response.status}`);
  const body = await response.json();
  const price = body?.best_price?.unit_amount_minor ?? body?.offers?.[0]?.unit_amount_minor ?? null;
  if (price !== 99900) throw new Error(`unexpected storefront price ${price}`);
  step("storefront", `${productId} @ ${price}`);

  if (consoleErrors.length > 0) {
    throw new Error(`console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
  }
  step("no console errors");

  console.log(`\nSMOKE PASS ${productId}`);
} catch (error) {
  console.error(`\nSMOKE FAIL — ${String(error)}`);
  console.error(JSON.stringify(steps, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
