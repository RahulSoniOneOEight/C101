export interface AdminReturnLine {
  id: string;
  lineKey: string;
  sku: string;
  orderedQty: number;
  deliveredQty: number;
  requestedQty: number;
  approvedQty: number | null;
  reasonCode: string;
  unitPriceMinor: number;
  receivedQty: number | null;
  condition: string | null;
  disposition: string | null;
  inspectionNote: string | null;
  inspectedAt: string | null;
  inspectedBy: string | null;
}

export interface AdminReturnRefundSimulationBreakdown {
  itemSubtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  restockingFeeMinor: number;
  returnFreightMinor: number;
}

export interface AdminReturnRefundSimulation {
  id: string;
  returnCaseId: string;
  operationKey: string;
  amountMinor: number;
  currencyCode: string;
  method: "original_method_simulation" | "cod_bank_transfer_simulation";
  status: "simulated_pending" | "simulated_completed" | "simulated_failed";
  simulationReference: string;
  breakdown: AdminReturnRefundSimulationBreakdown;
  failureReason: string | null;
  createdAt: string;
  recordedAt: string;
  testData: true;
  simulated: true;
  moneyEffect: "none";
  stockEffect: "none";
}

export interface AdminReturnEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  actorRole: string | null;
  detail: Record<string, unknown>;
  occurredAt: string;
}

export interface AdminReturnCase {
  id: string;
  orderId: string;
  orderGroupId: string | null;
  userId: string;
  policyVersion: string;
  policySnapshot: Record<string, unknown>;
  status: string;
  version: number;
  allowedTransitions: string[];
  resolution: string;
  reasonCode: string;
  customerComment: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionComment: string | null;
  lines: AdminReturnLine[];
  events: AdminReturnEvent[];
  refundSimulation: AdminReturnRefundSimulation | null;
}

export interface AdminReturnListResponse {
  items: AdminReturnCase[];
  environment: string;
  test_data: true;
}

export interface AdminReturnActionResponse {
  return: AdminReturnCase;
  refund_simulation?: AdminReturnRefundSimulation;
  duplicate?: boolean;
  environment: string;
  test_data: true;
}
