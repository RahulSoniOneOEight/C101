/* eslint-disable react-refresh/only-export-components */
import { Button, Container, Heading, StatusBadge, Text, toast } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import type { InferClientOutput } from "@mercurjs/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../lib/client";
import { usePreviewMode } from "../components/order-preview";

type OrderContext = {
  id: string;
  display_id?: number | string | null;
  payment_status?: string | null;
  currency_code?: string | null;
  total?: number | null;
  summary?: {
    total?: number | null;
    refunded_total?: number | null;
  } | null;
};

export type Lifecycle = InferClientOutput<
  typeof client.admin.buildkart.orderGroups.$id.deliveryReturns.query
>;
type Shipment = Lifecycle["shipments"][number];
type ReturnCase = Lifecycle["returns"][number];

type ShipmentUpdate = {
  status: string;
  expected_version: number;
  operation_key: string;
  reason: string;
  note?: string;
  attempt_number?: number;
  attempt_reason?: string;
  next_action?: string;
  revised_delivery_at?: string;
  proof_ref?: string;
  delivered_lines?: Array<{ line_key: string; delivered_qty: number }>;
};

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Dispatched",
  in_transit: "In transit",
  delayed: "Delayed",
  out_for_delivery: "Out for delivery",
  delivery_attempted: "Delivery attempted",
  delivery_failed: "Delivery failed",
  buyer_action_required: "Buyer action required",
  partially_delivered: "Partially delivered",
  delivered: "Delivered",
  damaged: "Damaged",
  lost: "Lost",
  returning_to_seller: "Returning to seller",
  returned_to_seller: "Returned to seller",
  rto_in_transit: "RTO in transit",
  rto_delivered: "RTO delivered",
  cancelled: "Cancelled",
};

const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  pickup_scheduled: "Pickup scheduled",
  pickup_attempted: "Pickup attempted",
  in_return_transit: "In return transit",
  received: "Received",
  inspection_pending: "Inspection pending",
  inspection_complete: "Inspection complete",
  closed: "Closed",
};

const label = (value: string) =>
  value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const deliveryStatusLabel = (status: string) =>
  SHIPMENT_STATUS_LABELS[status] ?? label(status);

export const returnStatusLabel = (status: string) => RETURN_STATUS_LABELS[status] ?? label(status);

const shortDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export type BadgeColor = "green" | "orange" | "blue" | "red" | "grey";

export const statusColor = (status: string): BadgeColor => {
  if (status === "delivered" || status === "closed" || status === "returned_to_seller" || status === "rto_delivered") {
    return "green";
  }
  if (["cancelled", "rejected", "delivery_failed", "damaged", "lost"].includes(status)) {
    return "red";
  }
  if (
    ["picked_up", "in_transit", "out_for_delivery", "pickup_scheduled", "pickup_attempted", "in_return_transit"].includes(status)
  ) {
    return "blue";
  }
  return "orange";
};

export const paymentStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    authorized: "Authorized",
    captured: "Captured",
    partially_refunded: "Partially Refunded",
    refunded: "Refunded",
    pending: "Pending",
    canceled: "Canceled",
  };
  return labels[status] ?? label(status);
};

export const paymentStatusColor = (status?: string | null): BadgeColor => {
  if (status === "captured") return "green";
  if (status === "partially_refunded") return "orange";
  if (status === "refunded") return "grey";
  if (status === "authorized" || status === "pending") return "blue";
  if (status === "canceled") return "red";
  return "grey";
};

