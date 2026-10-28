/* CHG-088 hosted staging order-page QC. Secrets come from the local-only access file and are never printed. */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repo = process.argv[2];
const phase = process.argv[3] ?? "received";
if (!repo) throw new Error("Pass the repository root as the first argument.");

const accessFile = path.join(process.env.USERPROFILE, ".buildkart", "staging-access.txt");
const access = fs.readFileSync(accessFile, "utf8");
const email = access.match(/^Email\s*:\s*(.+)$/m)?.[1]?.trim();
const password = access.match(/^Password\s*:\s*(.+)$/m)?.[1]?.trim();
if (!email || !password) throw new Error("Staging access file is missing required fields.");
const seed = fs.readFileSync(
  path.join(repo, "services/backend/packages/api/src/scripts/seed.ts"),
  "utf8",
);
const sellerEmail = "buildmaster@mercur.dev";
const sellerPassword = seed.match(/SELLER_PASSWORD\s*=\s*["']([^"']+)["']/)?.[1];
if (!sellerPassword) throw new Error("Seller seed password was not found in seed.ts.");

const fixturePath = path.join(process.env.TEMP, "chg088-fixture.json");
const fixture = fs.existsSync(fixturePath)
  ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
  : {};
const adminOrderId = fixture.admin_order_id;
const sellerOrderId = fixture.seller_order_id ?? fixture.admin_order_id;
const deliveryOrderId = fixture.delivery_order_id;
const refundReference = fixture.refund_simulation_reference;
if (!adminOrderId) throw new Error("chg088-fixture.json is missing admin_order_id.");

const evidence = path.join(repo, "client-projects/client101/evidence/CHG-088");
const shotRoot = path.join(evidence, "staging-screenshots");
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
  page.on("pageerror", (error) =>
    consoleErrors.push({ surface, viewport, text: `pageerror: ${error.message}` }),
  );
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (request.url().includes("_rsc=") && error.includes("ERR_ABORTED")) return;
    failedRequests.push({ surface, viewport, url: request.url(), error });
  });
};
const shot = async (page, surface, viewport, name, fullPage = true) => {
  const directory = path.join(shotRoot, surface, viewport);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  screenshots.push(path.relative(evidence, file).replaceAll("\\", "/"));
};
const shotRegion = async (page, surface, viewport, name, locator) => {
  if (!(await locator.count())) return;
  await locator.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, surface, viewport, name, false);
};
const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

