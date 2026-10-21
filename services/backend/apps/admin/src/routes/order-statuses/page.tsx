import { ArchiveBox } from "@medusajs/icons";
import {
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../../lib/client";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Order delivery & returns",
  icon: ArchiveBox,
  rank: 69,
};

type OrderStatusList = InferClientOutput<
  typeof client.admin.buildkart.orderStatuses.query
>;
type OrderStatus = OrderStatusList["items"][number];

const shipmentColor = (status: string) => {
  if (status === "delivered" || status === "rto_delivered") return "green" as const;
  if (["delivery_failed", "damaged", "lost"].includes(status)) return "red" as const;
  if (["in_transit", "out_for_delivery", "picked_up"].includes(status)) return "blue" as const;
  return "orange" as const;
};

const returnColor = (status: string) => {
  if (status === "approved" || status === "closed") return "green" as const;
  if (status === "rejected" || status === "cancelled") return "red" as const;
  return "orange" as const;
};

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function OrderStatusesPage() {
  const statuses = useQuery({
    queryKey: ["buildkart", "staging-order-statuses"],
    queryFn: () => client.admin.buildkart.orderStatuses.query(),
  });

  return (
    <SingleColumnPage>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">Order delivery & returns</Heading>
              <StatusBadge color="orange">Simulated staging data</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              One row per order with its shipment and return statuses. Open the
              shipment or return workbench for evidence and decisions.
            </Text>
          </div>
          <StatusBadge color="grey">
            {statuses.data?.items.length ?? 0} orders
          </StatusBadge>
        </div>
        {statuses.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading order statuses…
          </Text>
        ) : statuses.isError || !statuses.data ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load order delivery and return statuses.
          </Text>
        ) : statuses.data.items.length === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            No correlated order yet.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Owner</Table.HeaderCell>
                  <Table.HeaderCell>Delivery</Table.HeaderCell>
                  <Table.HeaderCell>Returns</Table.HeaderCell>
                  <Table.HeaderCell>Last update</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {statuses.data.items.map((row: OrderStatus) => (
                  <Table.Row key={row.order_id}>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {row.order_id}
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {row.medusa_order_group_id ?? "No order group"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{row.owner_user_id ?? "—"}</Table.Cell>
                    <Table.Cell>
                      {row.shipment_statuses.length === 0 ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          Not booked
                        </Text>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.shipment_statuses.map((status) => (
                            <StatusBadge key={status} color={shipmentColor(status)}>
                              {label(status)}
                            </StatusBadge>
                          ))}
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {row.shipment_count} shipment(s)
                          </Text>
                        </div>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {row.return_statuses.length === 0 ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          No return
                        </Text>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.return_statuses.map((status) => (
                            <StatusBadge key={status} color={returnColor(status)}>
                              {label(status)}
                            </StatusBadge>
                          ))}
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {row.return_count} case(s)
                          </Text>
                        </div>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {new Date(
                        row.latest_return_update ??
                          row.latest_shipment_update ??
                          row.created_at,
                      ).toLocaleString("en-IN")}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Link
                          className="text-ui-fg-interactive text-sm underline"
                          to="/shipments"
                        >
                          Shipments
                        </Link>
                        <Link
                          className="text-ui-fg-interactive text-sm underline"
                          to="/returns"
                        >
                          Returns
                        </Link>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  );
}
