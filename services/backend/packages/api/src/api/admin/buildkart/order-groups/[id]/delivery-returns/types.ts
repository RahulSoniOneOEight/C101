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
  environment: string;
  test_data: true;
  logistics_mode: "simulated";
  correlation_id: string;
}
