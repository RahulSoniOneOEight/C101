import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import type { InferClientOutput } from "@mercurjs/client";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { client } from "../../../lib/client";

type ShipmentDetail = InferClientOutput<
  typeof client.vendor.buildkart.shipments.$id.query
>;
type ShipmentEvent = ShipmentDetail["events"][number];

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

const sellerStatuses = [
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivery_failed",
  "delivered",
] as const;

export default function VendorShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("in_transit");
  const [proof, setProof] = useState("");
  const [delivered, setDelivered] = useState<Record<string, number>>({});
  const query = useQuery({
    queryKey: ["buildkart", "seller-shipment", id],
    queryFn: () => client.vendor.buildkart.shipments.$id.query({ $id: id! }),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
  const shipment = query.data?.shipment;
  const lines = shipment?.lines ?? [];

  useEffect(() => {
    if (lines.length === 0) return;
    setDelivered((current) => {
      if (Object.keys(current).length > 0) return current;
      return Object.fromEntries(lines.map((line) => [line.lineKey, line.orderedQty]));
    });
  }, [lines]);

  const update = useMutation({
    mutationFn: () =>
      client.vendor.buildkart.shipments.$id.status.mutate({
        $id: id!,
        status,
        proof_ref:
          status === "delivered"
            ? proof.trim() || `staging://seller-proof/${id}`
            : undefined,
        delivered_lines:
          status === "delivered"
            ? lines.map((line) => ({
                line_key: line.lineKey,
                delivered_qty: delivered[line.lineKey] ?? line.orderedQty,
              }))
            : undefined,
      } as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-shipment", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-shipments"],
      });
    },
  });

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">{shipment?.id ?? "Shipment"}</Heading>
                <StatusBadge color="orange">Simulated staging data</StatusBadge>
                {shipment ? (
                  <StatusBadge color={statusColor(shipment.status)}>
                    {label(shipment.status)}
                  </StatusBadge>
                ) : null}
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Order group {shipment?.orderGroupId ?? "—"} · Tracking{" "}
                {shipment?.trackingNumber ?? "—"}
              </Text>
            </div>
            <Button asChild variant="secondary" size="small">
              <Link to="/shipments">Back to shipments</Link>
            </Button>
          </div>
          {query.isPending ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              Loading shipment…
            </Text>
          ) : query.isError || !shipment ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-error">
              Could not load this shipment.
            </Text>
          ) : (
            <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-3">
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Delivered at
                </Text>
                <Text size="small" weight="plus">
                  {shipment.deliveredAt
                    ? new Date(shipment.deliveredAt).toLocaleString("en-IN")
                    : "Not delivered"}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Proof reference
                </Text>
                <Text size="small" weight="plus">
                  {shipment.proofRef ?? "—"}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Seller scope
                </Text>
                <Text size="small" weight="plus">
                  {shipment.sellerId}
                </Text>
              </div>
            </div>
          )}
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Update delivery status</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              You can only update your own shipments. Delivered status requires
              a proof reference and per-line delivered quantity.
            </Text>
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            <label className="text-sm font-medium" htmlFor="seller-status">
              New status
            </label>
            <select
              id="seller-status"
              className="h-8 max-w-xs rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {sellerStatuses.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            {status === "delivered" ? (
              <>
                <label className="text-sm font-medium" htmlFor="seller-proof">
                  Proof reference
                </label>
                <input
                  id="seller-proof"
                  className="h-8 max-w-md rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                  placeholder={`staging://seller-proof/${id}`}
                  value={proof}
                  onChange={(event) => setProof(event.target.value)}
                />
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>SKU</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        Ordered
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        Delivered
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {lines.map((line) => (
                      <Table.Row key={line.lineKey}>
                        <Table.Cell>{line.sku}</Table.Cell>
                        <Table.Cell className="text-right">
                          {line.orderedQty}
                        </Table.Cell>
                        <Table.Cell className="text-right">
                          <input
                            type="number"
                            min={1}
                            max={line.orderedQty}
                            className="w-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-right text-sm"
                            value={delivered[line.lineKey] ?? line.orderedQty}
                            onChange={(event) =>
                              setDelivered((current) => ({
                                ...current,
                                [line.lineKey]: Number(event.target.value),
                              }))
                            }
                          />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                size="small"
                variant="primary"
                isLoading={update.isPending}
                onClick={() => update.mutate()}
              >
                Update status
              </Button>
              {update.isError ? (
                <Text size="xsmall" className="text-ui-fg-error">
                  Update failed. Check the status and delivered quantities.
                </Text>
              ) : null}
              {update.isSuccess ? (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Status updated.
                </Text>
              ) : null}
            </div>
          </div>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Timeline</Heading>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Occurred</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Event</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(query.data?.events ?? []).map((event: ShipmentEvent) => (
                <Table.Row key={event.id}>
                  <Table.Cell>
                    {new Date(event.occurredAt).toLocaleString("en-IN")}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={statusColor(event.status)}>
                      {label(event.status)}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>{event.eventType}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
