/* CHG-094 read-only Admin/Seller visibility QC for the single deployed-checkout order. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
if (!repo) throw new Error("repository path is required");
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"),
  "utf8",
);
const adminEmail = access.match(/^Email\s*:\s*(.+)$/m)?.[1]?.trim();
const adminPassword = access.match(/^Password\s*:\s*(.+)$/m)?.[1]?.trim();
const seed = fs.readFileSync(
  path.join(repo, "services/backend/packages/api/src/scripts/seed.ts"),
  "utf8",
);
const sellerPassword = seed.match(/SELLER_PASSWORD\s*=\s*["']([^"']+)["']/)?.[1];
if (!adminEmail || !adminPassword || !sellerPassword) throw new Error("staging login data is incomplete");

const base = "https://ops-staging.pinakaplay.cloud";
const orderId = "order_01M624MKX6SNH9CTJ1RM6TXMAQ";
const displayId = "150";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-094");
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];
const record = (name, ok, detail) => {
  checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${name}: ${detail}`);
};
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const hasOverflow = async (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const watch = (page, surface) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ surface, message: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ surface, message: error.message }));
  page.on("requestfailed", (request) => {
    requestFailures.push({ surface, url: request.url(), error: request.failure()?.errorText ?? "unknown" });
  });
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const admin = await context.newPage();
  watch(admin, "admin");
  await admin.goto(`${base}/dashboard/login`, { waitUntil: "networkidle" });
  await admin.locator('input[name="email"]').fill(adminEmail);
  await admin.locator('input[name="password"]').fill(adminPassword);
  await admin.getByRole("button", { name: /^Log in$/i }).click();
  await admin.waitForTimeout(2_500);
  await admin.goto(`${base}/dashboard/orders/${orderId}`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(1_000);
  const adminText = await text(admin);
  record("Admin renders order #150", adminText.includes(`#${displayId}`), `#${displayId}`);
  record("Admin shows authorized simulated payment state", /Payment Authorized/i.test(adminText), "Payment Authorized");
  record("Admin shows booked delivery", /Booked/i.test(adminText), "Booked");
  record("Admin desktop has no horizontal overflow", !(await hasOverflow(admin)), "1440x900");
  fs.mkdirSync(path.join(evidence, "staging-screenshots", "admin"), { recursive: true });
  await admin.screenshot({
    path: path.join(evidence, "staging-screenshots", "admin", "order-150-desktop.png"),
    fullPage: true,
  });

  const seller = await context.newPage();
  watch(seller, "seller");
  await seller.goto(`${base}/seller/login`, { waitUntil: "networkidle" });
  await seller.locator('input[name="email"]').fill("urbanbuild@mercur.dev");
  await seller.locator('input[name="password"]').fill(sellerPassword);
  await seller.getByRole("button", { name: /^Log in$/i }).click();
  await seller.waitForTimeout(2_500);
  if (seller.url().includes("/store-select")) {
    await seller.getByRole("button", { name: /UrbanBuild Supply/i }).click();
    await seller.waitForTimeout(2_500);
  }
  await seller.goto(`${base}/seller/orders/${orderId}`, { waitUntil: "networkidle" });
  await seller.waitForTimeout(1_000);
  const sellerText = await text(seller);
  record("owning Seller renders order #150", sellerText.includes(`#${displayId}`), `#${displayId}`);
  record("Seller delivery and returns widget renders", sellerText.includes("Delivery and returns"), "widget");
  record("Seller shows booked delivery", /Booked/i.test(sellerText), "Booked");
  record("Seller desktop has no horizontal overflow", !(await hasOverflow(seller)), "1440x900");
  fs.mkdirSync(path.join(evidence, "staging-screenshots", "seller"), { recursive: true });
  await seller.screenshot({
    path: path.join(evidence, "staging-screenshots", "seller", "order-150-desktop.png"),
    fullPage: true,
  });
  await seller.setViewportSize({ width: 390, height: 844 });
  record("Seller mobile has no horizontal overflow", !(await hasOverflow(seller)), "390x844");
  await seller.screenshot({
    path: path.join(evidence, "staging-screenshots", "seller", "order-150-mobile.png"),
    fullPage: true,
  });

  const expectedAborts = requestFailures.filter(
    (failure) => failure.error === "net::ERR_ABORTED" && failure.url.includes("_rsc="),
  );
  const unexpectedFailures = requestFailures.filter((failure) => !expectedAborts.includes(failure));
  record("operator consoles have no console errors", consoleErrors.length === 0, `${consoleErrors.length}`);
  record("operator consoles have no uncaught errors", pageErrors.length === 0, `${pageErrors.length}`);
  record(
    "operator consoles have no unexpected failed requests",
    unexpectedFailures.length === 0,
    `${unexpectedFailures.length}; ignored ${expectedAborts.length} cancelled prefetches`,
  );

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: base,
    release: "b7f93b9b6e4038d87f42e8f6a0b0fb852b485f5c",
    order_id: orderId,
    display_id: 150,
    seller: "UrbanBuild Supply",
    mode: "read-only",
    checks,
    console_errors: consoleErrors,
    page_errors: pageErrors,
    unexpected_failed_requests: unexpectedFailures,
    ignored_expected_prefetch_aborts: expectedAborts,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  fs.writeFileSync(
    path.join(evidence, "staging-operator-visibility-qc.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report.summary));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
