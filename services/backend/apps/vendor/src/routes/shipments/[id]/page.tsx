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
import { useState } from "react";
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

export default function VendorShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("in_transit");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [attemptReason, setAttemptReason] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [revisedAt, setRevisedAt] = useState("");
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
  const selectedStatus = shipment?.allowedTransitions.includes(status)
    ? status
    : shipment?.allowedTransitions[0] ?? "";

  const update = useMutation({
    mutationFn: () =>
      client.vendor.buildkart.shipments.$id.status.mutate({
        $id: id!,
        status: selectedStatus,
        expected_version: shipment!.version,
        operation_key: crypto.randomUUID(),
        reason: reason.trim() || undefined,
        note: note.trim() || undefined,
        attempt_number: [
          "delivery_attempted",
          "delivery_failed",
          "buyer_action_required",
        ].includes(selectedStatus)
          ? attemptNumber
          : undefined,
        attempt_reason: ["delivery_attempted", "delivery_failed"].includes(
          selectedStatus,
        )
          ? attemptReason.trim()
          : undefined,
        next_action:
          selectedStatus === "buyer_action_required" ? nextAction.trim() : undefined,
        revised_delivery_at:
          selectedStatus === "delayed" && revisedAt
            ? new Date(revisedAt).toISOString()
            : undefined,
        proof_ref:
          ["partially_delivered", "delivered"].includes(selectedStatus)
            ? proof.trim()
            : undefined,
        delivered_lines:
          ["partially_delivered", "delivered"].includes(selectedStatus)
            ? lines.map((line) => ({
                line_key: line.lineKey,
                delivered_qty:
                  selectedStatus === "delivered"
                    ? line.orderedQty
                    : delivered[line.lineKey] ?? line.deliveredQty,
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
      setReason("");
      setNote("");
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
              You can only update your own allocation. Updates are versioned;
              exceptions require a reason and delivery requires evidence.
            </Text>
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            <label className="text-sm font-medium" htmlFor="seller-status">
              New status
            </label>
            <select
              id="seller-status"
              className="h-8 max-w-xs rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              value={selectedStatus}
              onChange={(event) => setStatus(event.target.value)}
            >
              {(shipment?.allowedTransitions ?? []).map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            <label className="text-sm font-medium" htmlFor="seller-reason">
              Reason
            </label>
            <input
              id="seller-reason"
              className="h-8 max-w-md rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              placeholder="Required for exceptions, RTO or cancellation"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            {[
              "delivery_attempted",
              "delivery_failed",
              "buyer_action_required",
            ].includes(selectedStatus) ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Attempt number
                  <input
                    type="number"
                    min={1}
                    className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                    value={attemptNumber}
                    onChange={(event) => setAttemptNumber(Number(event.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Attempt reason
                  <input
                    className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                    value={attemptReason}
                    onChange={(event) => setAttemptReason(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            {selectedStatus === "buyer_action_required" ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Buyer next action
                <input
                  className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                />
              </label>
            ) : null}
            {selectedStatus === "delayed" ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Revised delivery date and time
                <input
                  type="datetime-local"
                  className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                  value={revisedAt}
                  onChange={(event) => setRevisedAt(event.target.value)}
                />
              </label>
            ) : null}
            {["partially_delivered", "delivered"].includes(selectedStatus) ? (
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
                            min={line.deliveredQty}
                            max={line.orderedQty}
                            className="w-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1 text-right text-sm"
                            disabled={selectedStatus === "delivered"}
                            value={
                              selectedStatus === "delivered"
                                ? line.orderedQty
                                : delivered[line.lineKey] ?? line.deliveredQty
                            }
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
            <label className="text-sm font-medium" htmlFor="seller-note">
              Internal note
            </label>
            <textarea
              id="seller-note"
              className="min-h-20 max-w-xl rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2 text-sm"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                size="small"
                variant="primary"
                isLoading={update.isPending}
                disabled={!shipment || !selectedStatus}
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
