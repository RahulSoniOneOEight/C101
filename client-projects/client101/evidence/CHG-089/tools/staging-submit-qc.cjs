/* CHG-089 staging submit-path QC. Secrets come from the local-only access file and are not printed. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
if (!repo) throw new Error("Pass the repository root as the first argument.");
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"),
  "utf8",
);
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
if (!otp) throw new Error("PILOT_OTP_CODE missing from the staging access file.");

const webBase = "https://app-staging.pinakaplay.cloud";
const owner = "nihar1008.nj@gmail.com";
const orderId = "cart_01M5Y54HVDTDJ2MTP6X45Q5W9R";
const note = "CHG-089 staging QC: temporary return, safe to remove.";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-089");
const shotRoot = path.join(evidence, "staging-screenshots");
const checks = [];
const consoleErrors = [];
const failedRequests = [];
const screenshots = [];

const record = (viewport, name, ok, detail) => {
  checks.push({ viewport, name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${viewport}/${name}: ${detail}`);
};
const attach = (page, viewport) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ viewport, text: message.text() });
  });
  page.on("pageerror", (error) => consoleErrors.push({ viewport, text: `pageerror: ${error.message}` }));
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (request.url().includes("_rsc=") && error.includes("ERR_ABORTED")) return;
    failedRequests.push({ viewport, url: request.url(), error });
  });
};
const shot = async (page, viewport, name, fullPage = true) => {
  const directory = path.join(shotRoot, viewport);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  screenshots.push(path.relative(evidence, file).replaceAll("\\", "/"));
};
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const signIn = async (page) => {
  await page.goto(`${webBase}/sign-in`, { waitUntil: "networkidle" });
  await page.locator('input[name="identifier"]').fill(owner);
  await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await page.locator('input[name="code"]').waitFor({ timeout: 20000 });
  await page.locator('input[name="code"]').fill(otp);
  await page.getByRole("button", { name: /Sign in securely/i }).click();
  await page.waitForURL("**/orders", { timeout: 30000 });
};

(async () => {
  fs.mkdirSync(shotRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // Desktop: submit the return.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  attach(page, "desktop");
  await signIn(page);
  record("desktop", "owner sign-in", page.url().endsWith("/orders"), page.url());

  await page.goto(`${webBase}/orders/${orderId}`, { waitUntil: "networkidle" });
  const startLink = page.getByRole("link", { name: /Start a return/i });
  record("desktop", "start-return action", (await startLink.count()) === 1, "order page CTA");
  await shot(page, "desktop", "order");

  await startLink.click();
  await page.waitForURL(`**/orders/${orderId}/returns/new`, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  record(
    "desktop",
    "return form rendered",
    (await page.locator(".return-line").count()) >= 1,
    `${await page.locator(".return-line").count()} eligible line(s)`,
  );

  await page.locator(".return-line input[type=number]").first().fill("1");
  await page.locator("textarea").fill(note);
  await shot(page, "desktop", "return-form");

  const submit = page.getByRole("button", { name: /Request return/i });
  record("desktop", "submit enabled after quantity", await submit.isEnabled(), "one unit selected");
  await submit.click();
  await page.waitForURL("**/returns/ret_*", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  const returnUrl = page.url();
  const returnId = returnUrl.split("/returns/")[1]?.split(/[?#]/)[0] ?? "";
  record("desktop", "return created", /^ret_/.test(returnId), returnUrl);

  const returnText = await text(page);
  record("desktop", "return reference shown", returnText.includes(returnId), "owner-scoped reference");
  record("desktop", "status is requested", /requested/i.test(returnText), "no decision or refund claimed");
  record(
    "desktop",
    "progress starts at request recorded",
    /request recorded/i.test(returnText),
    "lifecycle progress rendered",
  );
  record(
    "desktop",
    "no-refund boundary wording",
    /does not mean a payment was refunded/i.test(returnText),
    "simulation disclosure present",
  );
  await shot(page, "desktop", "return-created");

  await page.goto(`${webBase}/orders/${orderId}`, { waitUntil: "networkidle" });
  record(
    "desktop",
    "new return listed on the order",
    (await page.locator(`a[href="/returns/${returnId}"]`).count()) === 1,
    "order returns list links to the new case",
  );
  await shot(page, "desktop", "order-with-return");
  record(
    "desktop",
    "no horizontal overflow",
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "desktop width within viewport",
  );
  await desktop.close();

  // Mobile: read the same return.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await mobile.newPage();
  attach(phone, "mobile");
  await signIn(phone);
  await phone.goto(`${webBase}/returns/${returnId}`, { waitUntil: "networkidle" });
  const phoneText = await text(phone);
  record("mobile", "return visible for owner", phoneText.includes(returnId), "owner scoped");
  record(
    "mobile",
    "no horizontal overflow",
    await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "mobile width within viewport",
  );
  await shot(phone, "mobile", "return-created");
  await mobile.close();

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: webBase,
    order_id: orderId,
    return_id: returnId,
    fixture_note: note,
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    console_errors: consoleErrors,
    failed_requests: failedRequests,
    screenshots,
  };
  fs.writeFileSync(path.join(evidence, "staging-submit-qc.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(process.env.TEMP, "chg089-fixture.json"),
    JSON.stringify({ return_id: returnId, order_id: orderId, note, created_at: new Date().toISOString() }, null, 2),
  );
  console.log(JSON.stringify(report.summary));
  console.log("return", returnId);
  if (consoleErrors.length) console.log("console errors", consoleErrors.length, consoleErrors.slice(0, 3));
  if (failedRequests.length) console.log("failed requests", failedRequests.length, failedRequests.slice(0, 3));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
