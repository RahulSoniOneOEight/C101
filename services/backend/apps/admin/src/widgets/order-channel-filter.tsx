import { Button, Container, Text } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchOrderChannels } from "../lib/order-channels";

/**
 * Channel entry point on the native Orders list.
 *
 * Medusa's native order query does not expose order metadata filters, so the
 * channel view is a focused read-only workbench rather than a fake table
 * filter. Counts come from canonical order metadata and link back to the native
 * order detail page.
 */
function OrderChannelFilterWidget() {
  const orders = useQuery({
    queryKey: ["buildkart", "order-channels", "widget"],
    queryFn: () => fetchOrderChannels("all", { limit: 1 }),
    refetchInterval: 30_000,
  });
  const summary = orders.data?.summary;

  return (
    <Container className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <Text size="small" weight="plus">
          Filter orders by channel
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          B2B and B2C are stored on the canonical order metadata.
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" variant="secondary" asChild>
          <Link to="/order-channels?channel=all">
            All <span className="ml-1 tabular-nums">{summary?.all ?? "—"}</span>
          </Link>
        </Button>
        <Button size="small" variant="secondary" asChild>
          <Link to="/order-channels?channel=b2c">
            B2C <span className="ml-1 tabular-nums">{summary?.b2c ?? "—"}</span>
          </Link>
        </Button>
        <Button size="small" variant="secondary" asChild>
          <Link to="/order-channels?channel=b2b">
            B2B <span className="ml-1 tabular-nums">{summary?.b2b ?? "—"}</span>
          </Link>
        </Button>
      </div>
    </Container>
  );
}

export const config = defineWidgetConfig({
  zone: "orders.list.before",
});

export default OrderChannelFilterWidget;
