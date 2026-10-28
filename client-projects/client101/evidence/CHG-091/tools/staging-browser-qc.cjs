/* CHG-091 staging QC for the customer returns index (read-only). */
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

const webBase = "https://app-staging.pinakaplay.cloud";
const owner = "nihar1008.nj@gmail.com";
const orderId = "cart_01M5Y54HVDTDJ2MTP6X45Q5W9R";
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-091");
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
const shot = async (page, viewport, name) => {
  const directory = path.join(shotRoot, viewport);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
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
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    attach(page, viewport.name);
    await signIn(page);
    record(viewport.name, "owner sign-in", page.url().endsWith("/orders"), page.url());

    const navReturns = page.getByRole("link", { name: /^Returns$/i });
    record(viewport.name, "returns nav link", (await navReturns.count()) === 1, "primary navigation");
    await navReturns.first().click();
    await page.waitForURL("**/returns", { timeout: 20000 });
    await page.waitForLoadState("networkidle");

    const listText = await text(page);
    const rows = await page.locator("a.return-row").count();
    record(viewport.name, "returns index loads", page.url().endsWith("/returns"), page.url());
    record(viewport.name, "owner returns listed", rows >= 1, `rows=${rows}`);
    record(
      viewport.name,
      "status vocabulary",
      /approved|requested|rejected|closed|received|inspection/i.test(listText),
      "status rendered",
    );
    record(
      viewport.name,
      "not-a-refund wording",
      /not a refund/i.test(listText),
      "boundary wording",
    );
    const href = await page.locator("a.return-row").first().getAttribute("href");
    record(viewport.name, "row links to detail", Boolean(href?.startsWith("/returns/")), href ?? "none");
    record(
      viewport.name,
      "no overflow on index",
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "width within viewport",
    );
    await shot(page, viewport.name, "returns-index");

    await page.locator("a.return-row").first().click();
    await page.waitForURL("**/returns/ret_*", { timeout: 20000 });
    await page.waitForLoadState("networkidle");
    record(viewport.name, "detail opens from list", (await text(page)).includes("Progress"), page.url());
    record(
      viewport.name,
      "no overflow on detail",
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "width within viewport",
    );
    await shot(page, viewport.name, "return-detail");

    await page.goto(`${webBase}/orders/${orderId}`, { waitUntil: "networkidle" });
    record(
      viewport.name,
      "return initiation still present",
      (await page.getByRole("link", { name: /Start a return/i }).count()) === 1,
      "no regression on CHG-089 entry point",
    );
    await context.close();
  }
  await browser.close();

  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: webBase,
    read_only: true,
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    console_errors: consoleErrors,
    failed_requests: failedRequests,
    screenshots,
  };
  fs.writeFileSync(path.join(evidence, "staging-browser-qc.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  if (consoleErrors.length) console.log("console errors", consoleErrors.length, consoleErrors.slice(0, 3));
  if (failedRequests.length) console.log("failed requests", failedRequests.length, failedRequests.slice(0, 3));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
