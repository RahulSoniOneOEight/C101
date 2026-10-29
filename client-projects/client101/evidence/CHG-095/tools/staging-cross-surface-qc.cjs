/* CHG-095: read-only Admin, Seller and cross-owner checks for order #151. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
if (!repo) throw new Error("repository path is required");
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"),
  "utf8",
);
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
const adminEmail = access.match(/^Email\s*:\s*(.+)$/m)?.[1]?.trim();
const adminPassword = access.match(/^Password\s*:\s*(.+)$/m)?.[1]?.trim();
const seed = fs.readFileSync(
  path.join(repo, "services/backend/packages/api/src/scripts/seed.ts"),
  "utf8",
);
const sellerPassword = seed.match(/SELLER_PASSWORD\s*=\s*["']([^"']+)["']/)?.[1];
if (!otp || !adminEmail || !adminPassword || !sellerPassword) {
  throw new Error("staging login data is incomplete");
}

const appBase = "https://app-staging.pinakaplay.cloud";
const opsBase = "https://ops-staging.pinakaplay.cloud";
const orderId = "order_01M633BSHHWEMM9YT6K5S7PVCZ";
const checkoutRef = "cart_01M633BMCPDPEFABNG2W2PQJZ9";
const orderNumber = "BK-261029-WT4R93";
const displayId = "151";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-095");
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
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const admin = await adminContext.newPage();
  watch(admin, "admin");
  await admin.goto(`${opsBase}/dashboard/login`, { waitUntil: "networkidle" });
  await admin.locator('input[name="email"]').fill(adminEmail);
  await admin.locator('input[name="password"]').fill(adminPassword);
  await admin.getByRole("button", { name: /^Log in$/i }).click();
  await admin.waitForTimeout(2_500);
  await admin.goto(`${opsBase}/dashboard/orders/${orderId}`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(1_000);
  const adminText = await text(admin);
  record("Admin renders order #151", adminText.includes(`#${displayId}`), `#${displayId}`);
  record("Admin shows authorized payment", /Payment Authorized/i.test(adminText), "Payment Authorized");
  record("Admin shows booked delivery", /Booked/i.test(adminText), "Booked");
  record("Admin shows no refund", /No refund/i.test(adminText), "No refund");
  record("Admin desktop has no horizontal overflow", !(await hasOverflow(admin)), "1440x900");
  fs.mkdirSync(path.join(evidence, "screenshots", "admin"), { recursive: true });
  await admin.screenshot({
    path: path.join(evidence, "screenshots", "admin", "order-151-desktop.png"),
    fullPage: true,
  });
  await adminContext.close();

  const sellerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const seller = await sellerContext.newPage();
  watch(seller, "seller");
  await seller.goto(`${opsBase}/seller/login`, { waitUntil: "networkidle" });
  await seller.locator('input[name="email"]').fill("urbanbuild@mercur.dev");
  await seller.locator('input[name="password"]').fill(sellerPassword);
  await seller.getByRole("button", { name: /^Log in$/i }).click();
  await seller.waitForTimeout(2_500);
  if (seller.url().includes("/login")) {
    await seller.locator('input[name="email"]').fill("urbanbuild@mercur.dev");
    await seller.locator('input[name="password"]').fill(sellerPassword);
    await seller.getByRole("button", { name: /^Log in$/i }).click();
    await seller.waitForTimeout(4_000);
  }
  if (seller.url().includes("/store-select")) {
    const storeButton = seller.getByRole("button").filter({ hasText: "UrbanBuild Supply" }).first();
    await storeButton.waitFor({ timeout: 20_000 });
    await storeButton.click();
    await seller.waitForTimeout(2_500);
  }
  await seller.goto(`${opsBase}/seller/orders/${orderId}`, { waitUntil: "networkidle" });
  await seller.waitForTimeout(1_000);
  const sellerText = await text(seller);
  record("owning Seller renders order #151", sellerText.includes(`#${displayId}`), `#${displayId}`);
  record("Seller shows Delivery and returns", sellerText.includes("Delivery and returns"), "widget");
  record("Seller shows booked delivery", /Booked/i.test(sellerText), "Booked");
  record(
    "Seller keeps payment/refund control with Admin",
    sellerText.includes("Payment and refunds are managed by BuildKart Admin"),
    "boundary copy",
  );
  record("Seller desktop has no horizontal overflow", !(await hasOverflow(seller)), "1440x900");
  fs.mkdirSync(path.join(evidence, "screenshots", "seller"), { recursive: true });
  await seller.screenshot({
    path: path.join(evidence, "screenshots", "seller", "order-151-desktop.png"),
    fullPage: true,
  });
  await seller.setViewportSize({ width: 390, height: 844 });
  record("Seller mobile has no document overflow", !(await hasOverflow(seller)), "390x844");
  await seller.screenshot({
    path: path.join(evidence, "screenshots", "seller", "order-151-mobile.png"),
    fullPage: true,
  });
  await sellerContext.close();

  const otherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const otherOwner = await otherContext.newPage();
  watch(otherOwner, "cross-owner");
  await otherOwner.goto(`${appBase}/sign-in`, { waitUntil: "networkidle" });
  await otherOwner.locator('input[name="identifier"]').fill("rsoni001@gmail.com");
  await otherOwner.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await otherOwner.locator('input[name="code"]').waitFor({ timeout: 20_000 });
  await otherOwner.locator('input[name="code"]').fill(otp);
  await otherOwner.getByRole("button", { name: /Sign in securely/i }).click();
  await otherOwner.waitForURL("**/orders", { timeout: 30_000 });
  const crossOwnerResponse = await otherOwner.goto(`${appBase}/orders/${checkoutRef}`, {
    waitUntil: "networkidle",
  });
  const crossOwnerText = await text(otherOwner);
  record(
    "different customer receives owner-scoped not-found",
    crossOwnerResponse?.status() === 404 && !crossOwnerText.includes(orderNumber),
    `status=${crossOwnerResponse?.status()}; leaked=${crossOwnerText.includes(orderNumber)}`,
  );
  fs.mkdirSync(path.join(evidence, "screenshots", "security"), { recursive: true });
  await otherOwner.screenshot({
    path: path.join(evidence, "screenshots", "security", "cross-owner-not-found.png"),
    fullPage: true,
  });
  await otherContext.close();

  const expectedConsoleErrors = consoleErrors.filter(
    (entry) =>
      entry.surface === "cross-owner" &&
      entry.message === "Failed to load resource: the server responded with a status of 404 ()",
  );
  const unexpectedConsoleErrors = consoleErrors.filter(
    (entry) => !expectedConsoleErrors.includes(entry),
  );
  const expectedAborts = requestFailures.filter(
    (failure) => failure.error === "net::ERR_ABORTED" && failure.url.includes("_rsc="),
  );
  const unexpectedFailures = requestFailures.filter((failure) => !expectedAborts.includes(failure));
  record(
    "cross-surface consoles have no unexpected errors",
    unexpectedConsoleErrors.length === 0,
    `${unexpectedConsoleErrors.length}; expected ${expectedConsoleErrors.length} owner-denial 404`,
  );
  record("cross-surface pages have no uncaught errors", pageErrors.length === 0, `${pageErrors.length}`);
  record(
    "cross-surface flow has no unexpected failed requests",
    unexpectedFailures.length === 0,
    `${unexpectedFailures.length}; ignored ${expectedAborts.length} cancelled prefetches`,
  );

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    release: "b7f93b9b6e4038d87f42e8f6a0b0fb852b485f5c",
    order_id: orderId,
    checkout_ref: checkoutRef,
    order_number: orderNumber,
    display_id: 151,
    owning_seller: "UrbanBuild Supply",
    mode: "read-only-after-single-checkout",
    checks,
    unexpected_console_errors: unexpectedConsoleErrors,
    expected_owner_denial_console_errors: expectedConsoleErrors,
    page_errors: pageErrors,
    unexpected_failed_requests: unexpectedFailures,
    ignored_expected_prefetch_aborts: expectedAborts,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  fs.writeFileSync(
    path.join(evidence, "staging-cross-surface-qc.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report.summary));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
