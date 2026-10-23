import type { AdminOrderGroupDeliveryReturnsResponse } from "../../../../../admin/buildkart/order-groups/[id]/delivery-returns/types";

export interface VendorOrderDeliveryReturnsResponse
  extends AdminOrderGroupDeliveryReturnsResponse {
  seller_id: string;
}
