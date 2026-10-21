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

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Heading level="h2">Delivery &amp; returns</Heading>
            <StatusBadge color="orange">Staging</StatusBadge>
          </div>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Shipment evidence and customer return cases for order #
            {order.display_id ?? order.id}.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="small" variant="secondary">
            <Link to="/shipments">All shipments</Link>
          </Button>
          <Button asChild size="small" variant="secondary">
            <Link to="/returns">All returns</Link>
          </Button>
        </div>
      </div>

      {orderGroup.isPending || (orderGroupId && lifecycle.isPending) ? (
        <Text size="small" className="px-6 py-6 text-ui-fg-subtle">
          Loading delivery and return status…
        </Text>
      ) : orderGroup.isError || !orderGroupId ? (
        <div className="px-6 py-6">
          <Text size="small" weight="plus">
            No Mercur order group is linked.
          </Text>
          <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
            Delivery tracking starts for orders completed through the
            marketplace checkout.
          </Text>
        </div>
      ) : lifecycle.isError || !lifecycle.data ? (
        <Text size="small" className="px-6 py-6 text-ui-fg-error">
          Could not load the delivery and return projection. Check the
          Experience API proxy.
        </Text>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-3">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Order group
              </Text>
              <Text size="small" weight="plus">
                {lifecycle.data.order_group_id}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Customer checkout
              </Text>
              <Text size="small" weight="plus">
                {lifecycle.data.order_id}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Last update
              </Text>
              <Text size="small" weight="plus">
                {new Date(lifecycle.data.latest_update).toLocaleString("en-IN")}
              </Text>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
              <Heading level="h3">Shipments</Heading>
              <StatusBadge color="grey">
                {lifecycle.data.shipments.length}
              </StatusBadge>
            </div>
            {lifecycle.data.shipments.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No shipment has been booked for this order group yet.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {lifecycle.data.shipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="rounded-lg border border-ui-border-base p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Text size="small" weight="plus">
                            {shipment.trackingNumber}
                          </Text>
                          <StatusBadge color={shipmentColor(shipment.status)}>
                            {label(shipment.status)}
                          </StatusBadge>
                        </div>
                        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                          Seller {shipment.sellerId} ·{" "}
                          {deliveredQuantity(shipment)}/
                          {orderedQuantity(shipment)} units delivered ·{" "}
                          {shipment.events.length} events
                        </Text>
                        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                          Proof: {shipment.proofRef ?? "Not captured"}
                        </Text>
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                        <Button asChild size="small" variant="secondary">
                          <Link to={`/shipments/${shipment.id}`}>
                            View timeline
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-5">
            <div className="mb-2 flex items-center justify-between">
              <Heading level="h3">Returns</Heading>
              <StatusBadge color="grey">
                {lifecycle.data.returns.length}
              </StatusBadge>
            </div>
            <Text size="xsmall" className="mb-4 text-ui-fg-subtle">
              Customers initiate returns from their order page. Operators
              approve or reject them here.
            </Text>
            {lifecycle.data.returns.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No customer return request for this order.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {lifecycle.data.returns.map((record) => (
                  <div
                    key={record.id}
                    className="rounded-lg border border-ui-border-base p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Text size="small" weight="plus">
                            {record.id}
                          </Text>
                          <StatusBadge color={returnColor(record.status)}>
                            {label(record.status)}
                          </StatusBadge>
                        </div>
                        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                          {label(record.reasonCode)} ·{" "}
                          {requestedQuantity(record)} unit(s) · Requested{" "}
                          {new Date(record.requestedAt).toLocaleString("en-IN")}
                        </Text>
                        {record.decisionComment ? (
                          <Text
                            size="xsmall"
                            className="mt-1 text-ui-fg-subtle"
                          >
                            Decision: {record.decisionComment}
                          </Text>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {record.status === "requested" ? (
                          <>
                            <Button
                              size="small"
                              variant="primary"
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
                        <Button asChild size="small" variant="secondary">
                          <Link to={`/returns/${record.id}`}>View case</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-3">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Staging workflow evidence only. Return decisions create no refund,
              Medusa money effect or Tryton stock movement.
            </Text>
          </div>
        </>
      )}
    </Container>
  );
};

// Place operational status above the native order sections so it is visible without scrolling past
// payment, fulfillment, metadata and JSON panels.
// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "orders.detail.main.before",
});

export default OrderDeliveryReturns;
