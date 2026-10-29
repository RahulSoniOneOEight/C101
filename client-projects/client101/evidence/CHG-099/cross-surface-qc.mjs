/* CHG-099: Admin and Seller read-only checks for B2C #157 and B2B #158. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE || "/root", ".buildkart", "staging-access.txt"),
  "utf8",
);
const adminEmail = access.match(/Email\s*:\s*(.+)/)?.[1]?.trim();
const adminPassword = access.match(/Password\s*:\s*(.+)/)?.[1]?.trim();
if (!adminEmail || !adminPassword) throw new Error("admin credentials missing");
const sellerPassword = "supersecret";

const ops = "https://ops-staging.pinakaplay.cloud";
const b2c = {
  orderId: "order_01M64F05SPJ1J1PWC4DM65S355",
  display: "157",
  total: "514",
  seller: "UrbanBuild Supply",
  sellerEmail: "urbanbuild@mercur.dev",
};
const b2b = {
  orderId: "order_01M64F1BFS22TM4VKHJ8GZ66GH",
  display: "158",
  total: "431.50",
  seller: "PowerMax Depot",
  sellerEmail: "powermax@mercur.dev",
};
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const record = (name, ok, detail) => {
  checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${name}: ${detail}`);
};
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const watch = (page, surface) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ surface, message: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ surface, message: error.message }));
};

async function signInAdmin(page) {
  await page.goto(`${ops}/dashboard/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(adminEmail);
  await page.locator('input[name="password"]').fill(adminPassword);
  await page.getByRole("button", { name: /^Log in$/i }).click();
  await page.waitForTimeout(3000);
}

async function signInSeller(page, email, storeName) {
  await page.goto(`${ops}/seller/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(sellerPassword);
  await page.getByRole("button", { name: /^Log in$/i }).click();
  await page.waitForTimeout(3000);
  if (page.url().includes("/login")) {
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(sellerPassword);
    await page.getByRole("button", { name: /^Log in$/i }).click();
    await page.waitForTimeout(4000);
  }
  if (page.url().includes("/store-select")) {
    const storeButton = page.getByRole("button").filter({ hasText: storeName }).first();
    await storeButton.waitFor({ timeout: 20000 });
    await storeButton.click();
    await page.waitForTimeout(2500);
  }
}

const browser = await chromium.launch({ headless: true });
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const admin = await adminContext.newPage();
watch(admin, "admin");
await signInAdmin(admin);

await admin.goto(`${ops}/dashboard/orders/${b2c.orderId}`, { waitUntil: "networkidle" });
await admin.waitForTimeout(2000);
const adminB2c = await text(admin);
record("Admin renders B2C order #157", adminB2c.includes("#157"), "#157");
record("Admin B2C total", /₹514(\.06)?/.test(adminB2c) || adminB2c.includes("514.06"), "₹514.06");
record("Admin B2C payment authorized", /Payment Authorized/i.test(adminB2c), "Authorized");
record("Admin B2C delivery booked", /Booked/i.test(adminB2c), "Booked");
await admin.screenshot({ path: path.join(__dirname, "admin-b2c-157.png"), fullPage: false });

await admin.goto(`${ops}/dashboard/orders/${b2b.orderId}`, { waitUntil: "networkidle" });
await admin.waitForTimeout(2000);
const adminB2b = await text(admin);
record("Admin renders B2B order #158", adminB2b.includes("#158"), "#158");
record("Admin B2B total", /₹431(\.50)?/.test(adminB2b) || adminB2b.includes("431.50"), "₹431.50");
record("Admin B2B payment authorized", /Payment Authorized/i.test(adminB2b), "Authorized");
record("Admin B2B delivery booked", /Booked/i.test(adminB2b), "Booked");
record("Admin B2B badge", /B2B trade order/i.test(adminB2b), "B2B trade order");
record("Admin B2B business account", adminB2b.includes("business_arjun_traders"), "business_arjun_traders");
await admin.screenshot({ path: path.join(__dirname, "admin-b2b-158.png"), fullPage: false });
await adminContext.close();

const b2cSellerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const b2cSeller = await b2cSellerContext.newPage();
watch(b2cSeller, "seller-b2c");
await signInSeller(b2cSeller, b2c.sellerEmail, b2c.seller);
await b2cSeller.goto(`${ops}/seller/orders/${b2c.orderId}`, { waitUntil: "networkidle" });
await b2cSeller.waitForTimeout(2000);
const sellerB2c = await text(b2cSeller);
record("UrbanBuild renders B2C order #157", sellerB2c.includes("#157"), "#157");
record("UrbanBuild sees booked delivery", /Booked/i.test(sellerB2c), "Booked");
record("UrbanBuild sees Admin payment boundary", sellerB2c.includes("Payment and refunds are managed by BuildKart Admin"), "boundary copy");
await b2cSeller.screenshot({ path: path.join(__dirname, "seller-b2c-157.png"), fullPage: false });
const b2cCross = await b2cSeller.goto(`${ops}/seller/orders/${b2b.orderId}`, { waitUntil: "networkidle" });
const b2cCrossText = await text(b2cSeller);
record("UrbanBuild cannot see B2B #158", !b2cCrossText.includes("#158"), `status=${b2cCross?.status()}`);
await b2cSellerContext.close();

const b2bSellerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const b2bSeller = await b2bSellerContext.newPage();
watch(b2bSeller, "seller-b2b");
await signInSeller(b2bSeller, b2b.sellerEmail, b2b.seller);
await b2bSeller.goto(`${ops}/seller/orders/${b2b.orderId}`, { waitUntil: "networkidle" });
await b2bSeller.waitForTimeout(2000);
const sellerB2b = await text(b2bSeller);
record("PowerMax renders B2B order #158", sellerB2b.includes("#158"), "#158");
record("PowerMax sees booked delivery", /Booked/i.test(sellerB2b), "Booked");
record("PowerMax sees Admin payment boundary", sellerB2b.includes("Payment and refunds are managed by BuildKart Admin"), "boundary copy");
await b2bSeller.screenshot({ path: path.join(__dirname, "seller-b2b-158.png"), fullPage: false });
const b2bCross = await b2bSeller.goto(`${ops}/seller/orders/${b2c.orderId}`, { waitUntil: "networkidle" });
const b2bCrossText = await text(b2bSeller);
record("PowerMax cannot see B2C #157", !b2bCrossText.includes("#157"), `status=${b2bCross?.status()}`);
await b2bSellerContext.close();

await browser.close();
const failed = checks.filter((check) => check.status === "FAIL");
const report = {
  generated_at: new Date().toISOString(),
  release: "186a50f8f69c5d9d436ab53c8c7e8dbf1c270f5",
  b2c,
  b2b,
  checks,
  summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  console_errors: consoleErrors,
  page_errors: pageErrors,
};
fs.writeFileSync(path.join(__dirname, "cross-surface-qc.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
if (failed.length) process.exitCode = 1;
