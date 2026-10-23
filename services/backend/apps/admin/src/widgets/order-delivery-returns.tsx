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
import { Link } from "react-router-dom";
import { client } from "../lib/client";

type OrderContext = {
  id: string;
  display_id?: number | string | null;
};

type Lifecycle = InferClientOutput<
  typeof client.admin.buildkart.orderGroups.$id.deliveryReturns.query
>;
type Shipment = Lifecycle["shipments"][number];
type ReturnCase = Lifecycle["returns"][number];

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const shipmentColor = (status: string) => {
  if (status === "delivered" || status === "rto_delivered")
    return "green" as const;
  if (["delivery_failed", "damaged", "lost"].includes(status))
    return "red" as const;
  if (["in_transit", "out_for_delivery", "picked_up"].includes(status))
    return "blue" as const;
  return "orange" as const;
};

const returnColor = (status: string) => {
  if (status === "approved" || status === "closed") return "green" as const;
  if (status === "rejected" || status === "cancelled") return "red" as const;
  return "orange" as const;
};

const deliveredQuantity = (shipment: Shipment) =>
  shipment.lines.reduce((total, line) => total + line.deliveredQty, 0);

const orderedQuantity = (shipment: Shipment) =>
  shipment.lines.reduce((total, line) => total + line.orderedQty, 0);

const requestedQuantity = (record: ReturnCase) =>
  record.lines.reduce((total, line) => total + line.requestedQty, 0);

const approvedQuantity = (record: ReturnCase) =>
  record.lines.reduce((total, line) => total + (line.approvedQty ?? 0), 0);

const decidedQuantity = (record: ReturnCase) =>
  record.status === "approved"
    ? approvedQuantity(record)
    : requestedQuantity(record);

const shortDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const Meta = ({
  label: metaLabel,
  value,
  mono = false,
  truncate = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) => (
  <div className="min-w-0">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {metaLabel}
    </Text>
    <Text
      size="small"
      weight="plus"
      className={
        truncate
          ? `truncate${mono ? " font-mono" : ""}`
          : mono
            ? "break-all font-mono"
            : "break-words"
      }
      title={truncate ? value : undefined}
    >
      {value}
    </Text>
  </div>
);

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
      queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      }),
    ]);
  };

  const recordDelivery = useMutation({
    mutationFn: (shipment: Shipment) =>
      client.admin.buildkart.shipments.$id.deliveryEvidence.mutate({
        $id: shipment.id,
        proof_ref: `staging://order-detail/${shipment.id}`,
        delivered_lines: shipment.lines.map((line) => ({
          line_key: line.lineKey,
          delivered_qty: line.orderedQty,
        })),
      } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Delivery evidence recorded");
    },
    onError: () => toast.error("Could not record delivery evidence"),
  });

  const decideReturn = useMutation({
    mutationFn: ({
      record,
      decision,
    }: {
      record: ReturnCase;
      decision: "approve" | "reject";
    }) =>
      decision === "approve"
        ? client.admin.buildkart.returns.$id.approve.mutate({
            $id: record.id,
            comment: "Approved from native order detail",
            approved_lines: record.lines.map((line) => ({
              line_key: line.lineKey,
              approved_qty: line.requestedQty,
            })),
          } as never)
        : client.admin.buildkart.returns.$id.reject.mutate({
            $id: record.id,
            comment: "Rejected from native order detail",
          } as never),
    onSuccess: async () => {
      await invalidate();
      toast.success("Return decision recorded");
    },
    onError: () => toast.error("Could not record the return decision"),
  });

  if (!order) return null;

  if (orderGroup.isPending || (orderGroupId && lifecycle.isPending)) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-subtle">
          Loading shipment and return status…
        </Text>
      </Container>
    );
  }

  if (orderGroup.isError || !orderGroupId) {
    return (
      <Container>
        <Heading level="h2">Shipment</Heading>
        <Text size="small" className="mt-2" weight="plus">
          No Mercur order group is linked.
        </Text>
        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
          Delivery tracking starts for orders completed through the marketplace
          checkout.
        </Text>
      </Container>
    );
  }

  if (lifecycle.isError || !lifecycle.data) {
    return (
      <Container>
        <Heading level="h2">Shipment</Heading>
        <Text size="small" className="mt-2 text-ui-fg-error">
          Could not load the shipment and return projection. Check the
          Experience API proxy.
        </Text>
      </Container>
    );
  }

  const data = lifecycle.data;

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 items-start md:flex-row md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Heading level="h2">Shipment</Heading>
              <StatusBadge color="grey">{data.shipments.length}</StatusBadge>
              <StatusBadge color="orange">Evidence only</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Delivery evidence for order #{order.display_id ?? order.id}. This
              does not change native Medusa fulfilment status.
            </Text>
          </div>
          <Button
            asChild
            size="small"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          >
            <Link to="/shipments">All shipments</Link>
          </Button>
        </div>

        <div className="px-6 py-5">
          {data.shipments.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              No shipment has been booked for this order yet.
            </Text>
          ) : (
            <div className="flex flex-col gap-3">
              {data.shipments.map((shipment) => {
                const delivered = deliveredQuantity(shipment);
                const ordered = orderedQuantity(shipment);
                const progress = ordered > 0 ? (delivered / ordered) * 100 : 0;
                const lastEvent = shipment.events.at(-1);
                return (
                  <div
                    key={shipment.id}
                    className="rounded-lg border border-ui-border-base p-4"
                  >
                    <div className="flex flex-col items-start gap-4 lg:flex-row lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge color={shipmentColor(shipment.status)}>
                            {label(shipment.status)}
                          </StatusBadge>
                          <Text size="small" weight="plus">
                            {shipment.trackingNumber}
                          </Text>
                        </div>
                        <div
                          className="mt-3 grid grid-cols-2"
                          style={{ columnGap: "1.5rem", rowGap: "0.5rem" }}
                        >
                          <Meta
                            label="Delivered"
                            value={`${delivered} of ${ordered} units`}
                          />
                          <Meta
                            label="Seller"
                            value={shipment.sellerId}
                            mono
                            truncate
                          />
                        </div>
                        <Text
                          size="xsmall"
                          className="mt-2 truncate text-ui-fg-subtle"
                          title={shipment.proofRef ?? "Not captured"}
                        >
                          Proof: {shipment.proofRef ?? "Not captured"}
                        </Text>
                        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                          {shipment.events.length} events
                          {lastEvent
                            ? ` · last update ${shortDateTime(lastEvent.occurredAt)}`
                            : ""}
                        </Text>
                        <div
                          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-subtle"
                          role="progressbar"
                          aria-label={`${delivered} of ${ordered} units delivered`}
                          aria-valuemin={0}
                          aria-valuemax={ordered}
                          aria-valuenow={delivered}
                        >
                          <div
                            className={
                              shipment.status === "delivered"
                                ? "h-full rounded-full bg-ui-tag-green-icon"
                                : "h-full rounded-full bg-ui-tag-blue-icon"
                            }
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        {shipment.status !== "delivered" ? (
                          <Button
                            size="small"
                            variant="primary"
                            isLoading={
                              recordDelivery.isPending &&
                              recordDelivery.variables?.id === shipment.id
                            }
                            disabled={recordDelivery.isPending}
                            onClick={() => recordDelivery.mutate(shipment)}
                          >
                            Record delivery
                          </Button>
                        ) : null}
                        <Button asChild size="small" variant="transparent">
                          <Link to={`/shipments/${shipment.id}`}>
                            View timeline
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 items-start md:flex-row md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Heading level="h2">Returns</Heading>
              <StatusBadge color="grey">{data.returns.length}</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Customers initiate returns from their order page. Operators
              approve or reject them here without issuing a refund or moving
              stock.
            </Text>
          </div>
          <Button
            asChild
            size="small"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          >
            <Link to="/returns">All returns</Link>
          </Button>
        </div>

        <div className="px-6 py-5">
          {data.returns.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              No customer return request for this order.
            </Text>
          ) : (
            <div className="flex flex-col gap-3">
              {data.returns.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-ui-border-base p-4"
                >
                  <div className="flex flex-col items-start gap-4 lg:flex-row lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge color={returnColor(record.status)}>
                          {label(record.status)}
                        </StatusBadge>
                        <Text size="small" weight="plus">
                          {label(record.reasonCode)}
                        </Text>
                      </div>
                      <div
                        className="mt-3 grid grid-cols-2 md:grid-cols-3"
                        style={{ columnGap: "1.5rem", rowGap: "0.5rem" }}
                      >
                        <Meta
                          label={
                            record.status === "approved"
                              ? "Approved quantity"
                              : "Requested quantity"
                          }
                          value={`${decidedQuantity(record)} unit(s)`}
                        />
                        <Meta
                          label="Opened"
                          value={shortDateTime(record.requestedAt)}
                        />
                        <Meta
                          label="Decided by"
                          value={record.decidedBy ?? "Awaiting operator"}
                        />
                      </div>
                      {record.decisionComment ? (
                        <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                          “{record.decisionComment}”
                        </Text>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-start gap-2">
                      {record.status === "requested" ? (
                        <>
                          <Button
                            size="small"
                            variant="primary"
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
                            onClick={() =>
                              decideReturn.mutate({
                                record,
                                decision: "reject",
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      ) : null}
                      <Button asChild size="small" variant="transparent">
                        <Link to={`/returns/${record.id}`}>View return</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>

      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading level="h3">References</Heading>
          <div
            className="mt-3 grid grid-cols-1 md:grid-cols-2"
            style={{ columnGap: "1.5rem", rowGap: "0.5rem" }}
          >
            <Meta label="Order group" value={data.order_group_id} mono />
            <Meta label="Customer checkout" value={data.order_id} mono />
          </div>
          <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
            Last update: {shortDateTime(data.latest_update)}
          </Text>
          <div className="mt-4 rounded-md bg-ui-bg-subtle px-3 py-2">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Staging workflow evidence only. Delivery and return decisions do
              not change native Medusa fulfilment or payment status, create no
              refund, Medusa money effect or Tryton stock movement.
            </Text>
          </div>
        </div>
      </Container>
    </div>
  );
};

// Native order detail, payment and fulfilment stay first. Delivery and returns
// follow them in the same logical reading order used by Shopify's order page.
// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "orders.detail.main.after",
});

export default OrderDeliveryReturns;
