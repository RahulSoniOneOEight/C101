import assert from "node:assert/strict";
import {
  COMMISSION_POLICY_PRESETS,
  SETTLEMENT_STATEMENT_SEEDS,
  settlementTotals,
} from "../staging-finance/presets";
import { isStagingFinanceEnabled } from "../staging-finance/runtime";

assert.equal(isStagingFinanceEnabled({ NODE_ENV: "development" }), false);
assert.equal(isStagingFinanceEnabled({ NODE_ENV: "production" }), false);
assert.equal(
  isStagingFinanceEnabled({
    NODE_ENV: "development",
    BUILDKART_ENVIRONMENT: "staging",
  }),
  true,
);
assert.equal(
  isStagingFinanceEnabled({
    NODE_ENV: "production",
    BUILDKART_ENVIRONMENT: "staging",
  }),
  true,
);
assert.equal(
  isStagingFinanceEnabled({
    NODE_ENV: "development",
    BUILDKART_ENVIRONMENT: "production",
  }),
  false,
);

const globalPreset = COMMISSION_POLICY_PRESETS.filter(
  (preset) => preset.isDefault,
);
assert.equal(globalPreset.length, 1);
assert.equal(globalPreset[0].percentage, 10);

const categoryRates = new Map(
  COMMISSION_POLICY_PRESETS.filter((preset) => preset.categoryName).map(
    (preset) => [preset.categoryName, preset.percentage],
  ),
);
assert.equal(categoryRates.get("Building Materials"), 8);
assert.equal(categoryRates.get("Power Tools"), 12);

for (const preset of COMMISSION_POLICY_PRESETS) {
  assert.equal(preset.includeTax, false);
  assert.equal(preset.includeShipping, false);
}

assert.equal(SETTLEMENT_STATEMENT_SEEDS.length, 4);
for (const statement of SETTLEMENT_STATEMENT_SEEDS) {
  const totals = settlementTotals(statement.lines);
  for (const line of statement.lines) {
    const eligibleAmount = line.grossAmountMinor - line.refundAmountMinor;
    assert.equal(
      line.commissionAmountMinor,
      (eligibleAmount * line.commissionRatePercent) / 100,
      `${statement.statementNumber}/${line.orderReference} commission mismatch`,
    );
    assert.equal(
      line.payableAmountMinor,
      eligibleAmount - line.commissionAmountMinor + line.adjustmentAmountMinor,
      `${statement.statementNumber}/${line.orderReference} payable mismatch`,
    );
  }
  assert.equal(
    totals.payableAmountMinor,
    totals.grossAmountMinor -
      totals.refundAmountMinor -
      totals.commissionAmountMinor +
      totals.adjustmentAmountMinor,
    `${statement.statementNumber} total mismatch`,
  );
}

console.log(
  "staging-finance-test: PASS (3 policies, 4 reconciled simulated statements, no payout execution)",
);
