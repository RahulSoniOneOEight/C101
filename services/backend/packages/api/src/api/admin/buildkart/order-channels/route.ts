import { getOrdersListWorkflow } from "@medusajs/core-flows";
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

type OrderChannel = "all" | "b2b" | "b2c";

type ChannelOrderRow = {
  id: string;
  display_id?: number | string | null;
  email?: string | null;
  created_at?: string | Date | null;
  total?: number | string | null;
  currency_code?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  customer?: { email?: string | null } | null;
  summary?: { current_order_total?: number | null } | null;
};

export interface AdminOrderChannelItem {
  id: string;
  display_id: number | string | null;
  email: string | null;
  created_at: string | null;
  total: number | null;
  currency_code: string;
  channel: "b2b" | "b2c" | "unknown";
  status: string | null;
}

export interface AdminOrderChannelResponse {
  items: AdminOrderChannelItem[];
  count: number;
  channel: OrderChannel;
  summary: {
    all: number;
    b2b: number;
    b2c: number;
    unknown: number;
  };
}

const channels: OrderChannel[] = ["all", "b2b", "b2c"];

function parseChannel(value: unknown): OrderChannel {
  const candidate = String(value ?? "all").toLowerCase();
  return channels.includes(candidate as OrderChannel)
    ? (candidate as OrderChannel)
    : "all";
}

function orderChannel(row: ChannelOrderRow): "b2b" | "b2c" | "unknown" {
  const value = row.metadata?.channel;
  return value === "b2b" || value === "b2c" ? value : "unknown";
}

/**
 * Read-only order list by buyer channel for the admin channel workbench.
 *
 * Canonical channel is stored on the Medusa order metadata by the Experience
 * API (`b2b` or `b2c`). The native order list does not expose metadata filters,
 * so this endpoint returns the small, explicit projection the admin needs and
 * keeps the native order detail page as the source of truth for actions.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<AdminOrderChannelResponse>,
): Promise<void> {
  const channel = parseChannel(req.query.channel);
  const limit = Math.min(
    500,
    Math.max(1, Number.parseInt(String(req.query.limit ?? "100"), 10) || 100),
  );
  const offset = Math.max(
    0,
    Number.parseInt(String(req.query.offset ?? "0"), 10) || 0,
  );

  const { result } = await getOrdersListWorkflow(req.scope).run({
    input: {
      fields: [
        "id",
        "display_id",
        "email",
        "created_at",
        "total",
        "currency_code",
        "status",
        "metadata",
        "customer.email",
      ],
      variables: {
        filters: { is_draft_order: false },
        skip: 0,
        take: 1000,
      },
    },
  });
  const data =
    (result as { rows?: ChannelOrderRow[] }).rows ??
    (result as ChannelOrderRow[]);

  const rows = data.map((row) => {
    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : typeof row.created_at === "string"
          ? row.created_at
          : null;
    const total =
      typeof row.total === "number"
        ? row.total
        : typeof row.total === "string" && row.total
          ? Number(row.total)
          : typeof row.summary?.current_order_total === "number"
            ? row.summary.current_order_total
            : null;
    return {
      id: String(row.id),
      display_id: row.display_id ?? null,
      email:
        typeof row.customer?.email === "string"
          ? row.customer.email
          : typeof row.email === "string"
            ? row.email
            : null,
      created_at: createdAt,
      total:
        typeof total === "number" && Number.isFinite(total) ? total : null,
      currency_code:
        typeof row.currency_code === "string" && row.currency_code
          ? row.currency_code
          : "inr",
      channel: orderChannel(row),
      status: typeof row.status === "string" ? row.status : null,
    };
  });

  const summary = rows.reduce(
    (result, row) => {
      result.all += 1;
      result[row.channel] += 1;
      return result;
    },
    { all: 0, b2b: 0, b2c: 0, unknown: 0 },
  );

  const filtered = rows
    .filter((row) => channel === "all" || row.channel === channel)
    .sort((left, right) =>
      String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")),
    );

  res.json({
    items: filtered.slice(offset, offset + limit),
    count: filtered.length,
    channel,
    summary,
  });
}
