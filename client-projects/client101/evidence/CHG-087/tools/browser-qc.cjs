/* CHG-087 local browser QC. Run with NODE_PATH pointing at the local Playwright install. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
if (!repo) throw new Error("Pass the repository root as the first argument.");

const evidence = path.join(repo, "client-projects/client101/evidence/CHG-087");
const shotRoot = path.join(evidence, "screenshots");
const baseWeb = "http://127.0.0.1:3001";
const baseAdmin = "http://127.0.0.1:7061/index.html";
const baseSeller = "http://127.0.0.1:7062/index.html";
const owner = { identifier: "pilot1@buildkart.test", code: "123456" };
const other = { identifier: "pilot2@buildkart.test", code: "123456" };
const orderId = "checkout_chg087_qc_01";
const returnId = "ret_38b875490a284f808956cbaca24e3b98";
const orderNumber = "BK-261028-QC087";
const simulationReference = "SIM-REFUND-1572BC00";

const checks = [];
const consoleErrors = [];
const failedRequests = [];
const screenshots = [];

function record(surface, viewport, name, ok, detail) {
  checks.push({ surface, viewport, name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${surface}/${viewport}/${name}: ${detail}`);
}

function attach(page, surface, viewport, options = {}) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      // The wrong-owner journey deliberately requests a 404 page; its document response is expected.
      if (options.allowNotFound && text.includes("status of 404")) return;
      consoleErrors.push({ surface, viewport, text });
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push({ surface, viewport, text: `pageerror: ${error.message}` });
  });
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    // Next.js cancels RSC prefetches when the user navigates away; those are not defects.
    if (request.url().includes("_rsc=") && error.includes("ERR_ABORTED")) return;
    failedRequests.push({
      surface,
      viewport,
      url: request.url(),
      error,
    });
  });
}

async function shot(page, surface, viewport, name) {
  const directory = path.join(shotRoot, surface, viewport);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(path.relative(evidence, file).replaceAll("\\", "/"));
}

async function noOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
}

async function signIn(page, identity) {
  await page.goto(`${baseWeb}/sign-in`, { waitUntil: "networkidle" });
  await page.locator('input[name="identifier"]').fill(identity.identifier);
  await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
  await page.locator('input[name="code"]').waitFor({ timeout: 15000 });
  await page.locator('input[name="code"]').fill(identity.code);
  await page.getByRole("button", { name: /Sign in securely/i }).click();
  await page.waitForURL("**/orders", { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

async function keyboardAudit(page) {
  await page.evaluate(() => document.body.focus());
  const focused = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    focused.push(
      await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;
        return {
          tag: element.tagName,
          text: (element.getAttribute("aria-label") || element.textContent || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 50),
        };
      }),
    );
  }
  const usable = focused.filter(Boolean);
  return { count: usable.length, unique: new Set(usable.map((item) => `${item.tag}:${item.text}`)).size };
}

