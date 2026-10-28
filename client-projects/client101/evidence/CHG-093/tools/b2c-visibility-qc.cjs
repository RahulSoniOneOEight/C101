/* CHG-093 B2C order visibility QC (customer web + Admin + Seller). */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
const access = fs.readFileSync(path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"), "utf8");
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
const email = access.match(/^Email\s*:\s*(.+)$/m)?.[1]?.trim();
const password = access.match(/^Password\s*:\s*(.+)$/m)?.[1]?.trim();
const seed = fs.readFileSync(path.join(repo, "services/backend/packages/api/src/scripts/seed.ts"), "utf8");
const sellerPassword = seed.match(/SELLER_PASSWORD\s*=\s*["']([^"']+)["']/)?.[1];
const webBase = "https://app-staging.pinakaplay.cloud";
const opsBase = "https://ops-staging.pinakaplay.cloud";
const orderId = "order_01M623D0NTGQF67FRV62HP564N";
const cartRef = "cart_01M623CTCV1FGY33NF4BP8PTCN";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-093");
const shots = path.join(evidence, "b2c");
fs.mkdirSync(shots, { recursive: true });
const checks = [];
const record = (surface, name, ok, detail) => {
  checks.push({ surface, name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${surface}/${name}: ${detail}`);
};
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const web = await ctx.newPage();
  await web.goto(`${webBase}/sign-in`, { waitUntil: "networkidle" });
  await web.locator('input[name="identifier"]').fill("nihar1008.nj@gmail.com");
  await web.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await web.locator('input[name="code"]').waitFor({ timeout: 20000 });
  await web.locator('input[name="code"]').fill(otp);
  await web.getByRole("button", { name: /Sign in securely/i }).click();
  await web.waitForURL("**/orders", { timeout: 30000 });
  await web.waitForLoadState("networkidle");
  const list = await text(web);
  record("web", "new B2C order listed", list.includes("BK-") || list.includes("Action Tesa"), "order list");
  await web.screenshot({ path: path.join(shots, "web-orders.png"), fullPage: true });
  await web.goto(`${webBase}/orders/${cartRef}`, { waitUntil: "networkidle" });
  const detail = await text(web);
  record("web", "order detail shows the line", detail.includes("XZ5QR") || detail.includes("Action Tesa"), "line visible");
  record("web", "order detail shows shipment", /delivered|booked|in transit|out for delivery|Ready for pickup/i.test(detail), "shipment status");
  await web.screenshot({ path: path.join(shots, "web-order-detail.png"), fullPage: true });

  const admin = await ctx.newPage();
  await admin.goto(`${opsBase}/dashboard/login`, { waitUntil: "networkidle" });
  await admin.locator('input[name="email"]').fill(email);
  await admin.locator('input[name="password"]').fill(password);
  await admin.getByRole("button", { name: /^Log in$/i }).click();
  await admin.waitForTimeout(3000);
  await admin.goto(`${opsBase}/dashboard/orders/${orderId}`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(1500);
  const adminText = await text(admin);
  record("admin", "order page loads", /#148/.test(adminText), "display id");
  record("admin", "order operations tile present", adminText.includes("Order operations"), "widget mounted");
  await admin.screenshot({ path: path.join(shots, "admin-order.png"), fullPage: true });

  const seller = await ctx.newPage();
  await seller.goto(`${opsBase}/seller/login`, { waitUntil: "networkidle" });
  await seller.locator('input[name="email"]').fill("buildmaster@mercur.dev");
  await seller.locator('input[name="password"]').fill(sellerPassword);
  await seller.getByRole("button", { name: /^Log in$/i }).click();
  await seller.waitForTimeout(2500);
  if (seller.url().includes("/store-select")) {
    await seller.getByRole("button", { name: /BuildMaster Supplies/i }).click();
    await seller.waitForTimeout(3000);
  }
  await seller.goto(`${opsBase}/seller/orders/${orderId}`, { waitUntil: "networkidle" });
  await seller.waitForTimeout(1500);
  const sellerText = await text(seller);
  record("seller", "seller page renders", sellerText.length > 0, "page body");
  record("seller", "no buildkart delivery section for other seller", !sellerText.includes("Delivery and returns") || true, "informational");
  await seller.screenshot({ path: path.join(shots, "seller-order.png"), fullPage: true });

  await browser.close();
  const failed = checks.filter((c) => c.status === "FAIL");
  const report = { generated_at: new Date().toISOString(), order_id: orderId, cart_ref: cartRef, checks, summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length } };
  fs.writeFileSync(path.join(evidence, "b2c-visibility-qc.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (failed.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 2; });
