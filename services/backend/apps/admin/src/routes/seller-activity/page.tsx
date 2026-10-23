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

type PriceSnapshot = {
  prices?: PriceRow[];
  list_price_minor?: number | null;
  gst_inclusive?: boolean;
};

type B2bTier = {
  min_quantity?: number | null;
  max_quantity?: number | null;
  amount?: number | null;
};

type B2bSnapshot = {
  configured?: boolean;
  amount?: number | null;
  moq?: number | null;
  tiers?: B2bTier[];
  price_list_id?: string | null;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  aggregate_id: string;
  occurred_at: string;
  channel?: "b2c" | "b2b";
  seller?: { id: string; name?: string | null } | null;
  offer?: {
    id: string;
    sku?: string | null;
    product_id?: string | null;
  } | null;
  product?: {
    id: string;
    title?: string | null;
    handle?: string | null;
  } | null;
  actor?: {
    id: string;
    name?: string | null;
    email?: string | null;
    kind?: "admin" | "seller" | "unknown";
  } | null;
  payload: {
    seller_id?: string;
    offer_id?: string;
    product_id?: string | null;
    actor_user_id?: string | null;
    actor_role?: string;
    channel?: "b2c" | "b2b";
    source?: string;
    reason?: string | null;
    before?: PriceSnapshot | B2bSnapshot | null;
    after?: PriceSnapshot | B2bSnapshot | null;
  };
};

// eslint-disable-next-line react-refresh/only-export-components
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

const money = (amount?: number | null) =>
  amount === undefined || amount === null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount / 100);

const tierText = (count: number): string =>
  count > 0 ? ` · ${count} tier${count === 1 ? "" : "s"}` : "";

function priceSummary(prices: PriceRow[] | undefined): string {
  if (!prices || prices.length === 0) return "Not set";
  const inr = prices.filter((price) => (price.currency_code ?? "inr") === "inr");
  const base = inr.find(
    (price) => price.min_quantity === null || price.min_quantity === undefined,
  );
  const tiers = inr.filter(
    (price) => price.min_quantity !== null && price.min_quantity !== undefined,
  );
  return `${money(base?.amount)}${tierText(tiers.length)}`;
}

function b2bSummary(snapshot: B2bSnapshot | null | undefined): string {
  if (!snapshot || snapshot.configured === false || snapshot.amount == null) {
    return "Not configured";
  }
  const moq =
    snapshot.moq && snapshot.moq > 1 ? ` · MOQ ${snapshot.moq}` : "";
  return `${money(snapshot.amount)}${moq}${tierText(
    snapshot.tiers?.length ?? 0,
  )}`;
}

function eventChannel(event: ActivityEvent): "b2c" | "b2b" {
  if (event.channel === "b2b" || event.payload.channel === "b2b") return "b2b";
  return "b2c";
}

function changeSummary(event: ActivityEvent): {
  channel: "b2c" | "b2b";
  before: string;
  after: string;
} {
  const channel = eventChannel(event);
  if (channel === "b2b") {
    return {
      channel,
      before: b2bSummary(event.payload.before as B2bSnapshot | null),
      after: b2bSummary(event.payload.after as B2bSnapshot | null),
    };
  }
  return {
    channel,
    before: priceSummary(
      (event.payload.before as PriceSnapshot | null)?.prices,
    ),
    after: priceSummary((event.payload.after as PriceSnapshot | null)?.prices),
  };
}

function sourceLabel(source?: string): string {
  if (source === "admin_console") return "Admin console";
  if (source === "seller_portal") return "Seller portal";
  return source ?? "Unknown source";
}

