export interface AdminShipmentLine {
  lineKey: string;
  sku: string;
  orderedQty: number;
  deliveredQty: number;
}

export interface AdminShipment {
  id: string;
  orderGroupId: string;
  allocationId: string;
  sellerId: string;
  /** Resolved from the seller module at read time; falls back to sellerId in the UI. */
  seller_name?: string;
  provider: string;
  trackingNumber: string;
  status: string;
  version: number;
  allowedTransitions: string[];
  deliveredAt: string | null;
  proofRef: string | null;
  destinationPostcode: string | null;
  createdAt: string;
  updatedAt: string;
  lines: AdminShipmentLine[];
}

export interface AdminShipmentEvent {
  id: string;
  shipmentId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  status: string;
  occurredAt: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface AdminShipmentListResponse {
  items: AdminShipment[];
  environment: string;
  test_data: true;
  logistics_mode: "simulated";
}

export interface AdminShipmentDetailResponse {
  shipment: AdminShipment;
  events: AdminShipmentEvent[];
  environment: string;
  test_data: true;
}

export interface AdminShipmentActionResponse {
  shipment: AdminShipment | null;
  event?: AdminShipmentEvent;
  duplicate?: boolean;
  status_changed?: boolean;
  reconciliation?: Record<string, unknown>;
  environment: string;
  test_data: true;
}

export interface AdminShipmentExceptionResponse {
  items: AdminShipment[];
  environment: string;
  test_data: true;
  logistics_mode: "simulated";
}
