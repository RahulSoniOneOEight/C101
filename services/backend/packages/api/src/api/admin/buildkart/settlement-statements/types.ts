import type {
  StatementLineSeed,
  StagingStatementStatus,
} from "../../../../staging-finance/presets";

export interface AdminSettlementStatement {
  id: string;
  statement_number: string;
  seller_id: string;
  seller_name: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  currency_code: string;
  gross_amount_minor: number;
  refund_amount_minor: number;
  commission_amount_minor: number;
  adjustment_amount_minor: number;
  payable_amount_minor: number;
  status: StagingStatementStatus;
  lines: StatementLineSeed[];
  policy_snapshot: Record<string, unknown>;
  test_data: true;
  payment_mode: "simulated";
  payout_execution_authorized: false;
}

export interface AdminSettlementStatementListResponse {
  statements: AdminSettlementStatement[];
  count: number;
  test_data: true;
  payment_mode: "simulated";
  payout_execution_authorized: false;
}

export interface AdminSettlementStatementResponse {
  statement: AdminSettlementStatement;
  test_data: true;
  payment_mode: "simulated";
  payout_execution_authorized: false;
}
