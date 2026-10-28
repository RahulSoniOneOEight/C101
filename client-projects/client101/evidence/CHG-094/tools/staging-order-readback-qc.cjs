/* CHG-094 read-only verification of the single order created by deployed checkout QC. */
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
if (!otp) throw new Error("PILOT_OTP_CODE is missing from the staging access file");

const base = "https://app-staging.pinakaplay.cloud";
const owner = "nihar1008.nj@gmail.com";
const checkoutRef = "cart_01M624MH558QNVK63BJVN0JQ8H";
const orderGroupId = "og_01M624MKXNDYY0EQ0DBYYQ96DN";
const orderNumber = "BK-261028-B2HR38";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-094");
const desktopDir = path.join(evidence, "staging-screenshots", "desktop");
const mobileDir = path.join(evidence, "staging-screenshots", "mobile");

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

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
  });

  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.locator('input[name="identifier"]').fill(owner);
  await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await page.locator('input[name="code"]').waitFor({ timeout: 20_000 });
  await page.locator('input[name="code"]').fill(otp);
  await page.getByRole("button", { name: /Sign in securely/i }).click();
  await page.waitForURL("**/orders", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  let ordersText = await text(page);
  record("new canonical order number is listed", ordersText.includes(orderNumber), orderNumber);
  record("desktop order list has no horizontal overflow", !(await hasOverflow(page)), "1440x900");
  await page.screenshot({ path: path.join(desktopDir, "orders-after-checkout.png"), fullPage: true });

  const orderLink = page.locator(`a[href="/orders/${checkoutRef}"]`).first();
  record("new order links to its owner-scoped checkout reference", (await orderLink.count()) === 1, checkoutRef);
  await orderLink.click();
  await page.waitForURL(`**/orders/${checkoutRef}`, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const detailText = await text(page);
  record("order detail shows canonical order number", detailText.includes(orderNumber), orderNumber);
  record("order detail shows the purchased SKU", detailText.includes("XZ5QR"), "XZ5QR");
  record("order detail shows the server-owned total", detailText.includes("₹514.05"), "₹514.05");
  record("order detail shows the booked shipment", /booked/i.test(detailText), "booked");
  record("desktop order detail has no horizontal overflow", !(await hasOverflow(page)), "1440x900");
  await page.screenshot({ path: path.join(desktopDir, "order-detail.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  record("mobile order detail has no horizontal overflow", !(await hasOverflow(page)), "390x844");
  await page.screenshot({ path: path.join(mobileDir, "order-detail.png"), fullPage: true });

  const expectedAborts = requestFailures.filter(
    (failure) => failure.error === "net::ERR_ABORTED" && failure.url.includes("_rsc="),
  );
  const unexpectedFailures = requestFailures.filter((failure) => !expectedAborts.includes(failure));
  record("browser console has no errors", consoleErrors.length === 0, `${consoleErrors.length}`);
  record("page has no uncaught errors", pageErrors.length === 0, `${pageErrors.length}`);
  record(
    "browser has no unexpected failed requests",
    unexpectedFailures.length === 0,
    `${unexpectedFailures.length}; ignored ${expectedAborts.length} cancelled Next.js RSC prefetches`,
  );

  const unsafeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const unsafePage = await unsafeContext.newPage();
  await unsafePage.goto(`${base}/sign-in?next=%2F%2Fexample.com`, { waitUntil: "networkidle" });
  await unsafePage.locator('input[name="identifier"]').fill(owner);
  await unsafePage.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await unsafePage.locator('input[name="code"]').waitFor({ timeout: 20_000 });
  await unsafePage.locator('input[name="code"]').fill(otp);
  await unsafePage.getByRole("button", { name: /Sign in securely/i }).click();
  await unsafePage.waitForURL("**/orders", { timeout: 30_000 });
  const safeUrl = new URL(unsafePage.url());
  record(
    "protocol-relative next path cannot leave the staging host",
    safeUrl.origin === base && safeUrl.pathname === "/orders",
    unsafePage.url(),
  );
  await unsafeContext.close();

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: base,
    release: "b7f93b9b6e4038d87f42e8f6a0b0fb852b485f5c",
    owner,
    checkout_ref: checkoutRef,
    order_group_id: orderGroupId,
    order_number: orderNumber,
    mode: "read-only-after-single-order-checkout",
    checks,
    console_errors: consoleErrors,
    page_errors: pageErrors,
    unexpected_failed_requests: unexpectedFailures,
    ignored_expected_rsc_aborts: expectedAborts,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  fs.writeFileSync(
    path.join(evidence, "staging-order-readback-qc.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report.summary));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
