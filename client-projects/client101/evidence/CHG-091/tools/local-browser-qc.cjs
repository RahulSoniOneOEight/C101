/* CHG-091 local read-only QC for the customer returns index. */
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
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-091");
const shots = path.join(evidence, "local-screenshots");
fs.mkdirSync(shots, { recursive: true });

const checks = [];
const consoleErrors = [];
const failedRequests = [];
const record = (viewport, name, ok, detail) => {
  checks.push({ viewport, name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${viewport}/${name}: ${detail}`);
};
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

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

    const navReturns = page.getByRole("link", { name: /^Returns$/i });
    record(viewport.name, "returns nav link", (await navReturns.count()) === 1, "primary navigation");

    await page.goto(`${base}/returns`, { waitUntil: "networkidle" });
    const listText = await text(page);
    const rows = await page.locator("a.return-row").count();
    record(viewport.name, "returns page loads", page.url().endsWith("/returns"), page.url());
    record(viewport.name, "existing return listed", rows >= 1, `rows=${rows}`);
    record(
      viewport.name,
      "status vocabulary",
      /approved|requested|closed|received|inspection/i.test(listText),
      "status label rendered",
    );
    record(
      viewport.name,
      "not-a-refund wording",
      /not a refund|not mean a payment was refunded/i.test(listText),
      "boundary wording",
    );
    const href = await page.locator("a.return-row").first().getAttribute("href");
    record(viewport.name, "row links to return detail", Boolean(href?.startsWith("/returns/")), href ?? "none");
    await page.screenshot({ path: path.join(shots, `returns-${viewport.name}.png`), fullPage: true });

    await page.locator("a.return-row").first().click();
    await page.waitForURL("**/returns/ret_*", { timeout: 20000 });
    await page.waitForLoadState("networkidle");
    record(
      viewport.name,
      "detail opens from the list",
      (await text(page)).includes("Progress"),
      page.url(),
    );
    record(
      viewport.name,
      "no horizontal overflow",
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "width within viewport",
    );
    await context.close();
  }
  await browser.close();

  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    target: base,
    api: "https://api-staging.pinakaplay.cloud",
    read_only: true,
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
