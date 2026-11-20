export interface AdminCodStatementLine {
  order_group_id: string;
  invoice_ref: string | null;
  goods_minor: number;
  commission_bps: number;
  commission_source: "override" | "policy" | "default";
  commission_minor: number;
  gst_on_commission_minor: number;
  tcs_minor: number;
  cod_fee_minor: number;
  adjustments_minor: number;
  amount_due_minor: number;
}

export interface AdminCodSettlementStatement {
  id: string;
  statement_number: string;
  seller_id: string;
  seller_name: string;
  period: string;
  currency: string;
  status: "open";
  order_count: number;
  goods_minor: number;
  commission_minor: number;
  gst_on_commission_minor: number;
  tcs_minor: number;
  cod_fee_minor: number;
  adjustments_minor: number;
  amount_due_minor: number;
  carry_forward_minor: number;
  total_outstanding_minor: number;
  tcs_default_rate_applied: boolean;
  lines: AdminCodStatementLine[];
}

export interface AdminSettlementStatementListResponse {
  period: string;
  statements: AdminCodSettlementStatement[];
  currency: string;
  test_data: boolean;
  correlation_id?: string;
}

export interface AdminSettlementStatementResponse {
  statement: AdminCodSettlementStatement;
  test_data: boolean;
  correlation_id?: string;
}
