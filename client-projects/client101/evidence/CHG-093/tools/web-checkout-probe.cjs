/* CHG-093 probe: does the customer web checkout place a B2C order? */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
const access = fs.readFileSync(path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"), "utf8");
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
const base = "https://app-staging.pinakaplay.cloud";
const productId = "prod_01M59JS4A6QTH32AXVW9P2D3A3";
const sku = "XZ5QR";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-093");
fs.mkdirSync(path.join(evidence, "web"), { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.locator('input[name="identifier"]').fill("nihar1008.nj@gmail.com");
  await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await page.locator('input[name="code"]').waitFor({ timeout: 20000 });
  await page.locator('input[name="code"]').fill(otp);
  await page.getByRole("button", { name: /Sign in securely/i }).click();
  await page.waitForURL("**/orders", { timeout: 30000 });

  await page.goto(`${base}/checkout?productId=${productId}&sku=${sku}`, { waitUntil: "networkidle" });
  const heading = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: path.join(evidence, "web", "checkout-form.png"), fullPage: true });
  await page.getByRole("button", { name: /Place order/i }).click();
  await page.waitForTimeout(4000);
  const after = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: path.join(evidence, "web", "checkout-result.png"), fullPage: true });
  const confirmation = /Order confirmed/i.test(after);
  const error = after.match(/Checkout failed:[^.]*/i)?.[0] ?? null;
  console.log(JSON.stringify({ confirmation, error, url: page.url(), before_snippet: heading.slice(0, 160) }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
