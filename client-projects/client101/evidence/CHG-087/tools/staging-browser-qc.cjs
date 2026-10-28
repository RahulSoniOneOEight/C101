/* CHG-087 hosted staging browser QC. Secrets are read from the local-only access file and never printed. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
if (!repo) throw new Error("Pass the repository root as the first argument.");
const accessFile = path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt");
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, "chg087-fixture.json"), "utf8"));
const access = fs.readFileSync(accessFile, "utf8");
const email = access.match(/^Email\s*:\s*(.+)$/m)?.[1]?.trim();
const password = access.match(/^Password\s*:\s*(.+)$/m)?.[1]?.trim();
const otp = access.match(/^PILOT_OTP_CODE=(.+)$/m)?.[1]?.trim();
if (!email || !password || !otp) throw new Error("Staging access file is missing required fields.");
const seed = fs.readFileSync(path.join(repo, "services/backend/packages/api/src/scripts/seed.ts"), "utf8");
const sellerEmail = "buildmaster@mercur.dev";
const sellerPassword = seed.match(/SELLER_PASSWORD\s*=\s*["']([^"']+)["']/)?.[1];
if (!sellerPassword) throw new Error("Seller seed password was not found in seed.ts.");

const evidence = path.join(repo, "client-projects/client101/evidence/CHG-087");
const shotRoot = path.join(evidence, "staging-screenshots");
const webBase = "https://app-staging.pinakaplay.cloud";
const opsBase = "https://ops-staging.pinakaplay.cloud";
const checks = [];
const consoleErrors = [];
const failedRequests = [];
const screenshots = [];

const record = (surface, viewport, name, ok, detail) => {
  checks.push({ surface, viewport, name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${surface}/${viewport}/${name}: ${detail}`);
};
const attach = (page, surface, viewport) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ surface, viewport, text: message.text() });
  });
  page.on("pageerror", (error) => consoleErrors.push({ surface, viewport, text: `pageerror: ${error.message}` }));
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (request.url().includes("_rsc=") && error.includes("ERR_ABORTED")) return;
    failedRequests.push({ surface, viewport, url: request.url(), error });
  });
};
const shot = async (page, surface, viewport, name) => {
  const directory = path.join(shotRoot, surface, viewport);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(path.relative(evidence, file).replaceAll("\\", "/"));
};
const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const loginAdmin = async (page, url, loginEmail, loginPassword, selectStore = false) => {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').waitFor({ timeout: 20000 });
  await page.locator('input[name="email"]').fill(loginEmail);
  await page.locator('input[name="password"]').fill(loginPassword);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Log in$/i }).click();
  await page.waitForTimeout(2500);
  if (page.url().includes("/login")) {
    await page.locator('input[name="email"]').fill(loginEmail);
    await page.locator('input[name="password"]').fill(loginPassword);
    await page.getByRole("button", { name: /^Log in$/i }).click();
    await page.waitForTimeout(4000);
  }
  if (selectStore && page.url().includes("/store-select")) {
    const store = page.getByRole("button", { name: /BuildMaster Supplies/i });
    await store.waitFor({ timeout: 20000 });
    await store.click();
    await page.waitForTimeout(3000);
  }
};

(async () => {
  fs.mkdirSync(shotRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    // Customer web
    const webContext = await browser.newContext({ viewport });
    const web = await webContext.newPage();
    attach(web, "web", viewport.name);
    await web.goto(`${webBase}/sign-in`, { waitUntil: "networkidle" });
    await web.locator('input[name="identifier"]').fill(fixture.owner_identifier);
    await web.getByRole("button", { name: /Continue with simulated OTP/i }).click();
    await web.locator('input[name="code"]').waitFor({ timeout: 20000 });
    await web.locator('input[name="code"]').fill(otp);
    await web.getByRole("button", { name: /Sign in securely/i }).click();
    await web.waitForURL("**/orders", { timeout: 30000 });
    await web.waitForLoadState("networkidle");
    record("web", viewport.name, "staging OTP sign-in", web.url().endsWith("/orders"), "owner session established");
    record("web", viewport.name, "staging order listed", (await web.getByText("BK-261028-STG087", { exact: false }).count()) > 0, "fixture order visible");
    record("web", viewport.name, "staging orders no overflow", await noOverflow(web), "document width within viewport");
    await shot(web, "web", viewport.name, "orders");

    await web.goto(`${webBase}/orders/${fixture.order_id}`, { waitUntil: "networkidle" });
    const orderText = await web.locator("body").innerText();
    record("web", viewport.name, "staging order detail", orderText.includes("Cordless Drill Kit") && orderText.includes("simulated"), "items and simulated delivery");
    record("web", viewport.name, "staging order detail no overflow", await noOverflow(web), "document width within viewport");
    await shot(web, "web", viewport.name, "order-detail");

    await web.goto(`${webBase}/returns/${fixture.return_id}`, { waitUntil: "networkidle" });
    const returnText = await web.locator("body").innerText();
    record(
      "web",
      viewport.name,
      "staging simulated refund visible",
      returnText.includes("Simulated refund recorded") && returnText.includes(fixture.refund_simulation_reference),
      "simulation reference present",
    );
    record(
      "web",
      viewport.name,
      "staging no-real-money wording",
      /no real money moved/i.test(returnText.replace(/\s+/g, " ")),
      "customer-safe wording",
    );
    record("web", viewport.name, "staging return no overflow", await noOverflow(web), "document width within viewport");
    await shot(web, "web", viewport.name, "return-detail");
    await webContext.close();

    // Admin
    const adminContext = await browser.newContext({ viewport });
    const admin = await adminContext.newPage();
    attach(admin, "admin", viewport.name);
    await loginAdmin(admin, `${opsBase}/dashboard/login`, email, password);
    record("admin", viewport.name, "staging admin sign-in", !admin.url().includes("login"), admin.url());
    await admin.goto(`${opsBase}/dashboard/returns/${fixture.return_id}`, { waitUntil: "networkidle" });
    await admin.getByText("Simulated Completed", { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => {});
    const adminText = await admin.locator("body").innerText();
    record(
      "admin",
      viewport.name,
      "staging admin return visible",
      adminText.includes(fixture.return_id) && /Simulated Completed/i.test(adminText),
      "return and refund summary visible",
    );
    record("admin", viewport.name, "staging admin no overflow", await noOverflow(admin), "document width within viewport");
    await shot(admin, "admin", viewport.name, "return-closed");
    const refundSummary = admin.getByText("Simulated Completed", { exact: false }).first();
    if (await refundSummary.count()) {
      await refundSummary.scrollIntoViewIfNeeded();
      await admin.waitForTimeout(300);
      await shot(admin, "admin", viewport.name, "return-refund-summary");
    }
    await adminContext.close();

    // Seller
    const sellerContext = await browser.newContext({ viewport });
    const seller = await sellerContext.newPage();
    attach(seller, "seller", viewport.name);
    await loginAdmin(seller, `${opsBase}/seller/login`, sellerEmail, sellerPassword, true);
    record("seller", viewport.name, "staging seller sign-in", !seller.url().includes("login"), seller.url());
    await seller.goto(`${opsBase}/seller/returns/${fixture.return_id}`, { waitUntil: "networkidle" });
    await seller.getByText("Inspection", { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => {});
    const sellerText = await seller.locator("body").innerText();
    record("seller", viewport.name, "staging seller return visible", sellerText.includes(fixture.return_id), "return visible");
    record(
      "seller",
      viewport.name,
      "staging seller refund projection redacted",
      !sellerText.includes(fixture.refund_simulation_reference) && !sellerText.includes("3,047.00"),
      "amount and reference absent",
    );
    record("seller", viewport.name, "staging seller no overflow", await noOverflow(seller), "document width within viewport");
    await shot(seller, "seller", viewport.name, "return-closed");
    await sellerContext.close();
  }

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    targets: { web: webBase, ops: opsBase },
    fixture: {
      order_id: fixture.order_id,
      return_id: fixture.return_id,
      refund_simulation_reference: fixture.refund_simulation_reference,
    },
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    console_errors: consoleErrors,
    failed_requests: failedRequests,
    screenshots,
  };
  fs.writeFileSync(path.join(evidence, "staging-browser-qc.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report.summary));
  if (consoleErrors.length) console.log("console errors", consoleErrors.length);
  if (failedRequests.length) console.log("failed requests", failedRequests.length);
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
