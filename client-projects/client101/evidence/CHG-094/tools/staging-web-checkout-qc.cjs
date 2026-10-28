/* CHG-094 deployed staging web checkout QC. Creates exactly one simulated B2C order. */
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
const productId = "prod_01M59JS4A6QTH32AXVW9P2D3A3";
const sku = "XZ5QR";
const owner = "nihar1008.nj@gmail.com";
const checkoutPath = `/checkout?productId=${productId}&sku=${sku}`;
const checkoutUrl = `${base}${checkoutPath}`;
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-094");
const desktopDir = path.join(evidence, "staging-screenshots", "desktop");
const mobileDir = path.join(evidence, "staging-screenshots", "mobile");
fs.mkdirSync(desktopDir, { recursive: true });
fs.mkdirSync(mobileDir, { recursive: true });

const checks = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
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
  page.on("requestfailed", (request) => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
  });

  await page.goto(checkoutUrl, { waitUntil: "networkidle" });
  const gatedUrl = new URL(page.url());
  record("signed-out checkout redirects to sign-in", gatedUrl.pathname === "/sign-in", page.url());
  record(
    "redirect preserves the exact checkout path",
    gatedUrl.searchParams.get("next") === checkoutPath,
    gatedUrl.searchParams.get("next") ?? "missing next",
  );
  await page.screenshot({ path: path.join(desktopDir, "sign-in-gate.png"), fullPage: true });

  await page.locator('input[name="identifier"]').fill(owner);
  await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await page.locator('input[name="code"]').waitFor({ timeout: 20_000 });
  await page.locator('input[name="code"]').fill(otp);
  await page.getByRole("button", { name: /Sign in securely/i }).click();
  await page.waitForURL("**/checkout?**", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  record("sign-in returns to exact checkout", page.url() === checkoutUrl, page.url());

  const cookies = await context.cookies(base);
  const sessionCookie = cookies.find((cookie) => cookie.name === "buildkart_pilot_session");
  record(
    "session remains HTTP-only and secure",
    Boolean(sessionCookie?.httpOnly && sessionCookie?.secure),
    sessionCookie
      ? `httpOnly=${sessionCookie.httpOnly}; secure=${sessionCookie.secure}; sameSite=${sessionCookie.sameSite}`
      : "session cookie missing",
  );

  const checkoutBody = await bodyText(page);
  record("checkout renders the selected product", checkoutBody.includes("Action Tesa HDHMR Board"), "product title");
  record("checkout renders the selected SKU", checkoutBody.includes(sku), sku);
  record("desktop checkout has no horizontal overflow", !(await hasOverflow(page)), "1440x900");
  await page.locator('input[name="email"]').fill(owner);
  await page.screenshot({ path: path.join(desktopDir, "checkout-form.png"), fullPage: true });

  const checkoutResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/checkout` && response.request().method() === "POST",
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: /Place order/i }).click();
  const checkoutResponse = await checkoutResponsePromise;
  const checkoutPayload = await checkoutResponse.json();
  await page.locator(".notice.ok").waitFor({ timeout: 90_000 });

  const orderGroupId = checkoutPayload?.order_group?.id ?? null;
  record("checkout route returns 200", checkoutResponse.status() === 200, String(checkoutResponse.status()));
  record(
    "server returns a canonical order group",
    checkoutPayload?.type === "order_group" && /^og_[A-Z0-9]+$/.test(orderGroupId ?? ""),
    orderGroupId ?? "missing",
  );
  record(
    "payment is explicitly simulated test data",
    checkoutPayload?.payment?.payment_mode === "simulated" && checkoutPayload?.payment?.test_data === true,
    `${checkoutPayload?.payment?.payment_mode ?? "missing"}; test_data=${checkoutPayload?.payment?.test_data ?? "missing"}`,
  );
  const confirmationBody = await bodyText(page);
  record(
    "confirmation displays the canonical group",
    Boolean(orderGroupId && confirmationBody.includes(orderGroupId)),
    orderGroupId ?? "missing",
  );
  await page.screenshot({ path: path.join(desktopDir, "checkout-confirmed.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  record("mobile confirmation has no horizontal overflow", !(await hasOverflow(page)), "390x844");
  await page.screenshot({ path: path.join(mobileDir, "checkout-confirmed.png"), fullPage: true });

  await page.goto(`${base}/orders`, { waitUntil: "networkidle" });
  const ordersBody = await bodyText(page);
  record("owner order list renders after checkout", /Orders/i.test(ordersBody), "orders heading");
  record("new product is visible in owner order list", ordersBody.includes("Action Tesa"), "product title");
  record("mobile owner order list has no horizontal overflow", !(await hasOverflow(page)), "390x844");
  await page.screenshot({ path: path.join(mobileDir, "orders-after-checkout.png"), fullPage: true });

  record("browser console has no errors", consoleErrors.length === 0, `${consoleErrors.length}`);
  record("page has no uncaught errors", pageErrors.length === 0, `${pageErrors.length}`);
  record("browser has no failed requests", failedRequests.length === 0, `${failedRequests.length}`);

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: base,
    release: "b7f93b9b6e4038d87f42e8f6a0b0fb852b485f5c",
    product_id: productId,
    sku,
    owner,
    order_group_id: orderGroupId,
    checkout_response: {
      status: checkoutResponse.status(),
      type: checkoutPayload?.type ?? null,
      payment_mode: checkoutPayload?.payment?.payment_mode ?? null,
      test_data: checkoutPayload?.payment?.test_data ?? null,
    },
    checks,
    console_errors: consoleErrors,
    page_errors: pageErrors,
    failed_requests: failedRequests,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  fs.writeFileSync(
    path.join(evidence, "staging-browser-qc.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({ summary: report.summary, order_group_id: orderGroupId }));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
