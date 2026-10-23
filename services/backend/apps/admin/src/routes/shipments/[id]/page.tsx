import {
  Button,
  Container,
  Heading,
  Select,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import type { InferClientOutput } from "@mercurjs/client";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { client } from "../../../lib/client";

type ShipmentDetail = InferClientOutput<
  typeof client.admin.buildkart.shipments.$id.query
>;
type ShipmentEvent = ShipmentDetail["events"][number];

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

const scenarios = [
  "failed_attempt",
  "delay",
  "damaged",
  "lost",
  "rto",
  "duplicate",
  "out_of_order",
] as const;

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [scenario, setScenario] = useState<string>("failed_attempt");
  const query = useQuery({
    queryKey: ["buildkart", "staging-shipment", id],
    queryFn: () =>
      client.admin.buildkart.shipments.$id.query({ $id: id! }),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
  const simulate = useMutation({
    mutationFn: () =>
      client.admin.buildkart.shipments.$id.simulateEvent.mutate({
        $id: id!,
        scenario,
      } as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-shipment", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-shipments"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-shipment-exceptions"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      });
    },
  });
  const reconcile = useMutation({
    mutationFn: () =>
      client.admin.buildkart.shipments.$id.reconcile.mutate({
        $id: id!,
      } as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-shipment", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      });
    },
  });
  const [manualStatus, setManualStatus] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [attemptReason, setAttemptReason] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [revisedAt, setRevisedAt] = useState("");
  const [proofRef, setProofRef] = useState("");
  const [delivered, setDelivered] = useState<Record<string, number>>({});
  const [manualError, setManualError] = useState("");

  const shipment = query.data?.shipment;
  const events = query.data?.events ?? [];
  const selectedStatus = shipment?.allowedTransitions.includes(manualStatus)
    ? manualStatus
    : shipment?.allowedTransitions[0] ?? "";

  const updateStatus = useMutation({
    mutationFn: () => {
      if (!shipment) throw new Error("Shipment is not loaded.");
      const deliveryStatus = ["partially_delivered", "delivered"].includes(
        selectedStatus,
      );
      const attemptStatus = [
        "delivery_attempted",
        "delivery_failed",
        "buyer_action_required",
      ].includes(selectedStatus);
      return client.admin.buildkart.shipments.$id.status.mutate({
        $id: id!,
        status: selectedStatus,
        expected_version: shipment.version,
        operation_key: crypto.randomUUID(),
        reason: manualReason.trim(),
        note: manualNote.trim() || undefined,
        attempt_number: attemptStatus ? attemptNumber : undefined,
        attempt_reason: attemptStatus ? attemptReason.trim() || undefined : undefined,
        next_action:
          selectedStatus === "buyer_action_required" ? nextAction.trim() : undefined,
        revised_delivery_at:
          selectedStatus === "delayed" && revisedAt
            ? new Date(revisedAt).toISOString()
            : undefined,
        proof_ref: deliveryStatus ? proofRef.trim() : undefined,
        delivered_lines: deliveryStatus
          ? shipment.lines.map((line) => ({
              line_key: line.lineKey,
              delivered_qty:
                selectedStatus === "delivered"
                  ? line.orderedQty
                  : delivered[line.lineKey] ?? line.deliveredQty,
            }))
          : undefined,
      } as never);
    },
    onSuccess: async () => {
      setManualError("");
      setManualReason("");
      setManualNote("");
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-shipment", id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-shipments"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      });
    },
    onError: (error) => setManualError((error as Error).message),
  });

  const duplicateIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of query.data?.events ?? []) {
      counts.set(
        event.providerEventId,
        (counts.get(event.providerEventId) ?? 0) + 1,
      );
    }
    return counts;
  }, [query.data?.events]);

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
                Provider {shipment?.provider ?? "simulated"} · Tracking{" "}
                {shipment?.trackingNumber ?? "—"} · Order group{" "}
                {shipment?.orderGroupId ?? "—"}
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
              Could not load this staging shipment.
            </Text>
          ) : (
            <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-4">
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Seller
                </Text>
                <Text size="small" weight="plus">
                  {shipment.sellerId}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Allocation
                </Text>
                <Text size="small" weight="plus">
                  {shipment.allocationId}
                </Text>
              </div>
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
            </div>
          )}
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Delivery evidence</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Per-line delivered quantity. Phase 1 stores references only, never
              binaries.
            </Text>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Line</Table.HeaderCell>
                <Table.HeaderCell>SKU</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Ordered</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Delivered</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(shipment?.lines ?? []).map((line) => (
                <Table.Row key={line.lineKey}>
                  <Table.Cell>{line.lineKey}</Table.Cell>
                  <Table.Cell>{line.sku}</Table.Cell>
                  <Table.Cell className="text-right">{line.orderedQty}</Table.Cell>
                  <Table.Cell className="text-right">{line.deliveredQty}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Manual shipment update</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Versioned Admin action for the Seller allocation. A reason is
              mandatory; delivery stages also require evidence and quantities.
            </Text>
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            <label className="text-sm font-medium" htmlFor="admin-shipment-status">
              New status
            </label>
            <select
              id="admin-shipment-status"
              className="h-8 max-w-xs rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              value={selectedStatus}
              onChange={(event) => setManualStatus(event.target.value)}
            >
              {(shipment?.allowedTransitions ?? []).map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
            <label className="text-sm font-medium" htmlFor="admin-shipment-reason">
              Reason
            </label>
            <input
              id="admin-shipment-reason"
              className="h-8 max-w-md rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
              placeholder="Required Admin acting reason"
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
              <div className="flex flex-col gap-3 rounded-md border border-ui-border-base p-3">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Evidence reference
                  <input
                    className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                    value={proofRef}
                    onChange={(event) => setProofRef(event.target.value)}
                  />
                </label>
                {(shipment?.lines ?? []).map((line) => (
                  <label
                    key={line.lineKey}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{line.sku} · {line.deliveredQty}/{line.orderedQty}</span>
                    <input
                      type="number"
                      min={line.deliveredQty}
                      max={line.orderedQty}
                      disabled={selectedStatus === "delivered"}
                      className="h-8 w-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-right text-sm"
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
                  </label>
                ))}
              </div>
            ) : null}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Internal note
              <textarea
                className="min-h-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2 text-sm"
                value={manualNote}
                onChange={(event) => setManualNote(event.target.value)}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="small"
                variant="primary"
                isLoading={updateStatus.isPending}
                disabled={!selectedStatus || !shipment}
                onClick={() => updateStatus.mutate()}
              >
                Update shipment
              </Button>
              {manualError ? (
                <Text size="xsmall" className="text-ui-fg-error" role="alert">
                  {manualError}
                </Text>
              ) : null}
            </div>
          </div>
        </Container>

        <Container className="p-0">
          <div className="flex flex-col gap-3 border-b border-ui-border-base px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Heading level="h2">Timeline</Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                Every provider event is persisted. Duplicate and out-of-order
                events never move status backwards.
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={scenario} onValueChange={setScenario}>
                <Select.Trigger className="w-44">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {scenarios.map((value) => (
                    <Select.Item key={value} value={value}>
                      {label(value)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              <Button
                size="small"
                variant="secondary"
                isLoading={simulate.isPending}
                onClick={() => simulate.mutate()}
              >
                Simulate event
              </Button>
              <Button
                size="small"
                variant="secondary"
                isLoading={reconcile.isPending}
                onClick={() => reconcile.mutate()}
              >
                Reconcile
              </Button>
            </div>
          </div>
          {simulate.isError || reconcile.isError ? (
            <Text size="small" className="px-6 py-4 text-ui-fg-error">
              The staging action failed. Check the Experience API proxy.
            </Text>
          ) : null}
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Occurred</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Provider event</Table.HeaderCell>
                <Table.HeaderCell>Flags</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {events.map((event: ShipmentEvent) => {
                const outOfOrder =
                  (event.payload as { scenario?: string }).scenario ===
                  "out_of_order";
                const duplicate = (duplicateIds.get(event.providerEventId) ?? 0) > 1;
                return (
                  <Table.Row key={event.id}>
                    <Table.Cell>
                      {new Date(event.occurredAt).toLocaleString("en-IN")}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={statusColor(event.status)}>
                        {label(event.status)}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{event.providerEventId}</Table.Cell>
                    <Table.Cell>
                      {duplicate ? "Duplicate · " : ""}
                      {outOfOrder ? "Out of order" : "—"}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