const login = async (page, url, loginEmail, loginPassword, storeName) => {
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
  if (storeName && page.url().includes("/store-select")) {
    const store = page.getByRole("button", { name: new RegExp(storeName, "i") });
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

  if (phase === "probe") {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await login(page, `${opsBase}/seller/login`, sellerEmail, sellerPassword, "BuildMaster Supplies");
    await page.goto(`${opsBase}/seller/orders`, { waitUntil: "networkidle" });
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href*='/orders/']")).map((anchor) => ({
        href: anchor.getAttribute("href"),
        text: (anchor.textContent || "").slice(0, 120),
      })),
    );
    console.log(JSON.stringify({ url: page.url(), rows: rows.slice(0, 40) }, null, 2));
    await browser.close();
    return;
  }

  for (const viewport of viewports) {
    const adminContext = await browser.newContext({ viewport });
    const admin = await adminContext.newPage();
    attach(admin, "admin", viewport.name);
    await login(admin, `${opsBase}/dashboard/login`, email, password);
    record("admin", viewport.name, "admin sign-in", !admin.url().includes("login"), admin.url());
    await admin.goto(`${opsBase}/dashboard/orders/${adminOrderId}`, { waitUntil: "networkidle" });
    await admin
      .getByText("Delivery and returns", { exact: false })
      .first()
      .waitFor({ timeout: 25000 })
      .catch(() => {});
    await admin.waitForTimeout(1500);
    const adminText = await text(admin);

    record(
      "admin",
      viewport.name,
      "order page delivery/returns section",
      adminText.includes("Delivery and returns"),
      "section rendered",
    );
    record(
      "admin",
      viewport.name,
      "no premature return-completed label",
      !adminText.includes("Return Completed"),
      "legacy label absent",
    );
    record(
      "admin",
      viewport.name,
      "return workbench link present",
      adminText.includes("Open return workbench"),
      "link to full CHG-087 workbench",
    );
    record(
      "admin",
      viewport.name,
      "no update form when no transition remains",
      (await admin.locator('label:has-text("Delivery status") select').count()) === 0,
      "delivered shipments expose no further transition",
    );

    if (phase === "received") {
      record(
        "admin",
        viewport.name,
        "received shows inspection pending",
        adminText.includes("Received") && /inspection pending/i.test(adminText),
        "received is not reported as completed",
      );
      record(
        "admin",
        viewport.name,
        "order tile shows inspection state",
        /Inspection/i.test(adminText),
        "operations tile carries inspection context",
      );
    } else if (phase === "inspected") {
      record(
        "admin",
        viewport.name,
        "inspection complete shows refund pending",
        /Inspection complete/i.test(adminText) && /refund pending/i.test(adminText),
        "refund simulation pending is explicit",
      );
      record(
        "admin",
        viewport.name,
        "refund not yet shown",
        !refundReference || !adminText.includes(refundReference),
        "no simulation reference before it is recorded",
      );
    } else if (phase === "refunded") {
      record(
        "admin",
        viewport.name,
        "simulated refund visible",
        Boolean(refundReference) && adminText.includes(refundReference),
        "SIM reference on the order page",
      );
      record(
        "admin",
        viewport.name,
        "no-real-money wording",
        /no real money and stock moved|no real money/i.test(adminText),
        "zero-effect disclosure present",
      );
    }
    record("admin", viewport.name, "admin order page no overflow", await noOverflow(admin), "width within viewport");
    await shot(admin, "admin", viewport.name, `order-${phase}`);
    await shotRegion(
      admin,
      "admin",
      viewport.name,
      `order-${phase}-returns-card`,
      admin.getByText("Open return workbench", { exact: false }),
    );

    if (deliveryOrderId) {
      await admin.goto(`${opsBase}/dashboard/orders/${deliveryOrderId}`, { waitUntil: "networkidle" });
      await admin
        .getByText("Delivery and returns", { exact: false })
        .first()
        .waitFor({ timeout: 25000 })
        .catch(() => {});
      await admin.waitForTimeout(1500);
      const adminDisclosure = admin.getByText("Update delivery status", { exact: false }).first();
      if (await adminDisclosure.count()) {
        await adminDisclosure.click();
        await admin.waitForTimeout(500);
      }
      const adminDeliveryOptions = await admin
        .locator('label:has-text("Delivery status") select option')
        .allTextContents();
      record(
        "admin",
        viewport.name,
        "booking order exposes every allowed transition",
        ["Ready for pickup", "Dispatched", "Cancelled"].every((label) =>
          adminDeliveryOptions.includes(label),
        ) && adminDeliveryOptions.length === 3,
        `options=${JSON.stringify(adminDeliveryOptions)}`,
      );
      await shotRegion(
        admin,
        "admin",
        viewport.name,
        "order-delivery-form",
        admin.locator('label:has-text("Delivery status")'),
      );
    }
    await adminContext.close();

    const sellerContext = await browser.newContext({ viewport });
    const seller = await sellerContext.newPage();
    attach(seller, "seller", viewport.name);
    await login(seller, `${opsBase}/seller/login`, sellerEmail, sellerPassword, "BuildMaster Supplies");
    record("seller", viewport.name, "seller sign-in", !seller.url().includes("login"), seller.url());
    await seller.goto(`${opsBase}/seller/orders/${sellerOrderId}`, { waitUntil: "networkidle" });
    await seller
      .getByText("Delivery and returns", { exact: false })
      .first()
      .waitFor({ timeout: 25000 })
      .catch(() => {});
    await seller.waitForTimeout(1500);
    const sellerText = await text(seller);

    record(
      "seller",
      viewport.name,
      "seller order page delivery/returns section",
      sellerText.includes("Delivery and returns"),
      "section rendered",
    );
    record(
      "seller",
      viewport.name,
      "no premature return-completed label",
      !sellerText.includes("Return Completed"),
      "legacy label absent",
    );
    record(
      "seller",
      viewport.name,
      "seller never sees refund reference",
      !refundReference || !sellerText.includes(refundReference),
      "refund simulation redacted",
    );
    record(
      "seller",
      viewport.name,
      "seller has no refund action",
      !/Record simulated refund/i.test(sellerText) && !/Approve return/i.test(sellerText),
      "decision/refund actions stay with Admin",
    );
    record(
      "seller",
      viewport.name,
      "seller order page no overflow",
      await noOverflow(seller),
      "width within viewport",
    );
    await shot(seller, "seller", viewport.name, `order-${phase}`);
    await shotRegion(
      seller,
      "seller",
      viewport.name,
      `order-${phase}-returns-card`,
      seller.getByText("Open return workbench", { exact: false }),
    );

    if (deliveryOrderId) {
      await seller.goto(`${opsBase}/seller/orders/${deliveryOrderId}`, { waitUntil: "networkidle" });
      await seller
        .getByText("Delivery and returns", { exact: false })
        .first()
        .waitFor({ timeout: 25000 })
        .catch(() => {});
      await seller.waitForTimeout(1500);
      const sellerDisclosure = seller.getByText("Update delivery status", { exact: false }).first();
      if (await sellerDisclosure.count()) {
        await sellerDisclosure.click();
        await seller.waitForTimeout(500);
      }
      const sellerDeliveryOptions = await seller
        .locator('label:has-text("Delivery status") select option')
        .allTextContents();
      record(
        "seller",
        viewport.name,
        "seller transitions exclude admin cancellation",
        ["Ready for pickup", "Dispatched"].every((label) =>
          sellerDeliveryOptions.includes(label),
        ) &&
          !sellerDeliveryOptions.includes("Cancelled") &&
          sellerDeliveryOptions.length === 2,
        `options=${JSON.stringify(sellerDeliveryOptions)}`,
      );
      await shotRegion(
        seller,
        "seller",
        viewport.name,
        "order-delivery-form",
        seller.locator('label:has-text("Delivery status")'),
      );
    }
    await sellerContext.close();
  }

  await browser.close();
  const failed = checks.filter((check) => check.status === "FAIL");
  const report = {
    generated_at: new Date().toISOString(),
    phase,
    targets: { ops: opsBase },
    order: { admin_order_id: adminOrderId, seller_order_id: sellerOrderId, group: fixture.order_group_id },
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    console_errors: consoleErrors,
    failed_requests: failedRequests,
    screenshots,
  };
  fs.writeFileSync(
    path.join(evidence, `staging-order-qc-${phase}.json`),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report.summary));
  if (consoleErrors.length) console.log("console errors", consoleErrors.length);
  if (failedRequests.length) console.log("failed requests", failedRequests.length);
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
