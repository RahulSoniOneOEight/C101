import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  getMyOrder,
  type CustomerReturnEligibilityLine,
} from "@/lib/experience-api";
import { ReturnForm } from "./return-form";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");

const returnableLines = (lines: CustomerReturnEligibilityLine[]) =>
  (lines ?? []).filter((line) => line.eligible && line.returnable_qty > 0);

export default async function NewReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) redirect("/sign-in");

  let order: Awaited<ReturnType<typeof getMyOrder>>;
  try {
    order = await getMyOrder(token, id);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect("/sign-in");
    }
    if (error instanceof ExperienceApiError && error.status === 404) notFound();
    throw error;
  }

  const lines = returnableLines(order.return_eligibility);
  const deadlines = lines
    .map((line) => line.deadline)
    .filter((value): value is string => Boolean(value))
    .sort();
  const earliestDeadline = deadlines[0] ?? null;

  return (
    <section className="narrow-detail">
      <Link className="back-link" href={`/orders/${encodeURIComponent(id)}`}>
        ← Back to order
      </Link>
      <div className="page-heading-row order-heading">
        <div>
          <span className="eyebrow">Owner-scoped return</span>
          <h1>Start a return</h1>
          <p className="muted">
            {order.order_number ?? "BuildKart order"} · reference {order.order_id}
          </p>
        </div>
      </div>

      {lines.length === 0 ? (
        <article className="detail-card section-card">
          <h2>Nothing is returnable right now</h2>
          <p className="muted">
            A return needs delivered units that are still inside the return window and not already
            requested. Check the delivery tracking on this order, or open an existing return for its
            current status.
          </p>
          <Link className="button" href={`/orders/${encodeURIComponent(id)}`}>
            Back to order
          </Link>
        </article>
      ) : (
        <>
          <p className="muted page-lead">
            Choose the items and quantities to return. The marketplace reviews every request; a
            return is not a refund.
          </p>
          <ReturnForm
            orderId={id}
            lines={lines.map((line) => ({
              lineKey: line.line_key,
              sku: line.sku,
              title: line.title,
              returnableQty: line.returnable_qty,
              allowedReasons: line.allowed_reasons,
            }))}
          />
          {earliestDeadline ? (
            <p className="field-hint">
              Return window closes{" "}
              {new Date(earliestDeadline).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              for the earliest item. Inspected items are recorded as evidence only: no stock or money
              moves.
            </p>
          ) : null}
        </>
      )}

      <div className="boundary-note">
        Bounded pilot return policy · simulated logistics · no carrier, PSP, stock or settlement
        effect
      </div>
    </section>
  );
}
