/* eslint-disable react-refresh/only-export-components */
import { Container, Heading } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import {
  AttentionStack,
  PaymentsCard,
  ReconciliationCard,
  SectionNav,
  StatusStrip,
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
      detail:
        order.payment_status === "authorized"
          ? "Ready to capture"
          : order.payment_status === "captured"
            ? "Payment captured"
            : "Native payment",
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
      detail: refundedTotal > 0 ? "Native refund issued" : simulatedRefund ? "Simulated refund" : "No refund issued",
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

  if (order.payment_status === "authorized") {
    attention.push({
      tone: "blue" as Tone,
      title: "Payment ready to capture",
      detail: "The authorized payment can be captured from the Payments section below.",
      action: "Capture payment",
      href: "#payments",
    });
  }
  if (exception) {
    attention.push({
      tone: "red" as Tone,
      title: `Delivery exception · ${exception.trackingNumber ?? exception.id}`,
      detail: `${deliveryStatusLabel(exception.status)} · review delivery section`,
      action: "Review delivery",
      href: "#delivery",
    });
  }
  if (pendingReturn) {
    attention.push({
      tone: "orange" as Tone,
      title: "Return decision required",
      detail: `${pendingReturn.id} · ${returnStatusLabel(pendingReturn.status)}`,
      action: "Review return",
      href: "#returns",
    });
  }

  const reconciliationRows = [
    {
      label: "Payment",
      status: paymentLabel,
      tone: paymentStatusColor(order.payment_status) as Tone,
      detail: order.payment_status === "authorized" ? "Ready to capture" : undefined,
    },
    {
      label: "Delivery",
      status: delivery.label,
      tone: delivery.color as Tone,
      detail: delivery.detail,
    },
    {
      label: "Returns",
      status: returnState.label,
      tone: returnState.color as Tone,
      detail: returnState.detail,
    },
    {
      label: "Refund",
      status: refundValue,
      tone: (simulatedRefund || refundedTotal > 0 ? "orange" : "grey") as Tone,
      detail: refundedTotal > 0 ? "Issued" : simulatedRefund ? "Simulated" : "Not issued",
    },
  ];

  return (
    <section aria-labelledby="order-workbench-title">
      <Container className="p-0">
        <div className="px-6 py-4">
          <Heading id="order-workbench-title" level="h2">
            Order operations
          </Heading>
          <StatusStrip items={statusItems} />
          <AttentionStack items={attention} />
          <SectionNav sections={ADMIN_SECTIONS} />
        </div>
      </Container>
      <div className="mt-3 flex flex-col gap-y-3">
        <PaymentsCard order={order} />
        <ReconciliationCard rows={reconciliationRows} />
      </div>
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
