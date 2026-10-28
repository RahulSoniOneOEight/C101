/* CHG-087 zero financial/stock effect evidence. Read-only DB fingerprints around a real replay. */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repo = process.argv[2];
if (!repo) throw new Error("Pass the repository root as the first argument.");

const evidence = path.join(repo, "client-projects/client101/evidence/CHG-087");
const base = "http://127.0.0.1:59020";
const secret = "buildkart-staging-dummy-admin-service-secret";
const returnId = "ret_38b875490a284f808956cbaca24e3b98";
const orderId = "checkout_chg087_qc_01";
const operationKey = "browser-refund:chg087_qc_01";

const psql = (container, database, user, sql) =>
  execFileSync(
    "docker",
    ["exec", container, "psql", "-U", user, "-d", database, "-At", "-F", "\t", "-c", sql],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, count, fingerprint] = line.split("\t");
      return { name, count: Number(count), fingerprint };
    });

const medusaSql = `
  SELECT 'payment', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM payment t
  UNION ALL SELECT 'refund', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM refund t
  UNION ALL SELECT 'order_transaction', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM order_transaction t
  UNION ALL SELECT 'payment_collection', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM payment_collection t
  UNION ALL SELECT 'payment_session', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM payment_session t
  ORDER BY 1`;

const trytonSql = `
  SELECT 'stock_move', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM stock_move t
  UNION ALL SELECT 'stock_shipment_in', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM stock_shipment_in t
  UNION ALL SELECT 'stock_shipment_in_return', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM stock_shipment_in_return t
  UNION ALL SELECT 'stock_shipment_internal', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM stock_shipment_internal t
  UNION ALL SELECT 'stock_shipment_out', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM stock_shipment_out t
  UNION ALL SELECT 'stock_shipment_out_return', count(*)::text, coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') FROM stock_shipment_out_return t
  ORDER BY 1`;

const isolatedSql = `
  SELECT 'return_case', '1', status || ':' || version FROM pilot_return_case WHERE id = '${returnId}'
  UNION ALL SELECT 'refund_simulations', count(*)::text, '' FROM pilot_return_refund_simulation WHERE return_case_id = '${returnId}'
  UNION ALL SELECT 'return_events', count(*)::text, '' FROM pilot_return_event WHERE return_case_id = '${returnId}'
  UNION ALL SELECT 'domain_events', count(*)::text, '' FROM domain_event WHERE aggregate_type = 'return' AND aggregate_id = '${returnId}'
  ORDER BY 1`;

const snapshot = () => ({
  medusa: psql("buildkart_postgres", "buildkart", "buildkart", medusaSql),
  tryton: psql("buildkart_postgres", "buildkart_tryton", "buildkart", trytonSql),
  isolated: psql("chg087_pg", "buildkart_experience", "buildkart", isolatedSql),
});

async function jsonRequest(pathname, init) {
  const response = await fetch(`${base}${pathname}`, init);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

(async () => {
  const before = snapshot();

  const challenge = await jsonRequest("/v1/auth/otp/challenges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "pilot1@buildkart.test" }),
  });
  if (challenge.status !== 201) throw new Error("Could not create owner challenge.");
  const verified = await jsonRequest("/v1/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.body.challenge_id, code: "123456" }),
  });
  if (verified.status !== 200) throw new Error("Could not verify owner session.");
  const ownerToken = verified.body.session_token;

  const replay = await jsonRequest(`/v1/admin/returns/${returnId}/refund-simulation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-buildkart-admin-service-secret": secret,
      "x-operator-user-id": "operator_qc",
      "x-correlation-id": "chg087-zero-effect",
    },
    body: JSON.stringify({
      expected_version: 5,
      operation_key: operationKey,
      amount_minor: 304700,
      currency_code: "INR",
      method: "original_method_simulation",
      breakdown: {
        item_subtotal_minor: 299800,
        tax_minor: 0,
        shipping_minor: 4900,
        restocking_fee_minor: 0,
        return_freight_minor: 0,
      },
    }),
  });
  if (replay.status !== 200 || replay.body.duplicate !== true) {
    throw new Error(`Replay was not idempotent: ${replay.status} ${JSON.stringify(replay.body)}`);
  }

  const ownerRead = await jsonRequest(`/v1/returns/${returnId}`, {
    headers: { authorization: `Bearer ${ownerToken}`, "x-correlation-id": "chg087-zero-effect" },
  });
  const sellerRead = await jsonRequest(`/v1/seller/returns/${returnId}`, {
    headers: {
      "x-buildkart-admin-service-secret": secret,
      "x-buildkart-seller-id": "seller_qc_01",
      "x-correlation-id": "chg087-zero-effect",
    },
  });

  const after = snapshot();
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const medusaUnchanged = equal(before.medusa, after.medusa);
  const trytonUnchanged = equal(before.tryton, after.tryton);
  const isolatedUnchanged = equal(before.isolated, after.isolated);
  const sellerRedacted = sellerRead.body.return.refundSimulation === null;

  const output = {
    generated_at: new Date().toISOString(),
    exercise: {
      description:
        "Replayed the existing Admin refund simulation and read the same return as its owner and as the scoped Seller against the isolated Experience API.",
      replay_status: replay.status,
      replay_duplicate: replay.body.duplicate,
      replay_return_status: replay.body.return.status,
      replay_simulation_reference: replay.body.refund_simulation.simulationReference,
      owner_read_status: ownerRead.status,
      owner_refund_amount_minor: ownerRead.body.return.refundSimulation.amountMinor,
      seller_read_status: sellerRead.status,
      seller_refund_simulation: sellerRead.body.return.refundSimulation,
      seller_redacted: sellerRedacted,
    },
    medusa: {
      identity: "buildkart_postgres / buildkart (local integration Medusa schema)",
      before: before.medusa,
      after: after.medusa,
      unchanged: medusaUnchanged,
    },
    tryton: {
      identity: "buildkart_postgres / buildkart_tryton (local integration Tryton schema)",
      before: before.tryton,
      after: after.tryton,
      unchanged: trytonUnchanged,
    },
    isolated_return: {
      identity: "chg087_pg / buildkart_experience (disposable CHG-087 database)",
      before: before.isolated,
      after: after.isolated,
      unchanged: isolatedUnchanged,
    },
    conclusion: {
      medusa_financial_rows_unchanged: medusaUnchanged,
      tryton_stock_rows_unchanged: trytonUnchanged,
      return_projection_unchanged_by_replay: isolatedUnchanged,
      seller_refund_projection_hidden: sellerRedacted,
      pass: medusaUnchanged && trytonUnchanged && isolatedUnchanged && sellerRedacted,
    },
  };
  fs.writeFileSync(
    path.join(evidence, "zero-effect-evidence.json"),
    JSON.stringify(output, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(output.conclusion));
  if (!output.conclusion.pass) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
