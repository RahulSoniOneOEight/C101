import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Text,
  toast,
} from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import type { InferClientOutput } from "@mercurjs/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../lib/client";

type OrderContext = {
  id: string;
  display_id?: number | string | null;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  payment_collections?: Array<{
    status?: string | null;
    payments?: Array<{ refunds?: Array<{ amount?: number | null }> }>;
  }>;
  fulfillments?: Array<{
    canceled_at?: string | null;
    delivered_at?: string | null;
    shipped_at?: string | null;
  }>;
  summary?: {
    current_order_total?: number | null;
    paid_total?: number | null;
    refunded_total?: number | null;
  };
};

type Lifecycle = InferClientOutput<
  typeof client.vendor.buildkart.orders.$id.deliveryReturns.query
>;
type Shipment = Lifecycle["shipments"][number];
type ReturnCase = Lifecycle["returns"][number];

type ShipmentInput = {
  status: string;
  expected_version: number;
  operation_key: string;
  reason?: string;
  note?: string;
  attempt_number?: number;
  attempt_reason?: string;
  next_action?: string;
  revised_delivery_at?: string;
  notify_customer?: boolean;
  proof_ref?: string;
  delivered_lines?: Array<{ line_key: string; delivered_qty: number }>;
};

const label = (value: string) =>
  value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const shortDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const statusColor = (status: string) => {
  if (
    [
      "delivered",
      "returned_to_seller",
      "rto_delivered",
      "closed",
      "inspection_complete",
      "paid",
      "allocated",
    ].includes(status)
  ) {
    return "green" as const;
  }
  if (
    ["delivery_failed", "damaged", "lost", "cancelled", "rejected"].includes(
      status,
    )
  ) {
    return "red" as const;
  }
  if (
    [
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "partially_delivered",
      "pickup_scheduled",
      "pickup_attempted",
      "in_return_transit",
      "received",
    ].includes(status)
  ) {
    return "blue" as const;
  }
  return "orange" as const;
};

const combinedStatus = (values: string[], fallback: string) => {
  const unique = [...new Set(values)];
  return unique.length > 0 ? unique.join(" · ") : fallback;
};

const hasPaymentData = (order: OrderContext) =>
  Boolean(
    order.payment_status ||
      (order.payment_collections?.length ?? 0) > 0 ||
      order.summary?.paid_total != null ||
      order.summary?.current_order_total != null,
  );

const paymentStatus = (order: OrderContext) => {
  if (!hasPaymentData(order)) return "not_available";
  if (order.payment_status) return order.payment_status;
  const statuses = (order.payment_collections ?? [])
    .map((collection) => collection.status)
    .filter((status): status is string => Boolean(status));
  if (statuses.length > 0) return statuses.join(", ");
  const paid = Number(order.summary?.paid_total ?? 0);
  const total = Number(order.summary?.current_order_total ?? 0);
  if (total > 0 && paid >= total) return "paid";
  if (paid > 0) return "partially_paid";
  return "not_recorded";
};

const fulfilmentStatus = (order: OrderContext) => {
  if (order.fulfillment_status) return order.fulfillment_status;
  const fulfilments = order.fulfillments ?? [];
  if (fulfilments.length === 0) return "unfulfilled";
  if (fulfilments.every((item) => item.canceled_at)) return "cancelled";
  if (fulfilments.every((item) => item.delivered_at)) return "delivered";
  if (fulfilments.some((item) => item.shipped_at)) return "partially_fulfilled";
  return "fulfilled";
};

const refundStatus = (order: OrderContext) => {
  if (!hasPaymentData(order)) return "not_available";
  const refunded =
    Number(order.summary?.refunded_total ?? 0) ||
    (order.payment_collections ?? []).reduce(
      (sum, collection) =>
        sum +
        (collection.payments ?? []).reduce(
          (paymentSum, payment) =>
            paymentSum +
            (payment.refunds ?? []).reduce(
              (refundSum, refund) => refundSum + Number(refund.amount ?? 0),
              0,
            ),
          0,
        ),
      0,
    );
  if (refunded <= 0) return "not_refunded";
  const total = Number(order.summary?.current_order_total ?? 0);
  return total > 0 && refunded >= total ? "refunded" : "partially_refunded";
};

