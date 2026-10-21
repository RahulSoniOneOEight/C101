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
  rank: 70,
};

type ShipmentList = InferClientOutput<
  typeof client.admin.buildkart.shipments.query
>;
type Shipment = ShipmentList["items"][number];

const statusColor = (status: string) => {
  if (status === "delivered" || status === "rto_delivered") return "green" as const;
  if (["delivery_failed", "damaged", "lost"].includes(status)) return "red" as const;
  if (["out_for_delivery", "in_transit", "picked_up"].includes(status)) return "blue" as const;
  return "orange" as const;
};

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function ShipmentsPage() {
  const shipments = useQuery({
    queryKey: ["buildkart", "staging-shipments"],
    queryFn: () => client.admin.buildkart.shipments.query(),
  });
  const exceptions = useQuery({
    queryKey: ["buildkart", "staging-shipment-exceptions"],
    queryFn: () => client.admin.buildkart.shipmentExceptions.query(),
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const allShipments = shipments.data?.items ?? [];
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shipment of allShipments) {
      counts.set(shipment.status, (counts.get(shipment.status) ?? 0) + 1);
    }
    return counts;
  }, [allShipments]);
  const visibleShipments = statusFilter === "all"
    ? allShipments
    : allShipments.filter((shipment) => shipment.status === statusFilter);

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Shipments</Heading>
                <StatusBadge color="orange">Simulated staging data</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Shipments are booked from Mercur allocations. No real carrier is
                called and no money or stock is moved here.
              </Text>
            </div>
            <StatusBadge color="grey">
              {shipments.data?.items.length ?? 0} shipments
            </StatusBadge>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-6 py-3">
            <Button
              size="small"
              variant={statusFilter === "all" ? "primary" : "secondary"}
              onClick={() => setStatusFilter("all")}
            >
              All ({allShipments.length})
            </Button>
            {[...statusCounts.keys()].sort().map((status) => (
              <Button
                key={status}
                size="small"
                variant={statusFilter === status ? "primary" : "secondary"}
                onClick={() => setStatusFilter(status)}
              >
                {label(status)} ({statusCounts.get(status)})
              </Button>
            ))}
          </div>
          {shipments.isPending ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              Loading shipments…
            </Text>
          ) : shipments.isError || !shipments.data ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-error">
              Could not load staging shipments. Check the Experience API proxy.
            </Text>
          ) : visibleShipments.length === 0 ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              No shipment in this status. Booking starts when a marketplace
              allocation is consumed.
            </Text>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Shipment</Table.HeaderCell>
                    <Table.HeaderCell>Order group</Table.HeaderCell>
                    <Table.HeaderCell>Seller</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Tracking</Table.HeaderCell>
                    <Table.HeaderCell>Updated</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visibleShipments.map((shipment: Shipment) => (
                    <Table.Row key={shipment.id}>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {shipment.id}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{shipment.orderGroupId}</Table.Cell>
                      <Table.Cell>{shipment.sellerId}</Table.Cell>
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
                          <Link to={`/shipments/${shipment.id}`}>Open</Link>
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </Container>

        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <Heading level="h2">Exceptions</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Failed, damaged, lost, RTO and stale shipments. Reconcile from
                the shipment detail.
              </Text>
            </div>
            <StatusBadge color="red">
              {exceptions.data?.items.length ?? 0} open
            </StatusBadge>
          </div>
          {exceptions.isPending ? (
            <Text size="small" className="px-6 py-6 text-ui-fg-subtle">
              Loading exceptions…
            </Text>
          ) : exceptions.isError ? (
            <Text size="small" className="px-6 py-6 text-ui-fg-error">
              Could not load the exception queue.
            </Text>
          ) : exceptions.data?.items.length === 0 ? (
            <Text size="small" className="px-6 py-6 text-ui-fg-subtle">
              No shipment exceptions.
            </Text>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Shipment</Table.HeaderCell>
                    <Table.HeaderCell>Order group</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Updated</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {exceptions.data?.items.map((shipment: Shipment) => (
                    <Table.Row key={shipment.id}>
                      <Table.Cell>{shipment.id}</Table.Cell>
                      <Table.Cell>{shipment.orderGroupId}</Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={statusColor(shipment.status)}>
                          {label(shipment.status)}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell>
                        {new Date(shipment.updatedAt).toLocaleString("en-IN")}
                      </Table.Cell>
                      <Table.Cell>
                        <Button asChild size="small" variant="secondary">
                          <Link to={`/shipments/${shipment.id}`}>Inspect</Link>
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </Container>
      </div>
    </SingleColumnPage>
  );
}
