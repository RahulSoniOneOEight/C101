/* CHG-089 local browser probe against the staging Experience API (read-only). */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
const access = fs.readFileSync(
  path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt"),
  "utf8",
);
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
if (!otp) throw new Error("PILOT_OTP_CODE missing from the staging access file.");

const base = "http://localhost:3100";
const owner = "nihar1008.nj@gmail.com";
const orderId = "cart_01M5Y54HVDTDJ2MTP6X45Q5W9R";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-089");
const shots = path.join(evidence, "local-screenshots");
fs.mkdirSync(shots, { recursive: true });

const checks = [];
const consoleErrors = [];
const failedRequests = [];
const record = (viewport, name, ok, detail) => {
  checks.push({ viewport, name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${viewport}/${name}: ${detail}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push({ viewport: viewport.name, text: message.text() });
    });
    page.on("pageerror", (error) =>
      consoleErrors.push({ viewport: viewport.name, text: `pageerror: ${error.message}` }),
    );
    page.on("requestfailed", (request) => {
      const error = request.failure()?.errorText ?? "unknown";
      if (request.url().includes("_rsc=") && error.includes("ERR_ABORTED")) return;
      failedRequests.push({ viewport: viewport.name, url: request.url(), error });
    });

    await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
    await page.locator('input[name="identifier"]').fill(owner);
    await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
    await page.locator('input[name="code"]').waitFor({ timeout: 20000 });
    await page.locator('input[name="code"]').fill(otp);
    await page.getByRole("button", { name: /Sign in securely/i }).click();
    await page.waitForURL("**/orders", { timeout: 30000 });
    record(viewport.name, "owner sign-in", page.url().endsWith("/orders"), page.url());

    await page.goto(`${base}/orders/${orderId}`, { waitUntil: "networkidle" });
    const orderText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    record(
      viewport.name,
      "start-return CTA visible",
      (await page.getByRole("link", { name: /Start a return/i }).count()) > 0,
      "order page offers return initiation",
    );
    record(
      viewport.name,
      "returnable units shown",
      /returnable/i.test(orderText),
      "per-line returnable quantity",
    );
    await page.screenshot({ path: path.join(shots, `order-${viewport.name}.png`), fullPage: true });

    await page.getByRole("link", { name: /Start a return/i }).click();
    await page.waitForURL(`**/orders/${orderId}/returns/new`, { timeout: 20000 });
    await page.waitForLoadState("networkidle");
    const formText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const lineRows = await page.locator(".return-line").count();
    record(viewport.name, "return form renders lines", lineRows >= 2, `rows=${lineRows}`);
    record(
      viewport.name,
      "reason options present",
      (await page.locator("form.return-form select option").count()) >= 3,
      "policy reasons rendered",
    );
    record(
      viewport.name,
      "submit disabled with zero quantity",
      await page.getByRole("button", { name: /Request return/i }).isDisabled(),
      "no empty request possible",
    );
    record(
      viewport.name,
      "no money-moves-yet copy",
      /no money moves yet|not a refund/i.test(formText),
      "boundary wording present",
    );
    await page.locator('input[type="number"]').first().fill("1");
    record(
      viewport.name,
      "submit enabled after quantity",
      await page.getByRole("button", { name: /Request return/i }).isEnabled(),
      "quantity unblocks submit",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    record(viewport.name, "no horizontal overflow", overflow, "document width within viewport");
    await page.screenshot({
      path: path.join(shots, `return-form-${viewport.name}.png`),
      fullPage: true,
    });
    await context.close();
  }
  await browser.close();

  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: base,
    api: "https://api-staging.pinakaplay.cloud",
    read_only: true,
    order_id: orderId,
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    console_errors: consoleErrors,
    failed_requests: failedRequests,
  };
  fs.writeFileSync(path.join(evidence, "local-browser-qc.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (consoleErrors.length) console.log("console errors", consoleErrors.length, consoleErrors.slice(0, 3));
  if (failedRequests.length) console.log("failed requests", failedRequests.length, failedRequests.slice(0, 3));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
