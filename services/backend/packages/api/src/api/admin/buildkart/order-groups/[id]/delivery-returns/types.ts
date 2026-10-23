import type {
  AdminShipment,
  AdminShipmentEvent,
} from "../../../shipments/types";
import type { AdminReturnCase } from "../../../returns/types";

export interface AdminOrderGroupShipment extends AdminShipment {
  events: AdminShipmentEvent[];
}

export interface AdminOrderGroupDeliveryReturnsResponse {
  order_group_id: string;
  order_id: string;
  owner_user_id: string | null;
  shipments: AdminOrderGroupShipment[];
  returns: AdminReturnCase[];
  latest_update: string;
  effects: {
    refund: "none";
    payment: "none";
    inventory: "none";
    accounting: "none";
  };
  capabilities?: {
    can_update_delivery: boolean;
    can_update_return: boolean;
    can_decide_return: boolean;
    can_view_payment: boolean;
    can_manage_refund: boolean;
    can_view_technical: boolean;
  };
  environment: string;
  test_data: true;
  logistics_mode: "simulated";
  correlation_id: string;
}
