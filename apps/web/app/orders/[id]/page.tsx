import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  formatMoney,
  getMyOrder,
  type CustomerOrderDetail,
} from "@/lib/experience-api";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) redirect("/sign-in");

  let order: CustomerOrderDetail;
  try {
    order = await getMyOrder(token, id);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect("/sign-in");
    }
    if (error instanceof ExperienceApiError && error.status === 404) notFound();
    throw error;
  }

  const returnable = (order.return_eligibility ?? []).filter(
    (line) => line.eligible && line.returnable_qty > 0,
  );
  const returnableByLine = new Map(
    returnable.map((line) => [line.line_key, line.returnable_qty]),
  );

  return (
    <section>
      <Link className="back-link" href="/orders">← All orders</Link>
      <div className="page-heading-row order-heading">
        <div>
          <span className="eyebrow">Customer order</span>
          <h1>{order.order_number ?? "BuildKart order"}</h1>
          <p className="muted">Internal owner reference {order.order_id}</p>
        </div>
        <span className="status-pill">{label(order.status)}</span>
      </div>

      <div className="detail-grid">
        <article className="detail-card">
          <h2>Items</h2>
          <div className="line-list">
            {order.lines.map((line) => (
              <div className="line-row" key={line.line_key}>
                <div>
                  <strong>{line.title}</strong>
                  <span className="muted">
                    SKU {line.sku} · Qty {line.quantity}
                    {returnableByLine.get(line.line_key)
                      ? ` · ${returnableByLine.get(line.line_key)} returnable`
                      : ""}
                  </span>
                </div>
                <span>{formatMoney(line.unit_price * line.quantity, order.currency_code)}</span>
              </div>
            ))}
          </div>
          <dl className="money-summary">
            <div><dt>Subtotal</dt><dd>{order.subtotal_minor === null ? "—" : formatMoney(order.subtotal_minor, order.currency_code)}</dd></div>
            <div><dt>Shipping</dt><dd>{order.shipping_minor === null ? "—" : formatMoney(order.shipping_minor, order.currency_code)}</dd></div>
            <div><dt>Discount</dt><dd>{order.discount_minor === null ? "—" : `−${formatMoney(order.discount_minor, order.currency_code)}`}</dd></div>
            <div className="total-row"><dt>Total</dt><dd>{order.total_minor === null ? "—" : formatMoney(order.total_minor, order.currency_code)}</dd></div>
          </dl>
        </article>

        <article className="detail-card">
          <h2>Delivery tracking</h2>
          {order.shipments.length === 0 ? (
            <p className="muted">No simulated shipment has been booked yet.</p>
          ) : (
            <div className="stack-list">
              {order.shipments.map((shipment) => (
                <div className="status-block" key={shipment.id}>
                  <div className="card-row">
                    <strong>{label(shipment.status)}</strong>
                    <span className="marker">simulated</span>
                  </div>
                  <span className="muted">
                    Tracking {shipment.trackingNumber || "pending"} · {shipment.provider}
                  </span>
                  {shipment.deliveredAt ? (
                    <span className="muted">Delivered {new Date(shipment.deliveredAt).toLocaleString("en-IN")}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <article className="detail-card section-card">
        <div className="card-row">
          <div>
            <span className="eyebrow">After-sales</span>
            <h2>Returns</h2>
          </div>
          <span className="marker">money effect: none</span>
        </div>
        {order.returns.length === 0 ? (
          <p className="muted">No returns are recorded for this order.</p>
        ) : (
          <div className="stack-list">
            {order.returns.map((returnCase) => (
              <Link
                key={returnCase.id}
                href={`/returns/${encodeURIComponent(returnCase.id)}`}
                className="return-row"
              >
                <div>
                  <strong>{label(returnCase.status)}</strong>
                  <span className="muted">
                    {label(returnCase.reasonCode)} · {returnCase.lines.length} line(s)
                  </span>
                </div>
                <span className="card-link">
                  {returnCase.refundSimulation ? "View simulation →" : "View return →"}
                </span>
              </Link>
            ))}
          </div>
        )}
        {returnable.length > 0 ? (
          <div className="return-cta">
            <Link
              className="button"
              href={`/orders/${encodeURIComponent(order.order_id)}/returns/new`}
            >
              Start a return
            </Link>
            <span className="field-hint">
              {returnable.reduce((total, line) => total + line.returnable_qty, 0)} unit(s) across{" "}
              {returnable.length} item(s) can be returned.
            </span>
          </div>
        ) : null}
      </article>

      <div className="boundary-note">
        Simulated payment and logistics · synthetic pilot data · no carrier, PSP, stock or settlement effect
      </div>
    </section>
  );
}
