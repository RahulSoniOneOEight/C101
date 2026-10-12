import type { StatementLineSeed } from "../../../../staging-finance/presets";
import type { AdminSettlementStatement } from "./types";

interface SettlementStatementRecord {
  id: string;
  statement_number: string;
  seller_id: string;
  seller_name: string;
  period_start: Date;
  period_end: Date;
  generated_at: Date;
  currency_code: string;
  gross_amount_minor: number;
  refund_amount_minor: number;
  commission_amount_minor: number;
  adjustment_amount_minor: number;
  payable_amount_minor: number;
  status: "calculated" | "reviewed" | "held";
  lines: Record<string, unknown>;
  policy_snapshot: Record<string, unknown>;
  test_data: boolean;
  payment_mode: string;
  payout_execution_authorized: boolean;
}

export function serializeSettlementStatement(
  statement: SettlementStatementRecord,
): AdminSettlementStatement {
  const lines = Array.isArray(statement.lines)
    ? (statement.lines as StatementLineSeed[])
    : ((statement.lines.items as StatementLineSeed[] | undefined) ?? []);

  return {
    id: statement.id,
    statement_number: statement.statement_number,
    seller_id: statement.seller_id,
    seller_name: statement.seller_name,
    period_start: statement.period_start.toISOString(),
    period_end: statement.period_end.toISOString(),
    generated_at: statement.generated_at.toISOString(),
    currency_code: statement.currency_code,
    gross_amount_minor: statement.gross_amount_minor,
    refund_amount_minor: statement.refund_amount_minor,
    commission_amount_minor: statement.commission_amount_minor,
    adjustment_amount_minor: statement.adjustment_amount_minor,
    payable_amount_minor: statement.payable_amount_minor,
    status: statement.status,
    lines,
    policy_snapshot: statement.policy_snapshot,
    test_data: true,
    payment_mode: "simulated",
    payout_execution_authorized: false,
  };
}
