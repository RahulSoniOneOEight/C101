import { Container, Heading, Text } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import { deliverySummary, returnSummary, StatusTile } from "./order-delivery-returns";

type OrderContext = {
  id: string;
};

const SellerOrderWorkbenchStatus = ({ data: order }: { data?: OrderContext }) => {
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

  if (!order || !lifecycle.data) return null;

  const data = lifecycle.data;
  const delivery = deliverySummary(data.shipments);
  const returnState = returnSummary(data.returns);

  return (
    <section aria-labelledby="seller-workbench-title">
      <Container className="p-0">
        <div className="px-6 py-5">
          <Heading id="seller-workbench-title" level="h2">
            Delivery and returns
          </Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Seller-scoped operations for this order. Payment and refunds are managed by BuildKart
            Admin.
          </Text>
          <div className="mt-4 grid grid-cols-2 gap-3">
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

export default SellerOrderWorkbenchStatus;
