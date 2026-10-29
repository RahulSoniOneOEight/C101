/* CHG-098: verify the B2B order in the Admin order detail. */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE || "/root", ".buildkart", "staging-access.txt"),
  "utf8",
);
const email = access.match(/Email\s*:\s*(.+)/)?.[1]?.trim();
const password = access.match(/Password\s*:\s*(.+)/)?.[1]?.trim();
if (!email || !password) throw new Error("admin credentials missing");

const base = "https://ops-staging.pinakaplay.cloud/dashboard";
const orderId = "order_01M64C01MBZC5JFYJJ5TB4X2QH";
const orderNumber = "156";
const orderGroupId = "og_01M64C01MVC35YEK45658BERQ2";
const checks = [];
const record = (name, ok, detail) => {
  checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${name}: ${detail}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.locator('input[name="email"]').fill(email);
await page.locator('input[name="password"]').fill(password);
await page.getByRole("button", { name: /Log in/i }).click();
await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
await page.waitForLoadState("networkidle");

await page.goto(`${base}/orders/${orderId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
const upper = text.toUpperCase();
record("admin order page loads", text.includes(orderId) || text.includes(`#${orderNumber}`), `#${orderNumber}`);
record("admin shows customer email", text.includes("buyer.b2b01@buildkart.test"), "buyer.b2b01@buildkart.test");
record("admin shows B2B order total", /₹431(\.50)?/.test(text) || text.includes("431.5"), "₹431.50");
record("admin shows authorized payment", upper.includes("AUTHORIZED"), "Authorized");
record("admin shows B2B badge", upper.includes("B2B TRADE ORDER"), "B2B trade order");
record(
  "admin shows B2B channel context",
  upper.includes("B2B CHANNEL") || text.includes("business_arjun_traders"),
  "B2B channel / business account",
);
await page.screenshot({ path: path.join(__dirname, "b2b-admin-order.png"), fullPage: false });

const report = {
  timestamp: new Date().toISOString(),
  orderId,
  orderNumber,
  orderGroupId,
  checks,
  summary: {
    pass: checks.filter((check) => check.status === "PASS").length,
    fail: checks.filter((check) => check.status === "FAIL").length,
  },
  body_excerpt: text.slice(0, 2000),
};
fs.writeFileSync(path.join(__dirname, "b2b-admin-qc.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.summary.fail > 0) process.exit(1);