export const formatCurrency = (amount: number, currencyCode: string) => {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode.toUpperCase()} ${amount.toLocaleString("en-IN")}`;
  }
};

export const deliverySummary = (shipments: Shipment[]) => {
  const ordered = shipments.reduce((total, shipment) => total + orderedQuantity(shipment), 0);
  const delivered = shipments.reduce((total, shipment) => total + deliveredQuantity(shipment), 0);
  const active = shipments.find((shipment) => shipment.status !== "delivered") ?? shipments[0];

  return {
    label: active ? deliveryStatusLabel(active.status) : "Awaiting shipment",
    color: active ? statusColor(active.status) : ("grey" as BadgeColor),
    detail:
      shipments.length > 0
        ? `${delivered} of ${ordered} units${shipments.length > 1 ? ` · ${shipments.length} shipments` : ""}`
        : "No shipment booked",
  };
};

const returnDetailLabel = (status: string) => {
  if (["received", "inspection_pending"].includes(status)) return "inspection pending";
  if (status === "inspection_complete") return "inspection complete · refund pending";
  if (status === "closed") return "closed";
  if (status === "approved") return "awaiting receipt";
  if (["pickup_scheduled", "pickup_attempted", "in_return_transit"].includes(status)) {
    return "reverse pickup";
  }
  if (["requested", "under_review"].includes(status)) return "awaiting decision";
  return returnStatusLabel(status).toLowerCase();
};

export const returnSummary = (records: ReturnCase[]) => {
  const requested = records.reduce((total, record) => total + requestedQuantity(record), 0);
  const active = records.find((record) => record.status !== "closed") ?? records[0];

  return {
    label: active ? returnStatusLabel(active.status) : "No return",
    color: active ? statusColor(active.status) : ("grey" as BadgeColor),
    detail:
      records.length > 0 && active
        ? `${requested} unit(s) · ${returnDetailLabel(active.status)}${
            records.length > 1 ? ` · ${records.length} returns` : ""
          }`
        : "No return requested",
  };
};

export function StatusTile({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  color: BadgeColor;
}) {
  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
      <Text size="xsmall" className="text-ui-fg-subtle">
        {label}
      </Text>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <StatusBadge color={color}>{value}</StatusBadge>
      </div>
      {detail ? (
        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
          {detail}
        </Text>
      ) : null}
    </div>
  );
}

const deliveredQuantity = (shipment: Shipment) =>
  shipment.lines.reduce((total, line) => total + line.deliveredQty, 0);

const orderedQuantity = (shipment: Shipment) =>
  shipment.lines.reduce((total, line) => total + line.orderedQty, 0);

const requestedQuantity = (record: ReturnCase) =>
  record.lines.reduce((total, line) => total + line.requestedQty, 0);

const Meta = ({ name, value, mono = false }: { name: string; value: string; mono?: boolean }) => (
  <div className="min-w-0">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {name}
    </Text>
    <Text size="small" weight="plus" className={mono ? "break-all font-mono" : "break-words"}>
      {value}
    </Text>
  </div>
);

function ShipmentUpdateForm({
  shipment,
  onSubmit,
}: {
  shipment: Shipment;
  onSubmit: (input: ShipmentUpdate) => Promise<unknown>;
}) {
  const options = shipment.allowedTransitions;
  const [status, setStatus] = useState<string>(options[0] ?? "");
  const [reason, setReason] = useState("");
  const [proofRef, setProofRef] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [attemptReason, setAttemptReason] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [revisedAt, setRevisedAt] = useState("");
  const [delivered, setDelivered] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (options.length === 0) {
    return (
      <Text size="xsmall" className="text-ui-fg-subtle">
        No further delivery status is available.
      </Text>
    );
  }

  const isEvidence = ["partially_delivered", "delivered"].includes(status);
  const isAttempt = ["delivery_attempted", "delivery_failed"].includes(status);
  const isBuyerAction = status === "buyer_action_required";
  const isDelay = status === "delayed";
  const canSubmit =
    Boolean(reason.trim()) &&
    (!isEvidence || Boolean(proofRef.trim())) &&
    (!isAttempt || Boolean(attemptReason.trim())) &&
    (!isBuyerAction || Boolean(nextAction.trim())) &&
    (!isDelay || Boolean(revisedAt));

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        status,
        expected_version: shipment.version,
        operation_key: crypto.randomUUID(),
        reason: reason.trim(),
        attempt_number: isAttempt || isBuyerAction ? attemptNumber : undefined,
        attempt_reason: isAttempt ? attemptReason.trim() : undefined,
        next_action: isBuyerAction ? nextAction.trim() : undefined,
        revised_delivery_at: isDelay && revisedAt ? new Date(revisedAt).toISOString() : undefined,
        proof_ref: isEvidence ? proofRef.trim() : undefined,
        delivered_lines: isEvidence
          ? shipment.lines.map((line) => ({
              line_key: line.lineKey,
              delivered_qty:
                status === "delivered"
                  ? line.orderedQty
                  : Math.max(
                      line.deliveredQty,
                      Math.min(line.orderedQty, delivered[line.lineKey] ?? line.deliveredQty),
                    ),
            }))
          : undefined,
      });
    } catch (cause) {
      setError((cause as Error).message || "Delivery status update failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-ui-border-base pt-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Delivery status
        <select
          className="h-8 max-w-sm rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {deliveryStatusLabel(option)}
            </option>
          ))}
        </select>
      </label>

      {isEvidence ? (
        <div className="flex flex-col gap-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            {status === "delivered"
              ? "All ordered units will be recorded as delivered."
              : "Enter the cumulative delivered quantity for each line."}
          </Text>
          {status === "partially_delivered"
            ? shipment.lines.map((line) => (
                <label key={line.lineKey} className="flex flex-col gap-1 text-sm font-medium">
                  {line.sku} · {line.lineKey} (ordered {line.orderedQty}, delivered {line.deliveredQty})
                  <input
                    type="number"
                    min={line.deliveredQty}
                    max={line.orderedQty}
                    className="h-8 max-w-[12rem] rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                    value={delivered[line.lineKey] ?? line.deliveredQty}
                    onChange={(event) =>
                      setDelivered((current) => ({
                        ...current,
                        [line.lineKey]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))
            : null}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Proof reference
            <input
              className="h-8 max-w-xl rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              value={proofRef}
              onChange={(event) => setProofRef(event.target.value)}
              placeholder="e.g. POD-2026-1029-01"
            />
          </label>
        </div>
      ) : null}

      {isAttempt || isBuyerAction ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Attempt number
            <input
              type="number"
              min={1}
              className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              value={attemptNumber}
              onChange={(event) => setAttemptNumber(Math.max(1, Number(event.target.value)))}
            />
          </label>
          {isAttempt ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Attempt reason
              <input
                className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                value={attemptReason}
                onChange={(event) => setAttemptReason(event.target.value)}
                placeholder="e.g. Buyer unavailable"
              />
            </label>
          ) : null}
          {isBuyerAction ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Next action
              <input
                className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                placeholder="What the buyer must do"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {isDelay ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Revised delivery
          <input
            type="datetime-local"
            className="h-8 max-w-xs rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
            value={revisedAt}
            onChange={(event) => setRevisedAt(event.target.value)}
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Reason
        <textarea
          className="min-h-16 max-w-xl rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required operating reason"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" isLoading={pending} disabled={!canSubmit} onClick={() => void submit()}>
          Update shipment
        </Button>
        {error ? (
          <Text size="xsmall" className="text-ui-fg-error" role="alert">
            {error}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

const OrderDeliveryReturns = ({ data: order }: { data?: OrderContext }) => {
  const queryClient = useQueryClient();
  const orderGroup = useQuery({
    queryKey: ["buildkart", "native-order-group", order?.id],
    queryFn: () => client.admin.orders.$id.orderGroup.query({ $id: order!.id }),
    enabled: Boolean(order?.id),
    retry: false,
    staleTime: 30_000,
  });
  const orderGroupId = orderGroup.data?.order_group?.id;
  const lifecycle = useQuery({
    queryKey: ["buildkart", "order-delivery-returns", orderGroupId],
    queryFn: () =>
      client.admin.buildkart.orderGroups.$id.deliveryReturns.query({
        $id: orderGroupId!,
      }),
    enabled: Boolean(orderGroupId),
    refetchInterval: 10_000,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "order-delivery-returns", orderGroupId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-shipments"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-returns"],
      }),
    ]);
  };

  const updateShipment = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ShipmentUpdate }) =>
      client.admin.buildkart.shipments.$id.status.mutate({
        $id: id,
        ...input,
      } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Delivery status updated");
    },
  });

  const decideReturn = useMutation({
    mutationFn: ({ record, decision }: { record: ReturnCase; decision: "approve" | "reject" }) =>
      decision === "approve"
        ? client.admin.buildkart.returns.$id.approve.mutate({
            $id: record.id,
            expected_version: record.version,
            comment: "Approved from order page",
            approved_lines: record.lines.map((line) => ({
              line_key: line.lineKey,
              approved_qty: line.requestedQty,
            })),
          } as never)
        : client.admin.buildkart.returns.$id.reject.mutate({
            $id: record.id,
            expected_version: record.version,
            comment: "Rejected from order page",
          } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Return decision recorded");
    },
    onError: (error) => toast.error((error as Error).message || "Return decision failed"),
  });

  const mode = usePreviewMode();
  const isAdmin = mode === "admin";

  if (!order) return null;
  if (orderGroup.isPending || (orderGroupId && lifecycle.isPending)) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-subtle">
          Loading delivery and returns…
        </Text>
      </Container>
    );
  }
  if (orderGroup.isError || !orderGroupId) {
    return (
      <Container>
        <Heading level="h2">Delivery</Heading>
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          No marketplace order group is linked. Delivery and returns start after marketplace
          checkout completes.
        </Text>
      </Container>
    );
  }
  if (lifecycle.isError || !lifecycle.data) {
    return (
      <Container>
        <Heading level="h2">Delivery</Heading>
        <Text size="small" className="mt-2 text-ui-fg-error" role="alert">
          Could not load delivery and returns. Refresh or check the Experience API.
        </Text>
      </Container>
    );
  }

  const data = lifecycle.data;
  const capabilities = data.capabilities ?? {
    can_update_delivery: false,
    can_update_return: false,
    can_decide_return: false,
  };
  const refundedTotal = Number(order.summary?.refunded_total ?? 0);
  const currencyCode = order.currency_code ?? "inr";
  const activities = [
    ...data.shipments.flatMap((shipment) =>
      shipment.events.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        title: deliveryStatusLabel(event.status),
        detail: `Shipment ${shipment.trackingNumber}`,
      })),
    ),
    ...data.returns.flatMap((record) =>
      record.events.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        title: label(event.eventType),
        detail: `Return ${record.id}`,
      })),
    ),
  ]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 10);

  return (
    <section className="flex flex-col gap-y-3" aria-label="Delivery and returns">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
          <Container className="divide-y p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Heading level="h2">Delivery</Heading>
                  <StatusBadge color="grey">{data.shipments.length}</StatusBadge>
                </div>
              </div>
              <Button asChild size="small" variant="secondary">
                <Link to="/shipments">All shipments</Link>
              </Button>
            </div>
            <div className="px-6 py-5">
              {data.shipments.length === 0 ? (
                <Text size="small" className="text-ui-fg-subtle">
                  Awaiting a marketplace allocation; no shipment has been booked.
                </Text>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.shipments.map((shipment) => {
                    const delivered = deliveredQuantity(shipment);
                    const ordered = orderedQuantity(shipment);
                    const progress = ordered > 0 ? (delivered / ordered) * 100 : 0;
                    const hasDeliveryOptions =
                      isAdmin &&
                      capabilities.can_update_delivery &&
                      shipment.allowedTransitions.length > 0;
                    return (
                      <article
                        key={shipment.id}
                        className="rounded-lg border border-ui-border-base p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge color={statusColor(shipment.status)}>
                                {deliveryStatusLabel(shipment.status)}
                              </StatusBadge>
                              <Text size="small" weight="plus">
                                {shipment.trackingNumber}
                              </Text>
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                v{shipment.version}
                              </Text>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <Meta name="Delivered" value={`${delivered} of ${ordered} units`} />
                              <Meta name="Seller code" value={shipment.sellerId} mono />
                            </div>
                            <div
                              className="mt-3 h-1.5 overflow-hidden rounded-full bg-ui-bg-subtle"
                              role="progressbar"
                              aria-label={`${delivered} of ${ordered} units delivered`}
                              aria-valuemin={0}
                              aria-valuemax={ordered}
                              aria-valuenow={delivered}
                            >
                              <div
                                className="h-full rounded-full bg-ui-bg-interactive"
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                          </div>
                          <Button asChild size="small" variant="transparent">
                            <Link to={`/shipments/${shipment.id}`}>View timeline</Link>
                          </Button>
                        </div>
                        {hasDeliveryOptions ? (
                          <details className="mt-3 rounded-md bg-ui-bg-subtle px-3 py-2">
                            <summary className="cursor-pointer text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive">
                              Update delivery status
                            </summary>
                            <ShipmentUpdateForm
                              key={`${shipment.id}:${shipment.version}`}
                              shipment={shipment}
                              onSubmit={(input) =>
                                updateShipment.mutateAsync({
                                  id: shipment.id,
                                  input,
                                })
                              }
                            />
                          </details>
                        ) : (
                          <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                            {shipment.status === "delivered"
                              ? "Completed — no further delivery updates."
                              : !isAdmin
                                ? "Delivery updates are managed by the marketplace or seller portal."
                                : capabilities.can_update_delivery
                                  ? "No further delivery status is available."
                                  : "Delivery updates are not available for this order."}
                          </Text>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </Container>

          <Container className="divide-y p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Heading level="h2">Returns</Heading>
                  <StatusBadge color="grey">{data.returns.length}</StatusBadge>
                </div>
              </div>
              <Button asChild size="small" variant="secondary">
                <Link to="/returns">All returns</Link>
              </Button>
            </div>
            <div className="px-6 py-5">
              {data.returns.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ui-border-base p-5">
                  <Text size="small" weight="plus">
                    No return is open
                  </Text>
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    If the buyer submits a return, the case and allowed actions will appear here.
                  </Text>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.returns.map((record) => {
                    const canDecide = isAdmin && ["requested", "under_review"].includes(record.status);
                    return (
                      <article
                        key={record.id}
                        className="rounded-lg border border-ui-border-base p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge color={statusColor(record.status)}>
                                {returnStatusLabel(record.status)}
                              </StatusBadge>
                              <Text size="small" weight="plus">
                                {label(record.reasonCode)}
                              </Text>
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                v{record.version}
                              </Text>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <Meta
                                name="Quantity"
                                value={`${requestedQuantity(record)} unit(s)`}
                              />
                              <Meta name="Opened" value={shortDateTime(record.requestedAt)} />
                            </div>
                            {refundedTotal > 0 ? (
                              <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                                Refunded on order: {formatCurrency(refundedTotal, currencyCode)}{" "}
                                (native)
                              </Text>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {canDecide && capabilities.can_decide_return ? (
                              <>
                                <Button
                                  size="small"
                                  isLoading={
                                    decideReturn.isPending &&
                                    decideReturn.variables?.record.id === record.id
                                  }
                                  disabled={decideReturn.isPending}
                                  onClick={() =>
                                    decideReturn.mutate({
                                      record,
                                      decision: "approve",
                                    })
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="small"
                                  variant="danger"
                                  disabled={decideReturn.isPending}
                                  onClick={() => {
                                    if (window.confirm("Reject this return request?")) {
                                      decideReturn.mutate({
                                        record,
                                        decision: "reject",
                                      });
                                    }
                                  }}
                                >
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            <Button asChild size="small" variant="transparent">
                              <Link to={`/returns/${record.id}`}>Open return workbench</Link>
                            </Button>
                          </div>
                        </div>
                        {record.refundSimulation ? (
                          <div className="mt-3 rounded-md bg-ui-bg-subtle p-3">
                            <Text size="small" weight="plus">
                              Simulated refund{" "}
                              {formatCurrency(
                                record.refundSimulation.amountMinor / 100,
                                record.refundSimulation.currencyCode,
                              )}
                            </Text>
                            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                              Reference {record.refundSimulation.simulationReference} · no real
                              money or stock moved.
                            </Text>
                          </div>
                        ) : record.status === "inspection_complete" ? (
                          <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                            Inspection complete. Record the simulated refund in the return
                            workbench.
                          </Text>
                        ) : ["received", "inspection_pending"].includes(record.status) ? (
                          <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                            Received. Inspection is pending in the return workbench.
                          </Text>
                        ) : record.status === "approved" ? (
                          <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                            Approved. Mark receipt and record inspection in the return workbench.
                          </Text>
                        ) : record.status === "closed" ? (
                          <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                            Closed — workflow evidence only.
                          </Text>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </Container>
        </div>

        <aside className="flex min-w-0 flex-col gap-3" aria-label="Order activity and references">
          <Container className="p-0">
            <div className="border-b border-ui-border-base px-5 py-4">
              <Heading level="h3">Activity</Heading>
            </div>
            <ol className="flex flex-col px-5 py-3">
              {activities.length === 0 ? (
                <li>
                  <Text size="small" className="text-ui-fg-subtle">
                    No delivery or return activity yet.
                  </Text>
                </li>
              ) : (
                activities.map((activity) => (
                  <li key={activity.id} className="border-l border-ui-border-base py-2 pl-3">
                    <Text size="small" weight="plus">
                      {activity.title}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {activity.detail} · {shortDateTime(activity.occurredAt)}
                    </Text>
                  </li>
                ))
              )}
            </ol>
          </Container>

          <Container className="p-0">
            <details>
              <summary className="cursor-pointer px-5 py-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive">
                System references
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-ui-border-base px-5 py-4">
                <Meta name="Order group" value={data.order_group_id} mono />
                <Meta name="Customer checkout" value={data.order_id} mono />
                <Meta name="Projection updated" value={shortDateTime(data.latest_update)} />
              </div>
            </details>
          </Container>
        </aside>
      </div>
    </section>
  );
};

export const config = defineWidgetConfig({
  zone: "orders.detail.main.after",
});

export default OrderDeliveryReturns;