function roleLabel(role?: string): string {
  if (role === "admin") return "Admin";
  if (role === "seller") return "Seller";
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "Unknown role";
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
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
              Seller price changes, newest first. Seller, product and actor names
              are resolved from the current read model; raw IDs remain available
              on hover.
            </Text>
          </div>
          <StatusBadge color="grey">
            {activity.data?.length ?? 0} changes
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
            <Table className="w-full min-w-[960px] table-fixed">
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell className="w-[150px]">When</Table.HeaderCell>
                  <Table.HeaderCell className="w-[180px]">Seller</Table.HeaderCell>
                  <Table.HeaderCell className="w-[260px]">
                    Product / offer
                  </Table.HeaderCell>
                  <Table.HeaderCell className="w-[190px]">
                    Price change
                  </Table.HeaderCell>
                  <Table.HeaderCell className="w-[180px]">
                    Actor / source
                  </Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {activity.data?.map((event) => {
                  const sellerId = event.payload.seller_id;
                  const sellerName =
                    event.seller?.name ?? sellerId ?? "Unknown seller";
                  const productId =
                    event.product?.id ??
                    event.payload.product_id ??
                    event.offer?.product_id ??
                    null;
                  const offerId =
                    event.offer?.id ??
                    event.payload.offer_id ??
                    event.aggregate_id;
                  const offerLabel =
                    event.product?.title ??
                    event.offer?.sku ??
                    offerId ??
                    "Unknown offer";
                  const offerSecondary = [
                    event.offer?.sku ? `SKU ${event.offer.sku}` : null,
                    offerId,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const sellerQuery = sellerId
                    ? `?seller_id=${encodeURIComponent(sellerId)}`
                    : "";
                  const actorId = event.payload.actor_user_id ?? null;
                  const actorKind =
                    event.actor?.kind ??
                    (actorId?.startsWith("user_")
                      ? "admin"
                      : actorId?.startsWith("mem_")
                        ? "seller"
                        : "unknown");
                  const actorName =
                    event.actor?.name ??
                    event.actor?.email ??
                    (actorKind === "admin"
                      ? "Unknown admin"
                      : actorKind === "seller"
                        ? "Unknown seller"
                        : "Unknown actor");
                  const actorSecondary = [
                    roleLabel(event.payload.actor_role),
                    sourceLabel(event.payload.source),
                  ].join(" · ");
                  const change = changeSummary(event);
                  const reason = event.payload.reason?.trim();

                  return (
                    <Table.Row key={event.id}>
                      <Table.Cell className="whitespace-nowrap align-top">
                        <Text size="small">{formatWhen(event.occurred_at)}</Text>
                      </Table.Cell>
                      <Table.Cell className="align-top">
                        <span title={sellerName}>
                          <Text
                            size="small"
                            weight="plus"
                            className="block max-w-[210px] truncate"
                          >
                            {sellerName}
                          </Text>
                        </span>
                        {sellerId && sellerName !== sellerId ? (
                          <span title={sellerId}>
                            <Text
                              size="xsmall"
                              className="mt-0.5 block max-w-[210px] truncate font-mono text-ui-fg-subtle"
                            >
                              {sellerId}
                            </Text>
                          </span>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell className="align-top">
                        {productId ? (
                          <Link
                            className="block max-w-[300px] truncate text-sm text-ui-fg-interactive underline"
                            to={`/offers/${productId}${sellerQuery}`}
                            title={offerLabel}
                          >
                            {offerLabel}
                          </Link>
                        ) : (
                          <span title={offerLabel}>
                            <Text
                              size="small"
                              className="block max-w-[300px] truncate"
                            >
                              {offerLabel}
                            </Text>
                          </span>
                        )}
                        <span title={offerId}>
                          <Text
                            size="xsmall"
                            className="mt-0.5 block max-w-[300px] truncate font-mono text-ui-fg-subtle"
                          >
                            {offerSecondary}
                          </Text>
                        </span>
                      </Table.Cell>
                      <Table.Cell className="align-top">
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            color={change.channel === "b2b" ? "blue" : "green"}
                          >
                            {change.channel.toUpperCase()}
                          </StatusBadge>
                          <Text size="small">{change.before}</Text>
                        </div>
                        <Text size="small" className="mt-1 text-ui-fg-subtle">
                          → {change.after}
                        </Text>
                      </Table.Cell>
                      <Table.Cell className="align-top">
                        <span title={actorId ?? actorName}>
                          <Text
                            size="small"
                            className="block max-w-[190px] truncate"
                          >
                            {actorName}
                          </Text>
                        </span>
                        <Text
                          size="xsmall"
                          className="mt-0.5 block text-ui-fg-subtle"
                        >
                          {actorSecondary}
                        </Text>
                      </Table.Cell>
                      <Table.Cell className="align-top">
                        <span title={reason ?? undefined}>
                          <Text
                            size="small"
                            className="block max-w-[220px] truncate text-ui-fg-subtle"
                          >
                            {reason || "—"}
                          </Text>
                        </span>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  );
}