(async () => {
  fs.mkdirSync(shotRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    // ---------------------------------------------------------------- customer web
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    attach(page, "web", viewport.name);
    await page.goto(`${baseWeb}/sign-in`, { waitUntil: "networkidle" });
    record("web", viewport.name, "sign-in renders", (await page.getByRole("heading", { name: "Sign in to post-purchase" }).count()) === 1, "heading present");
    record("web", viewport.name, "sign-in no horizontal overflow", await noOverflow(page), "document width within viewport");
    await shot(page, "web", viewport.name, "sign-in");

    await page.locator('input[name="identifier"]').fill(owner.identifier);
    await page.getByRole("button", { name: /Continue with simulated OTP/i }).click();
    await page.locator('input[name="code"]').waitFor({ timeout: 15000 });
    record("web", viewport.name, "OTP challenge advances", (await page.getByText(/simulated challenge was created/i).count()) === 1, "simulated OTP step shown");
    await shot(page, "web", viewport.name, "otp");
    await page.locator('input[name="code"]').fill(owner.code);
    await page.getByRole("button", { name: /Sign in securely/i }).click();
    await page.waitForURL("**/orders", { timeout: 20000 });
    await page.waitForLoadState("networkidle");
    record("web", viewport.name, "owner sees own order", (await page.getByText(orderNumber, { exact: false }).count()) > 0, "order card present");
    record("web", viewport.name, "orders no horizontal overflow", await noOverflow(page), "document width within viewport");
    await shot(page, "web", viewport.name, "orders");

    await page.goto(`${baseWeb}/orders/${orderId}`, { waitUntil: "networkidle" });
    const orderText = await page.locator("body").innerText();
    record("web", viewport.name, "order detail shows lines and simulated delivery", orderText.includes("Cordless Drill Kit") && orderText.includes("simulated"), "items and simulated marker");
    record("web", viewport.name, "order detail shows closed return", orderText.includes("closed") && orderText.includes("View simulation"), "return row with simulation link");
    record("web", viewport.name, "order detail no horizontal overflow", await noOverflow(page), "document width within viewport");
    await shot(page, "web", viewport.name, "order-detail");

    await page.goto(`${baseWeb}/returns/${returnId}`, { waitUntil: "networkidle" });
    const returnText = await page.locator("body").innerText();
    record("web", viewport.name, "return shows simulated refund", returnText.includes("Simulated refund recorded") && returnText.includes(simulationReference), "simulation reference present");
    record("web", viewport.name, "return says no real money or stock moved", /no real money moved/i.test(returnText.replace(/\s+/g, " ")), "customer-safe wording");
    record("web", viewport.name, "return no horizontal overflow", await noOverflow(page), "document width within viewport");
    await shot(page, "web", viewport.name, "return-detail");

    const keyboard = await keyboardAudit(page);
    record("web", viewport.name, "return page keyboard reachable", keyboard.count >= 6 && keyboard.unique >= 4, `focused ${keyboard.count} controls, ${keyboard.unique} unique`);

    await page.goto(`${baseWeb}/orders`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Sign out/i }).click();
    await page.waitForURL("**/sign-in", { timeout: 15000 });
    record("web", viewport.name, "sign out clears browser session", page.url().endsWith("/sign-in"), "redirected to sign-in");
    await page.goto(`${baseWeb}/orders`, { waitUntil: "networkidle" });
    record("web", viewport.name, "unauthenticated orders redirect", page.url().endsWith("/sign-in"), "orders redirects to sign-in");
    await context.close();

    // Wrong-owner isolation on the same production build.
    const otherContext = await browser.newContext({ viewport });
    const otherPage = await otherContext.newPage();
    attach(otherPage, "web", viewport.name, { allowNotFound: true });
    await signIn(otherPage, other);
    const otherOrdersText = await otherPage.locator("body").innerText();
    record("web", viewport.name, "other customer does not list the order", !otherOrdersText.includes(orderNumber), "order absent from list");
    const otherOrderResponse = await otherPage.goto(`${baseWeb}/orders/${orderId}`, { waitUntil: "networkidle" });
    record("web", viewport.name, "other customer order returns 404", otherOrderResponse.status() === 404, `HTTP ${otherOrderResponse.status()}`);
    await shot(otherPage, "web", viewport.name, "owner-denied-order");
    const otherReturnResponse = await otherPage.goto(`${baseWeb}/returns/${returnId}`, { waitUntil: "networkidle" });
    record("web", viewport.name, "other customer return returns 404", otherReturnResponse.status() === 404, `HTTP ${otherReturnResponse.status()}`);
    await otherContext.close();

    // Unauthenticated direct access.
    const anonymous = await browser.newContext({ viewport });
    const anonymousPage = await anonymous.newPage();
    attach(anonymousPage, "web", viewport.name);
    await anonymousPage.goto(`${baseWeb}/orders/${orderId}`, { waitUntil: "networkidle" });
    record("web", viewport.name, "anonymous order redirects", anonymousPage.url().endsWith("/sign-in"), "redirected to sign-in");
    await anonymousPage.goto(`${baseWeb}/returns/${returnId}`, { waitUntil: "networkidle" });
    record("web", viewport.name, "anonymous return redirects", anonymousPage.url().endsWith("/sign-in"), "redirected to sign-in");
    await anonymous.close();

    // ---------------------------------------------------------------- admin preview
    const admin = await browser.newContext({ viewport });
    const adminPage = await admin.newPage();
    attach(adminPage, "admin", viewport.name);
    const adminCases = [
      ["approved", "Approve return"],
      ["received", "Record inspection as Admin"],
      ["inspection_complete", "Record explicit simulated refund"],
      ["closed", "Simulated Completed"],
    ];
    for (const [stage, expected] of adminCases) {
      await adminPage.goto(`${baseAdmin}?stage=${stage}`, { waitUntil: "networkidle" });
      const text = await adminPage.locator("body").innerText();
      record("admin", viewport.name, `${stage} renders expected control`, text.includes(expected), expected);
      record("admin", viewport.name, `${stage} no horizontal overflow`, await noOverflow(adminPage), "document width within viewport");
      if (stage === "closed") {
        record("admin", viewport.name, "closed shows amount and SIM reference", text.includes("SIM-REFUND-") && text.includes("3,047.00"), "amount and reference present");
        record("admin", viewport.name, "closed shows zero-effect markers", /money effect none/i.test(text) && /stock effect none/i.test(text), "zero-effect markers present");
      }
      await shot(adminPage, "admin", viewport.name, stage.replaceAll("_", "-"));
    }
    await adminPage.goto(`${baseAdmin}?stage=received`, { waitUntil: "networkidle" });
    const adminKeyboard = await keyboardAudit(adminPage);
    record("admin", viewport.name, "admin page keyboard reachable", adminKeyboard.count >= 4 && adminKeyboard.unique >= 3, `focused ${adminKeyboard.count} controls, ${adminKeyboard.unique} unique`);
    await admin.close();

    // ---------------------------------------------------------------- seller preview
    const seller = await browser.newContext({ viewport });
    const sellerPage = await seller.newPage();
    attach(sellerPage, "seller", viewport.name);
    const sellerCases = [
      ["approved", "Mark the return Received"],
      ["received", "Submit inspection"],
      ["inspection_complete", "Inspection recorded"],
      ["closed", "Inspection recorded. Admin controls the refund simulation"],
    ];
    for (const [stage, expected] of sellerCases) {
      await sellerPage.goto(`${baseSeller}?stage=${stage}`, { waitUntil: "networkidle" });
      const text = await sellerPage.locator("body").innerText();
      record("seller", viewport.name, `${stage} renders expected control`, text.includes(expected), expected);
      record("seller", viewport.name, `${stage} no horizontal overflow`, await noOverflow(sellerPage), "document width within viewport");
      if (stage === "closed") {
        record("seller", viewport.name, "seller cannot see refund amount or reference", !text.includes("3,047") && !text.includes("3047") && !text.includes("SIM-"), "amount and reference absent");
        record("seller", viewport.name, "seller sees refund simulation ownership boundary", /Seller cannot create, change or complete it/i.test(text), "Admin-only refund boundary shown");
      }
      await shot(sellerPage, "seller", viewport.name, stage.replaceAll("_", "-"));
    }
    await sellerPage.goto(`${baseSeller}?stage=received`, { waitUntil: "networkidle" });
    const sellerKeyboard = await keyboardAudit(sellerPage);
    record("seller", viewport.name, "seller page keyboard reachable", sellerKeyboard.count >= 4 && sellerKeyboard.unique >= 3, `focused ${sellerKeyboard.count} controls, ${sellerKeyboard.unique} unique`);
    await seller.close();
  }

  await browser.close();

  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    targets: { web: baseWeb, admin: baseAdmin, seller: baseSeller },
    fixture: { order_id: orderId, return_id: returnId, order_number: orderNumber, simulation_reference: simulationReference },
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    console_errors: consoleErrors,
    failed_requests: failedRequests,
    screenshots,
  };
  fs.writeFileSync(path.join(evidence, "browser-qc.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report.summary));
  if (consoleErrors.length) console.log("console errors", JSON.stringify(consoleErrors, null, 2));
  if (failedRequests.length) console.log("failed requests", JSON.stringify(failedRequests, null, 2));
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
