import { model } from "@medusajs/framework/utils";

const SettlementStatement = model.define("settlement_statement", {
  id: model.id({ prefix: "ststmt" }).primaryKey(),
  statement_number: model.text().unique(),
  seller_id: model.text(),
  seller_name: model.text(),
  period_start: model.dateTime(),
  period_end: model.dateTime(),
  generated_at: model.dateTime(),
  currency_code: model.text(),
  gross_amount_minor: model.number(),
  refund_amount_minor: model.number().default(0),
  commission_amount_minor: model.number(),
  adjustment_amount_minor: model.number().default(0),
  payable_amount_minor: model.number(),
  status: model.enum(["calculated", "reviewed", "held"]),
  lines: model.json(),
  policy_snapshot: model.json(),
  test_data: model.boolean().default(true),
  payment_mode: model.text().default("simulated"),
  payout_execution_authorized: model.boolean().default(false),
});

export default SettlementStatement;
