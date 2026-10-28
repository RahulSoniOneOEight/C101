import { Container, Heading, Text } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import {
  deliverySummary,
  formatCurrency,
  paymentStatusColor,
  paymentStatusLabel,
  returnSummary,
  StatusTile,
} from "./order-delivery-returns";

type OrderContext = {
  id: string;
  payment_status?: string | null;
  currency_code?: string | null;
  summary?: {
    refunded_total?: number | null;
  } | null;
};

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
  const refundDetail = simulatedRefund
    ? `${simulatedRefund.simulationReference} · no real money`
    : refundedTotal > 0
      ? "Native refund"
      : undefined;

  return (
    <section aria-labelledby="order-workbench-title">
      <Container className="p-0">
        <div className="px-6 py-5">
          <Heading id="order-workbench-title" level="h2">
            Order operations
          </Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Payment and refund use native Medusa controls. Delivery and returns are seller-scoped.
          </Text>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatusTile
              label="Payment"
              value={paymentLabel}
              detail="Native payment"
              color={paymentStatusColor(order.payment_status)}
            />
            <StatusTile
              label="Refund"
              value={refundValue}
              detail={refundDetail}
              color={simulatedRefund || refundedTotal > 0 ? "orange" : "grey"}
            />
            <StatusTile
              label="Delivery"
              value={delivery.label}
              detail={delivery.detail}
              color={delivery.color}
            />
            <StatusTile
              label="Return"
              value={returnState.label}
              detail={returnState.detail}
              color={returnState.color}
            />
          </div>
        </div>
      </Container>
    </section>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "orders.detail.main.before",
});

export default OrderWorkbenchStatus;
