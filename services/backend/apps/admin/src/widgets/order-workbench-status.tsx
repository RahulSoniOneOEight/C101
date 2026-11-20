/* eslint-disable react-refresh/only-export-components */
import { Container, Heading, StatusBadge, Text } from "@medusajs/ui";

declare const __BACKEND_URL__: string;
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
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
  metadata?: Record<string, unknown> | null;
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
  const isCod =
    order?.metadata?.payment_method === "cod" || order?.metadata?.payment_mode === "cod";
  useEffect(() => {
    if (!isCod) return;
    const hideCapture = () => {
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (button.textContent?.includes("Capture payment")) {
          button.disabled = true;
          button.style.display = "none";
        }
      });
    };
    hideCapture();
    const observer = new MutationObserver(hideCapture);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isCod]);
  const codCollection = useQuery({
    queryKey: ["buildkart", "order-cod", orderGroupId],
    queryFn: async () => {
      const response = await fetch(
        `${__BACKEND_URL__}/admin/buildkart/order-groups/${encodeURIComponent(orderGroupId!)}/cod`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("COD collection is not available.");
      return (await response.json()) as {
        collection?: {
          status: "pending" | "collected" | "short" | "refused";
          expected_minor: number;
          collected_minor: number;
          proof_ref: string | null;
          collected_at: string | null;
        };
      };
    },
    enabled: Boolean(orderGroupId) && isCod,
    refetchInterval: 10_000,
    retry: false,
  });
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
  const isCodOrder =
    order.metadata?.payment_method === "cod" || order.metadata?.payment_mode === "cod";
  const collection = codCollection.data?.collection;
  const cashStatus = collection?.status;
  const cashCollectedMinor = Number(collection?.collected_minor ?? 0);
  const paymentValue = !isCodOrder
    ? paymentLabel
    : cashStatus === "collected"
      ? "Cash collected"
      : cashStatus === "short"
        ? "Cash short"
        : cashStatus === "refused"
          ? "Cash refused"
          : "Cash due";
  const paymentDetail = !isCodOrder
    ? order.payment_status === "authorized"
      ? "Ready to capture"
      : order.payment_status === "captured"
        ? "Payment captured"
        : "Native payment"
    : cashStatus === "collected"
      ? `${formatCurrency(cashCollectedMinor / 100, currencyCode)} collected`
      : cashStatus === "short"
        ? `${formatCurrency(cashCollectedMinor / 100, currencyCode)} of ${formatCurrency(Number(collection?.expected_minor ?? 0) / 100, currencyCode)}`
        : cashStatus === "refused"
          ? "Delivery refused · no cash"
          : "Collect cash at delivery";
  const paymentTone = !isCodOrder
    ? paymentStatusColor(order.payment_status)
    : cashStatus === "collected"
      ? "green"
      : cashStatus === "refused"
        ? "red"
        : "orange";

  const refundValue = simulatedRefund
    ? `${formatCurrency(simulatedRefund.amountMinor / 100, simulatedRefund.currencyCode)} simulated`
    : refundedTotal > 0
      ? formatCurrency(refundedTotal, currencyCode)
      : "No refund";

  const channel =
    typeof order.metadata?.channel === "string" ? order.metadata.channel : null;
  const isB2B = channel === "b2b";
  const businessAccountId =
    typeof order.metadata?.business_account_id === "string"
      ? order.metadata.business_account_id
      : null;

  const statusItems: StatusStripItem[] = [
    {
      label: "Payment",
      value: paymentValue,
      detail: paymentDetail,
      tone: paymentTone,
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

  if (isCodOrder) {
    if (cashStatus === "short" || cashStatus === "refused") {
      attention.push({
        tone: cashStatus === "refused" ? ("red" as Tone) : ("orange" as Tone),
        title:
          cashStatus === "refused"
            ? "Cash on delivery refused"
            : "Cash on delivery short",
        detail:
          cashStatus === "refused"
            ? "No cash was collected; the seller must raise a credit note."
            : paymentDetail,
        action: "Open payments",
        href: "#payments",
      });
    } else if (cashStatus !== "collected") {
      attention.push({
        tone: "orange" as Tone,
        title: "Cash on delivery · collect at delivery",
        detail:
          "The seller collects cash and records it in the seller portal. Do not capture this payment in Medusa.",
        action: "Open payments",
        href: "#payments",
      });
    }
  } else if (order.payment_status === "authorized") {
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
    ...(isB2B
      ? [
          {
            label: "Channel",
            status: "B2B trade",
            tone: "blue" as Tone,
            detail: businessAccountId ?? "Business buyer",
          },
        ]
      : []),
    {
      label: "Payment",
      status: paymentValue,
      tone: paymentTone as Tone,
      detail: paymentDetail,
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
          <div className="flex flex-wrap items-center gap-2">
            <Heading id="order-workbench-title" level="h2">
              Order operations
            </Heading>
            {isB2B ? (
              <StatusBadge color="purple">B2B trade order</StatusBadge>
            ) : null}
          </div>
          {isB2B ? (
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              B2B channel · business account{" "}
              {businessAccountId ?? "business buyer"}
            </Text>
          ) : null}
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