const StateTile = ({ name, value }: { name: string; value: string }) => (
  <div className="min-w-0 rounded-lg border border-ui-border-base p-3">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {name}
    </Text>
    <div className="mt-2">
      <StatusBadge color={statusColor(value.split(" · ")[0])}>
        {label(value)}
      </StatusBadge>
    </div>
  </div>
);

const Meta = ({ name, value, mono = false }: { name: string; value: string; mono?: boolean }) => (
  <div className="min-w-0">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {name}
    </Text>
    <Text
      size="small"
      weight="plus"
      className={mono ? "break-all font-mono" : "break-words"}
    >
      {value}
    </Text>
  </div>
);

const EXCEPTION_STATUSES = new Set([
  "delayed",
  "delivery_attempted",
  "delivery_failed",
  "buyer_action_required",
  "damaged",
  "lost",
  "returning_to_seller",
  "returned_to_seller",
  "rto_in_transit",
  "rto_delivered",
  "cancelled",
]);

function SellerShipmentForm({
  shipment,
  onSubmit,
}: {
  shipment: Shipment;
  onSubmit: (input: ShipmentInput) => Promise<unknown>;
}) {
  const [status, setStatus] = useState(shipment.allowedTransitions[0] ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [attemptReason, setAttemptReason] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [revisedAt, setRevisedAt] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [proofRef, setProofRef] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(shipment.lines.map((line) => [line.lineKey, line.deliveredQty])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const deliveryStatus = ["partially_delivered", "delivered"].includes(status);
  const attemptStatus = [
    "delivery_attempted",
    "delivery_failed",
    "buyer_action_required",
  ].includes(status);

  if (shipment.allowedTransitions.length === 0) {
    return (
      <Text size="xsmall" className="text-ui-fg-subtle">
        No further shipment transition is available.
      </Text>
    );
  }

  const submit = async () => {
    if (EXCEPTION_STATUSES.has(status) && !reason.trim()) {
      setError("Enter a reason for this exception or terminal status.");
      return;
    }
    if (
      ["cancelled", "lost", "returned_to_seller", "rto_delivered"].includes(status) &&
      !window.confirm(`Confirm ${label(status)} for this shipment?`)
    ) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await onSubmit({
        status,
        expected_version: shipment.version,
        operation_key: crypto.randomUUID(),
        reason: reason.trim() || undefined,
        note: note.trim() || undefined,
        attempt_number: attemptStatus ? attemptNumber : undefined,
        attempt_reason: attemptStatus ? attemptReason.trim() || undefined : undefined,
        next_action: status === "buyer_action_required" ? nextAction.trim() : undefined,
        revised_delivery_at:
          status === "delayed" && revisedAt
            ? new Date(revisedAt).toISOString()
            : undefined,
        notify_customer: notifyCustomer,
        proof_ref: deliveryStatus ? proofRef.trim() : undefined,
        delivered_lines: deliveryStatus
          ? shipment.lines.map((line) => ({
              line_key: line.lineKey,
              delivered_qty:
                status === "delivered"
                  ? line.orderedQty
                  : quantities[line.lineKey] ?? line.deliveredQty,
            }))
          : undefined,
      });
    } catch (cause) {
      setError((cause as Error).message || "Shipment update failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-ui-border-base pt-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          New status
          <select
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {shipment.allowedTransitions.map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Reason
          <input
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required for exceptions, returns or cancellation"
          />
        </label>
      </div>

      {attemptStatus ? (
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

      {status === "buyer_action_required" ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Buyer next action
          <input
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
          />
        </label>
      ) : null}

      {status === "delayed" ? (
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

      {deliveryStatus ? (
        <div className="rounded-md border border-ui-border-base p-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Evidence reference
            <input
              className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
              value={proofRef}
              onChange={(event) => setProofRef(event.target.value)}
              placeholder={`staging://seller-delivery/${shipment.id}`}
            />
          </label>
          <div className="mt-3 flex flex-col gap-2">
            {shipment.lines.map((line) => (
              <label
                key={line.lineKey}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate" title={line.sku}>
                  {line.sku} · {line.deliveredQty}/{line.orderedQty}
                </span>
                <input
                  type="number"
                  min={line.deliveredQty}
                  max={line.orderedQty}
                  disabled={status === "delivered"}
                  className="h-8 w-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-right text-sm"
                  value={
                    status === "delivered"
                      ? line.orderedQty
                      : quantities[line.lineKey] ?? line.deliveredQty
                  }
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [line.lineKey]: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Internal note
        <textarea
          className="min-h-20 rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-2 text-sm"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={notifyCustomer}
          onChange={(event) => setNotifyCustomer(event.target.checked)}
        />
        Record customer notification intent
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" isLoading={pending} onClick={() => void submit()}>
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

function SellerReturnForm({
  record,
  onSubmit,
}: {
  record: ReturnCase;
  onSubmit: (input: {
    status: string;
    expected_version: number;
    operation_key: string;
    note: string;
  }) => Promise<unknown>;
}) {
  const [status, setStatus] = useState(record.allowedTransitions[0] ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (record.allowedTransitions.length === 0) return null;

  const submit = async () => {
    if (!status || !note.trim()) {
      setError("Choose a stage and enter the operating reason.");
      return;
    }
    if (status === "cancelled" && !window.confirm("Cancel this return workflow?")) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        status,
        expected_version: record.version,
        operation_key: crypto.randomUUID(),
        note: note.trim(),
      });
    } catch (cause) {
      setError((cause as Error).message || "Return update failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-ui-border-base pt-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Next stage
        <select
          className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {record.allowedTransitions.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Operating reason
        <input
          className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <Button size="small" isLoading={pending} onClick={() => void submit()}>
        Update return
      </Button>
      {error ? (
        <Text size="xsmall" className="text-ui-fg-error" role="alert">
          {error}
        </Text>
      ) : null}
    </div>
  );
}

const SellerOrderDeliveryReturns = ({ data: order }: { data?: OrderContext }) => {
  const queryClient = useQueryClient();
  const lifecycle = useQuery({
    queryKey: ["buildkart", "seller-order-delivery-returns", order?.id],
    queryFn: () =>
      client.vendor.buildkart.orders.$id.deliveryReturns.query({ $id: order!.id }),
    enabled: Boolean(order?.id),
    retry: false,
    refetchInterval: 10_000,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-order-delivery-returns", order?.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["buildkart", "seller-shipments"] }),
      queryClient.invalidateQueries({ queryKey: ["buildkart", "seller-returns"] }),
    ]);
  };

  const updateShipment = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ShipmentInput }) =>
      client.vendor.buildkart.shipments.$id.status.mutate({
        $id: id,
        ...input,
      } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Shipment status updated");
    },
  });
  const updateReturn = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        status: string;
        expected_version: number;
        operation_key: string;
        note: string;
      };
    }) =>
      client.vendor.buildkart.returns.$id.status.mutate({
        $id: id,
        ...input,
      } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Return stage updated");
    },
  });

  if (!order) return null;
  if (lifecycle.isPending) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-subtle">
          Loading delivery and return operations…
        </Text>
      </Container>
    );
  }
  if (lifecycle.isError || !lifecycle.data) {
    return (
      <Container>
        <Heading level="h2">Delivery &amp; returns</Heading>
        <Text size="small" className="mt-2 text-ui-fg-subtle">
          No Seller-scoped shipment projection is available for this order yet.
        </Text>
      </Container>
    );
  }

  const data = lifecycle.data;
  const capabilities = data.capabilities ?? {
    can_update_delivery: false,
    can_update_return: false,
    can_decide_return: false,
    can_view_payment: false,
    can_manage_refund: false,
    can_view_technical: false,
  };
  const activities = [
    ...data.shipments.flatMap((shipment) =>
      shipment.events.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        title: label(event.status),
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
    <section className="flex flex-col gap-y-3" aria-labelledby="seller-operations-title">
      <Container className="border border-ui-tag-orange-border bg-ui-tag-orange-bg px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Text size="small" weight="plus">
              Staging manual operations
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Update only your allocated shipment and return stages. These controls do not
              issue refunds, change payment, or post stock.
            </Text>
          </div>
          <StatusBadge color="orange">Own allocation only</StatusBadge>
        </div>
      </Container>

      <Container className="p-0">
        <div className="border-b border-ui-border-base px-6 py-4">
          <Heading id="seller-operations-title" level="h2">
            Operational status
          </Heading>
          <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
            Independent states for order #{order.display_id ?? order.id}.
          </Text>
        </div>
        <div
          className="grid gap-3 px-6 py-5"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
        >
          <StateTile name="Order" value={order.status ?? "pending"} />
          <StateTile
            name="Payment"
            value={capabilities.can_view_payment ? paymentStatus(order) : "not_available"}
          />
          <StateTile
            name="Allocation"
            value={data.shipments.length > 0 ? "allocated" : "awaiting_allocation"}
          />
          <StateTile name="Fulfilment" value={fulfilmentStatus(order)} />
          <StateTile
            name="Delivery"
            value={combinedStatus(
              data.shipments.map((shipment) => shipment.status),
              "not_booked",
            )}
          />
          <StateTile
            name="Return"
            value={combinedStatus(
              data.returns.map((record) => record.status),
              "none",
            )}
          />
          <StateTile
            name="Refund"
            value={capabilities.can_view_payment ? refundStatus(order) : "finance_controlled"}
          />
          <StateTile name="Inventory effect" value="no_return_stock_move" />
        </div>
      </Container>

      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          <Container className="divide-y p-0">
            <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Heading level="h2">Delivery &amp; fulfilment</Heading>
                  <StatusBadge color="grey">{data.shipments.length}</StatusBadge>
                </div>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Only shipments allocated to your Seller account are shown.
                </Text>
              </div>
              <Button asChild size="small" variant="secondary">
                <Link to="/shipments">All shipments</Link>
              </Button>
            </div>
            <div className="px-6 py-5">
              {data.shipments.length === 0 ? (
                <Text size="small" className="text-ui-fg-subtle">
                  No shipment is allocated to this Seller order yet.
                </Text>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.shipments.map((shipment) => {
                    const delivered = shipment.lines.reduce(
                      (sum, line) => sum + line.deliveredQty,
                      0,
                    );
                    const ordered = shipment.lines.reduce(
                      (sum, line) => sum + line.orderedQty,
                      0,
                    );
                    return (
                      <article
                        key={shipment.id}
                        className="rounded-lg border border-ui-border-base p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge color={statusColor(shipment.status)}>
                                {label(shipment.status)}
                              </StatusBadge>
                              <Text size="small" weight="plus">
                                {shipment.trackingNumber}
                              </Text>
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                v{shipment.version}
                              </Text>
                            </div>
                            <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                              {delivered} of {ordered} units delivered
                            </Text>
                          </div>
                          <Button asChild size="small" variant="transparent">
                            <Link to={`/shipments/${shipment.id}`}>View timeline</Link>
                          </Button>
                        </div>
                        {capabilities.can_update_delivery ? (
                          <details className="mt-3 rounded-md bg-ui-bg-subtle px-3 py-2">
                            <summary className="cursor-pointer text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-border-interactive">
                              Update shipment
                            </summary>
                            <SellerShipmentForm
                              key={`${shipment.id}:${shipment.version}`}
                              shipment={shipment}
                              onSubmit={(input) =>
                                updateShipment.mutateAsync({ id: shipment.id, input })
                              }
                            />
                          </details>
                        ) : null}
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
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Admin decides the request; you update approved reverse-logistics stages.
                </Text>
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
                    An approved return for your allocated lines will appear here.
                  </Text>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.returns.map((record) => (
                    <article
                      key={record.id}
                      className="rounded-lg border border-ui-border-base p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge color={statusColor(record.status)}>
                              {label(record.status)}
                            </StatusBadge>
                            <Text size="small" weight="plus">
                              {label(record.reasonCode)}
                            </Text>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              v{record.version}
                            </Text>
                          </div>
                          <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                            {record.lines.reduce(
                              (sum, line) => sum + line.requestedQty,
                              0,
                            )}{" "}
                            unit(s) · opened {shortDateTime(record.requestedAt)}
                          </Text>
                        </div>
                        <Button asChild size="small" variant="transparent">
                          <Link to={`/returns/${record.id}`}>View return</Link>
                        </Button>
                      </div>
                      {capabilities.can_update_return ? (
                        <SellerReturnForm
                          key={`${record.id}:${record.version}`}
                          record={record}
                          onSubmit={(input) =>
                            updateReturn.mutateAsync({ id: record.id, input })
                          }
                        />
                      ) : null}
                    </article>
                  ))}
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
                    No logistics activity yet.
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
                <Meta name="Seller" value={data.seller_id} mono />
                <Meta name="Projection updated" value={shortDateTime(data.latest_update)} />
              </div>
            </details>
          </Container>

          <Container>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Refund approval/execution and payment changes are Finance-only. Return stages
              shown here have no automatic money or stock effect.
            </Text>
          </Container>
        </aside>
      </div>
    </section>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "orders.detail.main.after",
});

export default SellerOrderDeliveryReturns;
