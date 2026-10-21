import { ArchiveBox } from "@medusajs/icons";
import {
  Button,
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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../../lib/client";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Shipments",
  icon: ArchiveBox,
  rank: 60,
};

type ShipmentList = InferClientOutput<
  typeof client.vendor.buildkart.shipments.query
>;
type Shipment = ShipmentList["items"][number];

const statusColor = (status: string) => {
  if (status === "delivered" || status === "rto_delivered") return "green" as const;
  if (["delivery_failed", "damaged", "lost"].includes(status)) return "red" as const;
  if (["in_transit", "out_for_delivery", "picked_up"].includes(status)) return "blue" as const;
  return "orange" as const;
};

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function VendorShipmentsPage() {
  const shipments = useQuery({
    queryKey: ["buildkart", "seller-shipments"],
    queryFn: () => client.vendor.buildkart.shipments.query(),
    refetchInterval: 15_000,
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const allShipments = shipments.data?.items ?? [];
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const shipment of allShipments) {
      result.set(shipment.status, (result.get(shipment.status) ?? 0) + 1);
    }
    return result;
  }, [allShipments]);
  const visible = statusFilter === "all"
    ? allShipments
    : allShipments.filter((shipment) => shipment.status === statusFilter);

  return (
    <SingleColumnPage>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">Shipments</Heading>
              <StatusBadge color="orange">Simulated staging data</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Only your seller shipments are shown. Update pickup, transit,
              failed-attempt or delivered status here.
            </Text>
          </div>
          <StatusBadge color="grey">{allShipments.length} shipments</StatusBadge>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <Button
            size="small"
            variant={statusFilter === "all" ? "primary" : "secondary"}
            onClick={() => setStatusFilter("all")}
          >
            All ({allShipments.length})
          </Button>
          {[...counts.keys()].sort().map((status) => (
            <Button
              key={status}
              size="small"
              variant={statusFilter === status ? "primary" : "secondary"}
              onClick={() => setStatusFilter(status)}
            >
              {label(status)} ({counts.get(status)})
            </Button>
          ))}
        </div>
        {shipments.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading shipments…
          </Text>
        ) : shipments.isError || !shipments.data ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load your shipments.
          </Text>
        ) : visible.length === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            No shipment in this status.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Shipment</Table.HeaderCell>
                  <Table.HeaderCell>Order group</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Tracking</Table.HeaderCell>
                  <Table.HeaderCell>Updated</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {visible.map((shipment: Shipment) => (
                  <Table.Row key={shipment.id}>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {shipment.id}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{shipment.orderGroupId}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={statusColor(shipment.status)}>
                        {label(shipment.status)}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{shipment.trackingNumber}</Table.Cell>
                    <Table.Cell>
                      {new Date(shipment.updatedAt).toLocaleString("en-IN")}
                    </Table.Cell>
                    <Table.Cell>
                      <Button asChild size="small" variant="secondary">
                        <Link to={`/shipments/${shipment.id}`}>Update</Link>
                      </Button>
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
