import { Clock } from "@medusajs/icons";
import {
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

declare const __BACKEND_URL__: string;

type PriceRow = {
  amount?: number;
  currency_code?: string;
  min_quantity?: number | null;
  max_quantity?: number | null;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  aggregate_id: string;
  occurred_at: string;
  payload: {
    seller_id?: string;
    offer_id?: string;
    product_id?: string | null;
    actor_user_id?: string | null;
    actor_role?: string;
    source?: string;
    reason?: string | null;
    before?: { prices?: PriceRow[] } | null;
    after?: { prices?: PriceRow[] } | null;
  };
};

export const config: RouteConfig = {
  label: "Seller activity",
  icon: Clock,
  rank: 72,
};

const backend = __BACKEND_URL__.replace(/\/$/, "");

async function fetchActivity(): Promise<ActivityEvent[]> {
  const response = await fetch(
    `${backend}/admin/buildkart/seller-activity?limit=100&event_type=seller.`,
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(`Activity request failed (${response.status}).`);
  const body = (await response.json()) as { items?: ActivityEvent[] };
  return body.items ?? [];
}

const money = (amount?: number) =>
  amount === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount / 100);

function priceSummary(prices: PriceRow[] | undefined): string {
  if (!prices || prices.length === 0) return "No price";
  const inr = prices.filter((price) => (price.currency_code ?? "inr") === "inr");
  const base = inr.find(
    (price) => price.min_quantity === null || price.min_quantity === undefined,
  );
  const tiers = inr.filter(
    (price) => price.min_quantity !== null && price.min_quantity !== undefined,
  );
  const tierText = tiers.length === 0 ? "no tiers" : `${tiers.length} tier${tiers.length === 1 ? "" : "s"}`;
  return `${money(base?.amount)} · ${tierText}`;
}

export default function SellerActivityPage() {
  const activity = useQuery({
    queryKey: ["buildkart", "seller-activity"],
    queryFn: fetchActivity,
    refetchInterval: 15_000,
  });

  return (
    <SingleColumnPage>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">Seller activity</Heading>
              <StatusBadge color="orange">Staging data</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Canonical seller price changes with actor, source and before/after
              values. This is a read model over immutable domain events.
            </Text>
          </div>
          <StatusBadge color="grey">
            {activity.data?.length ?? 0} events
          </StatusBadge>
        </div>

        {activity.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading seller activity…
          </Text>
        ) : activity.isError ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load seller activity.
          </Text>
        ) : (activity.data?.length ?? 0) === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            No seller activity recorded yet.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>When</Table.HeaderCell>
                  <Table.HeaderCell>Seller</Table.HeaderCell>
                  <Table.HeaderCell>Offer</Table.HeaderCell>
                  <Table.HeaderCell>Change</Table.HeaderCell>
                  <Table.HeaderCell>Actor</Table.HeaderCell>
                  <Table.HeaderCell>Source</Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {activity.data?.map((event) => (
                  <Table.Row key={event.id}>
                    <Table.Cell>
                      <Text size="small">
                        {new Date(event.occurred_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {event.payload.seller_id ?? "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {event.payload.product_id ? (
                        <Link
                          className="text-ui-fg-interactive text-sm underline"
                          to={`/offers/${event.payload.product_id}`}
                        >
                          {event.payload.offer_id ?? event.aggregate_id}
                        </Link>
                      ) : (
                        <Text size="small">
                          {event.payload.offer_id ?? event.aggregate_id}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">
                        {priceSummary(event.payload.before?.prices)}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        → {priceSummary(event.payload.after?.prices)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">
                        {event.payload.actor_user_id ?? "—"}
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {event.payload.actor_role ?? "unknown"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">
                        {event.payload.source ?? "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">
                        {event.payload.reason ?? "—"}
                      </Text>
                    </Table.Cell>
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
