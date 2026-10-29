/* CHG-096 staging Admin order-detail QC.
 * Run: node client-projects/client101/evidence/CHG-096/staging-admin-qc.mjs
 *
 * Admin and Seller are separate portals. This QC verifies the Admin order
 * page is Admin-only and no longer renders the role-preview banner.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shotRoot = path.join(__dirname, "screenshots");
fs.mkdirSync(shotRoot, { recursive: true });

const baseAdmin = "https://ops-staging.pinakaplay.cloud/dashboard";
const orderId = "order_01M633BSHHWEMM9YT6K5S7PVCZ";
const orderNumber = "BK-261029-WT4R93";
const release = "6c776fc";

// Admin credentials are read from the local-only staging access file.
const accessPath = path.join(process.env.USERPROFILE || "/root", ".buildkart/staging-access.txt");
const access = fs.readFileSync(accessPath, "utf8");
const adminEmail = access.match(/Email\s*:\s*(.+)/)?.[1]?.trim();
const adminPassword = access.match(/Password\s*:\s*(.+)/)?.[1]?.trim();
if (!adminEmail || !adminPassword) throw new Error("Could not read admin credentials");

const checks = [];
const consoleErrors = [];
const failedRequests = [];
const screenshots = [];

function record(surface, viewport, name, ok, detail) {
  checks.push({ surface, viewport, name, status: ok ? "PASS" : "FAIL", detail });
  if (!ok) console.error(`FAIL ${surface}/${viewport}/${name}: ${detail}`);
}

function attach(page, surface, viewport) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (text.includes("status of 404")) return;
      consoleErrors.push({ surface, viewport, text });
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push({ surface, viewport, text: `pageerror: ${error.message}` });
  });
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (request.url().includes("_rsc=") && error.includes("ERR_ABORTED")) return;
    failedRequests.push({ surface, viewport, url: request.url(), error });
  });
}

async function shot(page, surface, viewport, name) {
  const directory = path.join(shotRoot, surface, viewport);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push(path.relative(__dirname, file).replaceAll("\\", "/"));
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function signInAdmin(page) {
  await page.goto(`${baseAdmin}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(adminEmail);
  await page.locator('input[name="password"]').fill(adminPassword);
  await page.getByRole("button", { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname !== "/dashboard/login" && url.pathname !== "/dashboard/login/", { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    attach(page, "admin", viewport.name);

    await signInAdmin(page);
    record("admin", viewport.name, "login succeeds", page.url().includes("/dashboard"), `url: ${page.url()}`);

    // Navigate to the target order
    await page.goto(`${baseAdmin}/orders/${orderId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // Ensure the Payments card is rendered before reading body text
    await page.getByRole("heading", { name: "Payments" }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const bodyText = await page.locator("body").innerText();
    const bodyTextUpper = bodyText.toUpperCase();
    const orderPresent = bodyText.includes("#151") || bodyText.includes(orderNumber);
    record("admin", viewport.name, "order page loads", orderPresent, `order #151 present`);
    record("admin", viewport.name, "no horizontal overflow", await noOverflow(page), "document width within viewport");
    await shot(page, "admin", viewport.name, "order-admin-default");

    // R1: Admin status strip
    record(
      "admin",
      viewport.name,
      "status strip shows Payment",
      bodyTextUpper.includes("PAYMENT") && bodyTextUpper.includes("DELIVERY") && bodyTextUpper.includes("RETURNS") && bodyTextUpper.includes("REFUND"),
      "Payment/Delivery/Returns/Refund tiles present",
    );

    // R2: Payments card
    record(
      "admin",
      viewport.name,
      "Payments card present",
      bodyTextUpper.includes("AUTHORIZED") && bodyTextUpper.includes("CAPTURED") && bodyTextUpper.includes("REFUNDED") && bodyTextUpper.includes("OUTSTANDING"),
      "payments amounts present",
    );
    record(
      "admin",
      viewport.name,
      "Payments card shows authorized amount",
      /AUTHORIZED\s*₹514\.06/.test(bodyText.replace(/\s+/g, " ")),
      "authorized amount matches order total",
    );
    record(
      "admin",
      viewport.name,
      "Payments card shows outstanding amount",
      /OUTSTANDING\s*₹514\.06/.test(bodyText.replace(/\s+/g, " ")),
      "outstanding amount matches order total",
    );

    // R3: Admin-only page; role-preview banner removed
    record(
      "admin",
      viewport.name,
      "role preview banner removed",
      !bodyTextUpper.includes("PREVIEW AS") &&
        !bodyText.includes("You see payment, delivery and return operations across the marketplace."),
      "no Preview as / Admin view banner",
    );
    record(
      "admin",
      viewport.name,
      "role preview links removed",
      (await page.getByRole("link", { name: "Seller", exact: true }).count()) === 0 &&
        (await page.getByRole("link", { name: "App", exact: true }).count()) === 0 &&
        (await page.getByRole("link", { name: "Web", exact: true }).count()) === 0,
      "no Seller/App/Web preview links",
    );

    // R4: Admin section navigation
    record(
      "admin",
      viewport.name,
      "Jump to nav present",
      bodyTextUpper.includes("JUMP TO") && bodyTextUpper.includes("SUMMARY") && bodyTextUpper.includes("PAYMENTS"),
      "Admin section nav present",
    );

    // R5: Reconciliation card
    record(
      "admin",
      viewport.name,
      "reconciliation card present",
      bodyTextUpper.includes("SYSTEM RECONCILIATION") &&
        bodyTextUpper.includes("ONE FLOW, INDEPENDENTLY VERIFIABLE EFFECTS"),
      "system reconciliation rows present",
    );

    // R6: Attention stack for authorized payment
    record(
      "admin",
      viewport.name,
      "attention shows payment ready to capture",
      bodyTextUpper.includes("PAYMENT READY TO CAPTURE"),
      "capture attention item present",
    );

    // R7: Native actions remain reachable
    record(
      "admin",
      viewport.name,
      "admin mode shows native payment controls",
      bodyTextUpper.includes("NATIVE MEDUSA PAYMENT CONTROLS"),
      "native controls present",
    );
    record(
      "admin",
      viewport.name,
      "admin mode delivery update control present",
      bodyTextUpper.includes("UPDATE DELIVERY STATUS") || bodyTextUpper.includes("NO FURTHER DELIVERY"),
      "delivery section rendered",
    );
    await shot(page, "admin", viewport.name, "order-admin-admin-mode");

    await context.close();
  }

  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    orderId,
    orderNumber,
    release,
    checks,
    summary: {
      pass: checks.filter((c) => c.status === "PASS").length,
      fail: checks.filter((c) => c.status === "FAIL").length,
      consoleErrors: consoleErrors.length,
      failedRequests: failedRequests.length,
    },
    consoleErrors,
    failedRequests,
    screenshots,
  };

  fs.writeFileSync(path.join(__dirname, "staging-admin-qc.json"), JSON.stringify(report, null, 2));
  console.log(`QC complete: ${report.summary.pass}/${checks.length} PASS`);
  if (report.summary.fail > 0) process.exit(1);
})();
