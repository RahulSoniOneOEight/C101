declare const __BACKEND_URL__: string;

export type OrderChannel = "all" | "b2b" | "b2c";

export interface OrderChannelItem {
  id: string;
  display_id: number | string | null;
  email: string | null;
  created_at: string | null;
  total: number | null;
  currency_code: string;
  channel: "b2b" | "b2c" | "unknown";
  payment_status: string | null;
  fulfillment_status: string | null;
}

export interface OrderChannelResponse {
  items: OrderChannelItem[];
  count: number;
  channel: OrderChannel;
  summary: {
    all: number;
    b2b: number;
    b2c: number;
    unknown: number;
  };
}

const backend = __BACKEND_URL__.replace(/\/$/, "");

export async function fetchOrderChannels(
  channel: OrderChannel,
  options: { limit?: number; offset?: number } = {},
): Promise<OrderChannelResponse> {
  const params = new URLSearchParams({
    channel,
    limit: String(options.limit ?? 100),
    offset: String(options.offset ?? 0),
  });
  const response = await fetch(
    `${backend}/admin/buildkart/order-channels?${params.toString()}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(`Order channel request failed (${response.status})`);
  }
  return (await response.json()) as OrderChannelResponse;
}
