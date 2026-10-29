/* CHG-098: place one B2B order through the deployed Flutter app. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE || "/root", ".buildkart", "staging-access.txt"),
  "utf8",
);
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
if (!otp) throw new Error("PILOT_OTP_CODE missing");

const base = "https://buildkart-staging.web.app";
const buyer = "buyer.b2b01@buildkart.test";
const productId = "prod_01M5Q98Y7CEHEPKZENTNGF9CVW";
const evidence = { buyer, productId, steps: [], network: {}, checks: [] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });

page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/v1/carts") && !url.includes("/v1/checkouts")) return;
  const body = await response.json().catch(() => null);
  if (response.request().method() === "POST" && url.endsWith("/v1/auth/otp/challenges")) return;
  evidence.network[`${response.request().method()} ${url}`] = {
    status: response.status(),
    body,
  };
});

function record(name, ok, detail) {
  evidence.checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${name}: ${detail}`);
}

await page.goto(`${base}/#/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const el = document.querySelector("flt-semantics-placeholder");
  if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "B2B Trade", exact: true }).click();
await page.waitForTimeout(500);
await page.getByRole("textbox", { name: "Pilot email or 10-digit phone" }).fill(buyer);
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Get OTP", exact: true }).click();
await page.waitForTimeout(3000);
const otpText = await page.locator("body").innerText();
record("OTP screen reached", otpText.includes("Verify OTP"), page.url());
if (!otpText.includes("Verify OTP")) {
  console.error("OTP screen not reached:", otpText.slice(0, 1200));
  throw new Error("OTP screen not reached");
}
await page.getByRole("textbox").last().fill(otp);
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Verify", exact: true }).click();
await page.waitForTimeout(5000);
const afterVerifyText = await page.locator("body").innerText();
record("B2B home reached", page.url().endsWith("#/b2b"), page.url());
if (!page.url().endsWith("#/b2b")) {
  console.error("B2B home not reached:", afterVerifyText.slice(0, 1200));
  throw new Error("B2B home not reached");
}

await page.goto(`${base}/#/b2b/pdp/${productId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const pdpText = await page.locator("body").innerText();
record("PDP shows B2B price", pdpText.includes("₹350"), "₹350");
await page.getByRole("button", { name: "Add to Cart", exact: true }).click();
await page.waitForTimeout(1200);

await page.goto(`${base}/#/b2b/cart`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const cartText = await page.locator("body").innerText();
record("cart shows B2B subtotal", cartText.includes("Subtotal ₹350"), "₹350");
record("cart shows GST included", cartText.includes("GST Included"), "GST Included");
await page.screenshot({ path: path.join(__dirname, "b2b-cart.png"), fullPage: false });

await page.getByRole("button", { name: "Proceed to Checkout", exact: true }).click();
await page.waitForTimeout(2000);
await page.getByText("Choose from saved sites", { exact: true }).click();
await page.waitForTimeout(1500);
await page.getByText("Site A — Main block", { exact: false }).first().click();
await page.waitForTimeout(1500);
const checkoutText = await page.locator("body").innerText();
record("delivery site selected", checkoutText.includes("Site A — Main block"), "Site A — Main block");
await page.screenshot({ path: path.join(__dirname, "b2b-checkout.png"), fullPage: false });

await page.getByRole("button", { name: "Place Business Order", exact: true }).click();
await page.waitForTimeout(8000);
const confirmText = await page.locator("body").innerText();
record("order confirmation reached", confirmText.includes("Purchase order placed"), page.url());
record("confirmation shows order group", /og_[A-Z0-9]+/.test(confirmText), confirmText.slice(0, 400));

const completion = Object.entries(evidence.network).find(([key]) => key.includes("/complete"));
const orderGroup = completion?.[1]?.body?.order_group ?? null;
const cartCreate = Object.entries(evidence.network).find(([key]) => key.endsWith("/v1/carts"));
const cartId = cartCreate?.[1]?.body?.id ?? null;
record("canonical order group returned", /^og_/.test(orderGroup?.id ?? ""), orderGroup?.id ?? "missing");
record("canonical cart returned", /^cart_/.test(cartId ?? ""), cartId ?? "missing");

evidence.order = {
  cart_id: cartId,
  order_group_id: orderGroup?.id ?? null,
  order_group: orderGroup,
  confirmation_text: confirmText.slice(0, 1200),
};
fs.writeFileSync(path.join(__dirname, "b2b-order-ui.json"), JSON.stringify(evidence, null, 2));
await page.screenshot({ path: path.join(__dirname, "b2b-order-confirmed.png"), fullPage: false });
console.log(JSON.stringify({ cartId, orderGroup, checks: evidence.checks }, null, 2));
if (evidence.checks.some((check) => check.status === "FAIL")) process.exit(1);
await browser.close();
