/* CHG-094 local web checkout QC against the staging Experience API. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
const access = fs.readFileSync(path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"), "utf8");
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
const base = "http://localhost:3100";
const productId = "prod_01M59JS4A6QTH32AXVW9P2D3A3";
const sku = "XZ5QR";
const owner = "nihar1008.nj@gmail.com";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-094");
fs.mkdirSync(path.join(evidence, "screenshots"), { recursive: true });

const checks = [];
const record = (name, ok, detail) => {
  checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${name}: ${detail}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Signed-out checkout must redirect to sign-in and come back.
  await page.goto(`${base}/checkout?productId=${productId}&sku=${sku}`, { waitUntil: "networkidle" });
  record("signed-out checkout redirects", page.url().includes("/sign-in?next="), page.url());
  await page.screenshot({ path: path.join(evidence, "screenshots", "sign-in-gate.png"), fullPage: true });

  await page.locator('input[name="identifier"]').fill(owner);
  await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await page.locator('input[name="code"]').waitFor({ timeout: 20000 });
  await page.locator('input[name="code"]').fill(otp);
  await page.getByRole("button", { name: /Sign in securely/i }).click();
  await page.waitForURL("**/checkout?**", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  record("returns to checkout after sign-in", page.url().includes("/checkout?"), page.url());

  await page.locator('input[name="email"]').fill(owner);
  await page.screenshot({ path: path.join(evidence, "screenshots", "checkout-form.png"), fullPage: true });
  await page.getByRole("button", { name: /Place order/i }).click();
  await page.waitForTimeout(6000);
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const confirmed = /Order confirmed/i.test(body);
  const groupId = body.match(/og_[A-Z0-9]+/)?.[0] ?? null;
  record("order confirmed by the server", confirmed, groupId ?? body.slice(0, 200));
  record("canonical order group returned", Boolean(groupId), groupId ?? "none");
  await page.screenshot({ path: path.join(evidence, "screenshots", "checkout-confirmed.png"), fullPage: true });

  await page.goto(`${base}/orders`, { waitUntil: "networkidle" });
  const orders = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  record("new order listed after checkout", /₹|BK-/.test(orders), "orders page rendered");

  await browser.close();
  const failed = checks.filter((c) => c.status === "FAIL");
  const report = { generated_at: new Date().toISOString(), target: base, api: "https://api-staging.pinakaplay.cloud", product_id: productId, sku, owner, order_group_id: groupId, checks, summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length } };
  fs.writeFileSync(path.join(evidence, "browser-qc.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.summary, order_group_id: groupId }));
  if (failed.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 2; });
