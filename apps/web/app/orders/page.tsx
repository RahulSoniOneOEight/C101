import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  formatMoney,
  listMyOrders,
  type CustomerOrderSummary,
} from "@/lib/experience-api";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

export default async function OrdersPage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) redirect("/sign-in");

  let orders: CustomerOrderSummary[] = [];
  let loadError = "";
  try {
    orders = await listMyOrders(token);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect("/sign-in");
    }
    loadError = error instanceof Error ? error.message : "Orders could not be loaded.";
  }

  return (
    <section>
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">Owner-scoped post-purchase</span>
          <h1>Your orders</h1>
          <p className="muted page-lead">
            Canonical order, simulated delivery and return status from the shared Experience API.
          </p>
        </div>
        <LogoutButton />
      </div>

      {loadError ? <div className="notice err" role="alert">{loadError}</div> : null}
      {!loadError && orders.length === 0 ? (
        <div className="empty-panel">
          <h2>No completed orders yet</h2>
          <p className="muted">Only completed orders owned by this signed-in pilot identity appear here.</p>
          <Link className="button" href="/">Browse catalogue</Link>
        </div>
      ) : null}

      <div className="order-list" aria-label="Customer orders">
        {orders.map((order) => (
          <Link
            key={order.order_id}
            href={`/orders/${encodeURIComponent(order.order_id)}`}
            className="order-card"
          >
            <div className="card-row">
              <div>
                <span className="eyebrow">{dateLabel(order.created_at)}</span>
                <h2>{order.order_number ?? "BuildKart order"}</h2>
              </div>
              <span className="status-pill">{order.status.replaceAll("_", " ")}</span>
            </div>
            <div className="order-card-summary">
              <span>{order.lines.length} {order.lines.length === 1 ? "item" : "items"}</span>
              <strong>
                {order.total_minor === null
                  ? "Total unavailable"
                  : formatMoney(order.total_minor, order.currency_code)}
              </strong>
            </div>
            <span className="card-link">View tracking and returns →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
