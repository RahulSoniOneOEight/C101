/* eslint-disable react-refresh/only-export-components */
import { Button, Container, Heading, StatusBadge, Text, toast } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import type { InferClientOutput } from "@mercurjs/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../lib/client";

type OrderContext = {
  id: string;
  display_id?: number | string | null;
};

export type Lifecycle = InferClientOutput<
  typeof client.vendor.buildkart.orders.$id.deliveryReturns.query
>;
type Shipment = Lifecycle["shipments"][number];
type ReturnCase = Lifecycle["returns"][number];

type ShipmentUpdate = {
  status: string;
  expected_version: number;
  operation_key: string;
  reason: string;
  proof_ref?: string;
  delivered_lines?: Array<{ line_key: string; delivered_qty: number }>;
};

const DELIVERY_OPTIONS = [
  { value: "picked_up", label: "Dispatched" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out For Delivery" },
  { value: "delivered", label: "Delivered" },
] as const;

const RETURN_OPTIONS = [
  { value: "pickup_scheduled", label: "Waiting For Pickup" },
  { value: "closed", label: "Return Completed" },
] as const;

const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: "Schedule Return",
  under_review: "Schedule Return",
  approved: "Schedule Return",
  pickup_scheduled: "Waiting For Pickup",
  pickup_attempted: "Waiting For Pickup",
  in_return_transit: "Waiting For Pickup",
  received: "Return Completed",
  closed: "Return Completed",
};

const label = (value: string) =>
  value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const deliveryStatusLabel = (status: string) =>
  DELIVERY_OPTIONS.find((option) => option.value === status)?.label ?? label(status);

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
  if (status === "delivered" || status === "closed") return "green";
  if (["cancelled", "rejected"].includes(status)) return "red";
  if (["picked_up", "in_transit", "out_for_delivery", "pickup_scheduled"].includes(status)) {
    return "blue";
  }
  return "orange";
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

export const returnSummary = (records: ReturnCase[]) => {
  const requested = records.reduce((total, record) => total + requestedQuantity(record), 0);
  const active = records.find((record) => record.status !== "closed") ?? records[0];

  return {
    label: active ? returnStatusLabel(active.status) : "No return",
    color: active ? statusColor(active.status) : ("grey" as BadgeColor),
    detail:
      records.length > 0
        ? `${requested} unit(s)${records.length > 1 ? ` · ${records.length} returns` : ""}`
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
  const options = DELIVERY_OPTIONS.filter((option) =>
    shipment.allowedTransitions.includes(option.value),
  );
  const [status, setStatus] = useState<string>(options[0]?.value ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (options.length === 0) {
    return (
      <Text size="xsmall" className="text-ui-fg-subtle">
        No further delivery status is available.
      </Text>
    );
  }

  const submit = async () => {
    if (!status) return;
    setPending(true);
    setError("");
    try {
      const delivered = status === "delivered";
      await onSubmit({
        status,
        expected_version: shipment.version,
        operation_key: crypto.randomUUID(),
        reason: "Manual delivery status update from order page",
        proof_ref: delivered ? `staging://order-page/${shipment.id}` : undefined,
        delivered_lines: delivered
          ? shipment.lines.map((line) => ({
              line_key: line.lineKey,
              delivered_qty: line.orderedQty,
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
          className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" isLoading={pending} onClick={() => void submit()}>
          Update delivery status
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

function ReturnUpdateForm({
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
  const stateOptions =
    record.status === "approved"
      ? ["pickup_scheduled"]
      : record.status === "pickup_scheduled"
        ? ["closed"]
        : [];
  const options = RETURN_OPTIONS.filter(
    (option) =>
      stateOptions.includes(option.value) && record.allowedTransitions.includes(option.value),
  );
  const [status, setStatus] = useState<string>(options[0]?.value ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (options.length === 0) return null;

  const submit = async () => {
    if (!status) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        status,
        expected_version: record.version,
        operation_key: crypto.randomUUID(),
        note: "Manual return status update from order page",
      });
    } catch (cause) {
      setError((cause as Error).message || "Return status update failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-ui-border-base pt-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Return status
        <select
          className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" isLoading={pending} onClick={() => void submit()}>
          Update return status
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

const SellerOrderDeliveryReturns = ({ data: order }: { data?: OrderContext }) => {
  const queryClient = useQueryClient();
  const lifecycle = useQuery({
    queryKey: ["buildkart", "seller-order-delivery-returns", order?.id],
    queryFn: () =>
      client.vendor.buildkart.orders.$id.deliveryReturns.query({
        $id: order!.id,
      }),
    enabled: Boolean(order?.id),
    retry: false,
    refetchInterval: 10_000,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-order-delivery-returns", order?.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-shipments"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-returns"],
      }),
    ]);
  };

  const updateShipment = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ShipmentUpdate }) =>
      client.vendor.buildkart.shipments.$id.status.mutate({
        $id: id,
        ...input,
      } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Delivery status updated");
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
      toast.success("Return status updated");
    },
  });

  if (!order) return null;
  if (lifecycle.isPending) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-subtle">
          Loading delivery and returns…
        </Text>
      </Container>
    );
  }
  if (lifecycle.isError || !lifecycle.data) {
    return (
      <Container>
        <Heading level="h2">Delivery</Heading>
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
  };
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
                  No shipment is allocated to this Seller order yet.
                </Text>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.shipments.map((shipment) => {
                    const delivered = deliveredQuantity(shipment);
                    const ordered = orderedQuantity(shipment);
                    const progress = ordered > 0 ? (delivered / ordered) * 100 : 0;
                    const hasDeliveryOptions =
                      capabilities.can_update_delivery &&
                      DELIVERY_OPTIONS.some((option) =>
                        shipment.allowedTransitions.includes(option.value),
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
                              <Meta name="Seller" value={data.seller_id} mono />
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
                            <Meta name="Quantity" value={`${requestedQuantity(record)} unit(s)`} />
                            <Meta name="Opened" value={shortDateTime(record.requestedAt)} />
                          </div>
                        </div>
                        <Button asChild size="small" variant="transparent">
                          <Link to={`/returns/${record.id}`}>View return</Link>
                        </Button>
                      </div>
                      {capabilities.can_update_return ? (
                        <ReturnUpdateForm
                          key={`${record.id}:${record.version}`}
                          record={record}
                          onSubmit={(input) => updateReturn.mutateAsync({ id: record.id, input })}
                        />
                      ) : null}
                      {record.status === "closed" ? (
                        <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                          Completed — no further return updates.
                        </Text>
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
                <Meta name="Seller" value={data.seller_id} mono />
                <Meta name="Projection updated" value={shortDateTime(data.latest_update)} />
              </div>
            </details>
          </Container>
        </aside>
      </div>
    </section>
  );
};

export default SellerOrderDeliveryReturns;

// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "orders.detail.main.after",
});
