/* eslint-disable react-refresh/only-export-components */
import { Container, Heading, Text } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import {
  AttentionStack,
  PerspectiveBanner,
  RoleModeSwitch,
  SectionNav,
  StatusStrip,
  usePreviewMode,
  type AttentionItem,
  type StatusStripItem,
  type Tone,
} from "../components/order-preview";
import {
  deliverySummary,
  formatCurrency,
  paymentStatusColor,
  paymentStatusLabel,
  returnSummary,
} from "./order-delivery-returns";

type OrderContext = {
  id: string;
  payment_status?: string | null;
  currency_code?: string | null;
  total?: number | null;
  summary?: {
    total?: number | null;
    refunded_total?: number | null;
  } | null;
};

const ADMIN_SECTIONS = [
  { id: "order-summary", label: "Summary" },
  { id: "payments", label: "Payments" },
  { id: "delivery", label: "Delivery" },
  { id: "returns", label: "Returns" },
  { id: "activity", label: "Activity" },
];

const OrderWorkbenchStatus = ({ data: order }: { data?: OrderContext }) => {
  const mode = usePreviewMode();

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

  if (!order || !lifecycle.data) return null;

  const data = lifecycle.data;
  const refundedTotal = Number(order.summary?.refunded_total ?? 0);
  const currencyCode = order.currency_code ?? "inr";
  const delivery = deliverySummary(data.shipments);
  const returnState = returnSummary(data.returns);
  const simulatedRefund = data.returns
    .map((record) => record.refundSimulation)
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
    .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt))[0];

  const paymentLabel = order.payment_status
    ? paymentStatusLabel(order.payment_status)
    : "Status unavailable";

  const refundValue = simulatedRefund
    ? `${formatCurrency(simulatedRefund.amountMinor / 100, simulatedRefund.currencyCode)} simulated`
    : refundedTotal > 0
      ? formatCurrency(refundedTotal, currencyCode)
      : "No refund";

  const statusItems: StatusStripItem[] = [
    {
      label: "Payment",
      value: paymentLabel,
      detail: "Native payment",
      tone: paymentStatusColor(order.payment_status),
    },
    {
      label: "Delivery",
      value: delivery.label,
      detail: delivery.detail,
      tone: delivery.color,
    },
    {
      label: "Returns",
      value: returnState.label,
      detail: returnState.detail,
      tone: returnState.color,
    },
    {
      label: "Refund",
      value: refundValue,
      detail: refundedTotal > 0 ? "Native refund" : simulatedRefund ? "No real money" : "No refund",
      tone: simulatedRefund || refundedTotal > 0 ? "orange" : "grey",
    },
  ];

  const attention: AttentionItem[] = [];
  const pendingReturn = data.returns.find((record) =>
    ["requested", "under_review"].includes(record.status),
  );
  const exception = data.shipments.find((shipment) =>
    ["delivery_failed", "buyer_action_required", "damaged", "lost"].includes(shipment.status),
  );

  if (exception) {
    attention.push({
      tone: "red" as Tone,
      title: `Delivery exception · ${exception.trackingNumber ?? exception.id}`,
      detail: `${deliveryStatusLabel(exception.status)} · review delivery section`,
      action: "Review delivery",
      href: "#delivery",
    });
  }
  if (pendingReturn && mode !== "seller") {
    attention.push({
      tone: "orange" as Tone,
      title: "Return decision required",
      detail: `${pendingReturn.id} · ${returnStatusLabel(pendingReturn.status)}`,
      action: "Review return",
      href: "#returns",
    });
  }

  return (
    <section aria-labelledby="order-workbench-title">
      <Container className="p-0">
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Heading id="order-workbench-title" level="h2">
                Order operations
              </Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Payment and refund use native Medusa controls. Delivery and returns are seller-scoped.
              </Text>
            </div>
            <RoleModeSwitch />
          </div>
          <div className="mt-4">
            <PerspectiveBanner mode={mode} />
          </div>
          <StatusStrip items={statusItems} />
          <AttentionStack items={attention} />
          {mode === "admin" ? <SectionNav sections={ADMIN_SECTIONS} /> : null}
        </div>
      </Container>
    </section>
  );
};

function deliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
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
  return labels[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function returnStatusLabel(status: string) {
  const labels: Record<string, string> = {
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
  return labels[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const config = defineWidgetConfig({
  zone: "orders.detail.main.before",
});

export default OrderWorkbenchStatus;
