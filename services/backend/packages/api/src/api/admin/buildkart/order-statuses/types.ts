export interface AdminOrderStatus {
  order_id: string;
  medusa_order_group_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  shipment_statuses: string[];
  shipment_count: number;
  latest_shipment_update: string | null;
  return_statuses: string[];
  return_count: number;
  latest_return_update: string | null;
}

export interface AdminOrderStatusListResponse {
  items: AdminOrderStatus[];
  environment: string;
  test_data: true;
  logistics_mode: "simulated";
}
