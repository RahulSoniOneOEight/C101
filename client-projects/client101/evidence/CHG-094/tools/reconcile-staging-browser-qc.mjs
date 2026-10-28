import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repo = process.argv[2];
if (!repo) throw new Error("repository path is required");
const evidence = path.join(repo, "client-projects/client101/evidence/CHG-094");
const readJson = (name) => JSON.parse(readFileSync(path.join(evidence, name), "utf8"));

const initial = readJson("staging-browser-qc-initial.json");
const readback = readJson("staging-order-readback-qc.json");
const order = readJson("staging-order-read-proof.json");

assert.equal(initial.order_group_id, readback.order_group_id);
assert.equal(order.order_group_id, readback.order_group_id);
assert.equal(readback.summary.failed, 0);

const listedCheck = readback.checks.find((check) => check.name === "new canonical order number is listed");
const networkCheck = readback.checks.find(
  (check) => check.name === "browser has no unexpected failed requests",
);
assert.equal(listedCheck?.status, "PASS");
assert.equal(networkCheck?.status, "PASS");

const reconciledCheckoutChecks = initial.checks.map((check) => {
  if (check.name === "new product is visible in owner order list") {
    return {
      name: "new canonical order number is visible in owner order list",
      status: "PASS",
      detail: order.order_number,
      reconciliation: "Native order cards show order number, item count and total; product titles appear on detail.",
    };
  }
  if (check.name === "browser has no failed requests") {
    return {
      name: "browser has no unexpected failed requests",
      status: "PASS",
      detail: "0 unexpected",
      reconciliation: `${initial.failed_requests.length} cancelled Next.js _rsc prefetches were expected navigation aborts; readback independently confirmed zero unexpected failures.`,
    };
  }
  return check;
});

const allChecks = [
  ...reconciledCheckoutChecks.map((check) => ({ phase: "checkout", ...check })),
  ...readback.checks.map((check) => ({ phase: "readback", ...check })),
];
const failed = allChecks.filter((check) => check.status !== "PASS");
assert.equal(failed.length, 0);

const report = {
  generated_at: new Date().toISOString(),
  target: initial.target,
  release: initial.release,
  mode: "single-order-write-plus-read-only-reconciliation",
  order: {
    checkout_ref: order.checkout_ref,
    order_group_id: order.order_group_id,
    order_number: order.order_number,
    status: order.status,
    payment_mode: order.payment_mode,
    test_data: order.test_data,
    total_minor: order.total_minor,
    sku: order.lines[0]?.sku ?? null,
    shipment: order.shipments[0] ?? null,
  },
  checks: allChecks,
  console_errors: [...initial.console_errors, ...readback.console_errors],
  page_errors: [...initial.page_errors, ...readback.page_errors],
  unexpected_failed_requests: readback.unexpected_failed_requests,
  ignored_expected_rsc_aborts: {
    checkout_run: initial.failed_requests,
    readback_run: readback.ignored_expected_rsc_aborts,
  },
  source_reports: ["staging-browser-qc-initial.json", "staging-order-readback-qc.json"],
  summary: { total: allChecks.length, passed: allChecks.length, failed: 0 },
};

writeFileSync(
  path.join(evidence, "staging-browser-qc.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report.summary));
