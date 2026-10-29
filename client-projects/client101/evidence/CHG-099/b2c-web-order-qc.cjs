/* CHG-095: create exactly one B2C order through live staging, then verify customer readback. */
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
const release = "186a50f8f69c5d9d436ab53c8c7e8dbf1c270f5";
const owner = "nihar1008.nj@gmail.com";
const productId = "prod_01M59JS4A6QTH32AXVW9P2D3A3";
const sku = "XZ5QR";
const baselineLatestCheckout = "cart_01M624MH558QNVK63BJVN0JQ8H";
const checkoutPath = `/checkout?productId=${productId}&sku=${sku}`;
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-099");
const desktopDir = path.join(evidence, "screenshots", "customer", "desktop");
const mobileDir = path.join(evidence, "screenshots", "customer", "mobile");
fs.mkdirSync(desktopDir, { recursive: true });
fs.mkdirSync(mobileDir, { recursive: true });

const checks = [];
const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];
let checkoutPostCount = 0;
const record = (name, ok, detail) => {
  checks.push({ name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${name}: ${detail}`);
};
const bodyText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
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
  page.on("request", (request) => {
    if (request.url() === `${base}/api/checkout` && request.method() === "POST") checkoutPostCount += 1;
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
  });

  await page.goto(`${base}${checkoutPath}`, { waitUntil: "networkidle" });
  const signInUrl = new URL(page.url());
  record("signed-out checkout redirects to sign-in", signInUrl.pathname === "/sign-in", page.url());
  record(
    "redirect preserves exact product and SKU checkout",
    signInUrl.searchParams.get("next") === checkoutPath,
    signInUrl.searchParams.get("next") ?? "missing",
  );
  await page.screenshot({ path: path.join(desktopDir, "sign-in-gate.png"), fullPage: true });

  await page.locator('input[name="identifier"]').fill(owner);
  await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await page.locator('input[name="code"]').waitFor({ timeout: 20_000 });
  await page.locator('input[name="code"]').fill(otp);
  await page.getByRole("button", { name: /Sign in securely/i }).click();
  await page.waitForURL("**/checkout?**", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  record("OTP returns to exact checkout", page.url() === `${base}${checkoutPath}`, page.url());

  const sessionCookie = (await context.cookies(base)).find(
    (cookie) => cookie.name === "buildkart_pilot_session",
  );
  record(
    "owner session is HTTP-only and secure",
    Boolean(sessionCookie?.httpOnly && sessionCookie?.secure),
    sessionCookie
      ? `httpOnly=${sessionCookie.httpOnly}; secure=${sessionCookie.secure}; sameSite=${sessionCookie.sameSite}`
      : "missing",
  );
  const formText = await bodyText(page);
  record("checkout renders selected product", formText.includes("Action Tesa HDHMR Board"), "product");
  record("checkout renders selected SKU", formText.includes(sku), sku);
  record("desktop checkout has no horizontal overflow", !(await hasOverflow(page)), "1440x900");
  await page.locator('input[name="email"]').fill(owner);
  await page.screenshot({ path: path.join(desktopDir, "checkout-form.png"), fullPage: true });

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/checkout` && response.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: /Place order/i }).click();
  const checkoutResponse = await responsePromise;
  const checkoutPayload = await checkoutResponse.json();
  await page.locator(".notice.ok").waitFor({ timeout: 90_000 });
  const orderGroupId = checkoutPayload?.order_group?.id ?? null;
  record("exactly one checkout POST was sent", checkoutPostCount === 1, String(checkoutPostCount));
  record("checkout returns HTTP 200", checkoutResponse.status() === 200, String(checkoutResponse.status()));
  record(
    "server returns canonical order group",
    checkoutPayload?.type === "order_group" && /^og_[A-Z0-9]+$/.test(orderGroupId ?? ""),
    orderGroupId ?? "missing",
  );
  record(
    "payment is explicit simulated test data",
    checkoutPayload?.payment?.payment_mode === "simulated" && checkoutPayload?.payment?.test_data === true,
    `${checkoutPayload?.payment?.payment_mode ?? "missing"}; test_data=${checkoutPayload?.payment?.test_data ?? "missing"}`,
  );
  record(
    "confirmation displays canonical group",
    Boolean(orderGroupId && (await bodyText(page)).includes(orderGroupId)),
    orderGroupId ?? "missing",
  );
  await page.screenshot({ path: path.join(desktopDir, "checkout-confirmed.png"), fullPage: true });

  await page.goto(`${base}/orders`, { waitUntil: "networkidle" });
  const firstCard = page.locator("a.order-card").first();
  await firstCard.waitFor({ timeout: 30_000 });
  const firstHref = await firstCard.getAttribute("href");
  const checkoutRef = firstHref?.match(/^\/orders\/(cart_[A-Z0-9]+)$/)?.[1] ?? null;
  const cardText = (await firstCard.innerText()).replace(/\s+/g, " ");
  const orderNumber = cardText.match(/BK-\d{6}-[A-Z0-9]+/)?.[0] ?? null;
  record(
    "new order is first in owner list",
    Boolean(checkoutRef && checkoutRef !== baselineLatestCheckout),
    checkoutRef ?? "missing",
  );
  record("owner card has canonical order number", Boolean(orderNumber), orderNumber ?? "missing");
  record("owner card shows expected total", cardText.includes("₹514.05"), "₹514.05");
  await page.screenshot({ path: path.join(desktopDir, "orders-after-checkout.png"), fullPage: true });

  await firstCard.click();
  await page.waitForURL(`**/orders/${checkoutRef}`, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const detailText = await bodyText(page);
  record("customer detail shows order number", Boolean(orderNumber && detailText.includes(orderNumber)), orderNumber ?? "missing");
  record("customer detail shows SKU", detailText.includes(sku), sku);
  record("customer detail shows expected total", detailText.includes("₹514.05"), "₹514.05");
  record("customer detail shows booked shipment", /booked/i.test(detailText), "booked");
  record("desktop customer detail has no horizontal overflow", !(await hasOverflow(page)), "1440x900");
  await page.screenshot({ path: path.join(desktopDir, "order-detail.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  record("mobile customer detail has no horizontal overflow", !(await hasOverflow(page)), "390x844");
  await page.screenshot({ path: path.join(mobileDir, "order-detail.png"), fullPage: true });

  const expectedAborts = requestFailures.filter(
    (failure) => failure.error === "net::ERR_ABORTED" && failure.url.includes("_rsc="),
  );
  const unexpectedFailures = requestFailures.filter((failure) => !expectedAborts.includes(failure));
  record("customer console has no errors", consoleErrors.length === 0, `${consoleErrors.length}`);
  record("customer page has no uncaught errors", pageErrors.length === 0, `${pageErrors.length}`);
  record(
    "customer flow has no unexpected failed requests",
    unexpectedFailures.length === 0,
    `${unexpectedFailures.length}; ignored ${expectedAborts.length} cancelled Next.js RSC prefetches`,
  );

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: base,
    release,
    owner,
    product_id: productId,
    sku,
    order_group_id: orderGroupId,
    checkout_ref: checkoutRef,
    order_number: orderNumber,
    checkout_post_count: checkoutPostCount,
    checkout_response: {
      status: checkoutResponse.status(),
      type: checkoutPayload?.type ?? null,
      payment_mode: checkoutPayload?.payment?.payment_mode ?? null,
      test_data: checkoutPayload?.payment?.test_data ?? null,
    },
    checks,
    console_errors: consoleErrors,
    page_errors: pageErrors,
    unexpected_failed_requests: unexpectedFailures,
    ignored_expected_rsc_aborts: expectedAborts,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  fs.writeFileSync(
    path.join(evidence, "b2c-web-checkout-qc.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      summary: report.summary,
      order_group_id: orderGroupId,
      checkout_ref: checkoutRef,
      order_number: orderNumber,
    }),
  );
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
