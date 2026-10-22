import { Tag } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchOrderChannels,
  type OrderChannel,
  type OrderChannelItem,
} from "../../lib/order-channels";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Order channels",
  icon: Tag,
  rank: 70,
  nested: "orders",
};

const CHANNELS: Array<{ value: OrderChannel; label: string }> = [
  { value: "all", label: "All orders" },
  { value: "b2c", label: "B2C" },
  { value: "b2b", label: "B2B" },
];

const label = (value: string | null) =>
  value
    ? value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
    : "—";

const money = (amount: number | null, currency: string) =>
  amount === null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 0,
      }).format(amount);

const channelBadge = (channel: OrderChannelItem["channel"]) => {
  if (channel === "b2b") return <StatusBadge color="blue">B2B</StatusBadge>;
  if (channel === "b2c") return <StatusBadge color="green">B2C</StatusBadge>;
  return <StatusBadge color="grey">Unknown</StatusBadge>;
};

function ChannelFilter({
  active,
  counts,
}: {
  active: OrderChannel;
  counts: { all: number; b2b: number; b2c: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHANNELS.map((channel) => {
        const count =
          channel.value === "all"
            ? counts.all
            : channel.value === "b2b"
              ? counts.b2b
              : counts.b2c;
        return (
          <Button
            key={channel.value}
            size="small"
            variant={active === channel.value ? "primary" : "secondary"}
            asChild
          >
            <Link to={`/order-channels?channel=${channel.value}`}>
              {channel.label}
              <span className="text-ui-fg-muted ml-1 tabular-nums">
                {count}
              </span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

export default function OrderChannelsPage() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("channel");
  const channel: OrderChannel =
    requested === "b2b" || requested === "b2c" ? requested : "all";

  const orders = useQuery({
    queryKey: ["buildkart", "order-channels", channel],
    queryFn: () => fetchOrderChannels(channel, { limit: 200 }),
    refetchInterval: 15_000,
  });

  const counts = orders.data?.summary ?? { all: 0, b2b: 0, b2c: 0 };

  return (
    <SingleColumnPage>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Order channels</Heading>
                <StatusBadge color="orange">Staging data</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Canonical orders separated by the buyer channel stored on the
                order. Open an order to use the native order detail, shipment
                and return surfaces.
              </Text>
            </div>
            <StatusBadge color="grey">
              {orders.data?.count ?? 0} shown
            </StatusBadge>
          </div>
          <ChannelFilter active={channel} counts={counts} />
        </div>

        {orders.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading orders…
          </Text>
        ) : orders.isError || !orders.data ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load order channels. Retry by reloading the page.
          </Text>
        ) : orders.data.items.length === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            No {channel === "all" ? "" : `${channel.toUpperCase()} `}orders yet.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Channel</Table.HeaderCell>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Placed</Table.HeaderCell>
                  <Table.HeaderCell>Total</Table.HeaderCell>
                  <Table.HeaderCell>Payment</Table.HeaderCell>
                  <Table.HeaderCell>Fulfilment</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {orders.data.items.map((order) => (
                  <Table.Row key={order.id}>
                    <Table.Cell>
                      <Link
                        to={`/orders/${order.id}`}
                        className="text-ui-fg-interactive text-sm font-medium underline underline-offset-2"
                      >
                        #{order.display_id ?? order.id}
                      </Link>
                      <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                        {order.id}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{channelBadge(order.channel)}</Table.Cell>
                    <Table.Cell>
                      <Text size="small">{order.email ?? "—"}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">
                        {order.created_at
                          ? new Date(order.created_at).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {money(order.total, order.currency_code)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{label(order.payment_status)}</Table.Cell>
                    <Table.Cell>{label(order.fulfillment_status)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  );
}
