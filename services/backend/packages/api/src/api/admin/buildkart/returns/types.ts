export interface AdminReturnLine {
  id: string;
  lineKey: string;
  sku: string;
  orderedQty: number;
  deliveredQty: number;
  requestedQty: number;
  approvedQty: number | null;
  reasonCode: string;
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
  resolution: string;
  reasonCode: string;
  customerComment: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionComment: string | null;
  lines: AdminReturnLine[];
  events: AdminReturnEvent[];
}

export interface AdminReturnListResponse {
  items: AdminReturnCase[];
  environment: string;
  test_data: true;
}

export interface AdminReturnActionResponse {
  return: AdminReturnCase;
  environment: string;
  test_data: true;
}
