import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  formatMoney,
  getMyReturn,
  type CustomerReturn,
} from "@/lib/experience-api";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) redirect("/sign-in");

  let returnCase: CustomerReturn;
  try {
    returnCase = await getMyReturn(token, id);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect("/sign-in");
    }
    if (error instanceof ExperienceApiError && error.status === 404) notFound();
    throw error;
  }

  const simulation = returnCase.refundSimulation;
  const inspected = returnCase.lines.some((line) => line.inspectedAt !== null);

  return (
    <section className="narrow-detail">
      <Link className="back-link" href={`/orders/${encodeURIComponent(returnCase.orderId)}`}>
        ← Back to order
      </Link>
      <div className="page-heading-row order-heading">
        <div>
          <span className="eyebrow">Owner-scoped return</span>
          <h1>Return status</h1>
          <p className="muted">Reference {returnCase.id}</p>
        </div>
        <span className="status-pill">{label(returnCase.status)}</span>
      </div>

      <article className="detail-card section-card">
        <h2>Progress</h2>
        <ol className="progress-list">
          <li className="complete"><strong>Request recorded</strong><span>{label(returnCase.reasonCode)}</span></li>
          <li className={returnCase.decisionComment || !["requested", "under_review"].includes(returnCase.status) ? "complete" : ""}>
            <strong>Marketplace decision</strong>
            <span>{returnCase.decisionComment ?? "Review in progress"}</span>
          </li>
          <li className={inspected ? "complete" : ""}>
            <strong>Inspection evidence</strong>
            <span>{inspected ? "Recorded without stock movement" : "Waiting for receipt and inspection"}</span>
          </li>
          <li className={simulation ? "complete" : ""}>
            <strong>Refund simulation</strong>
            <span>{simulation ? label(simulation.status) : "Not recorded"}</span>
          </li>
        </ol>
      </article>

      <article className="detail-card section-card">
        <h2>Returned items</h2>
        <div className="stack-list">
          {returnCase.lines.map((line) => (
            <div className="status-block" key={line.id}>
              <div className="card-row">
                <strong>{line.sku}</strong>
                <span className="muted">
                  Requested {line.requestedQty} · approved {line.approvedQty ?? "pending"}
                </span>
              </div>
              {line.condition ? (
                <span className="muted">
                  {label(line.condition)} · {label(line.disposition ?? "pending")} intent (evidence only)
                </span>
              ) : (
                <span className="muted">Inspection not yet recorded</span>
              )}
            </div>
          ))}
        </div>
      </article>

      <article className="refund-card section-card">
        <span className="eyebrow">Admin-recorded projection</span>
        <h2>{simulation ? "Simulated refund recorded" : "Refund simulation pending"}</h2>
        {simulation ? (
          <>
            <div className="refund-amount">
              {formatMoney(simulation.amountMinor, simulation.currencyCode)}
            </div>
            <dl className="metadata-list">
              <div><dt>Status</dt><dd>{label(simulation.status)}</dd></div>
              <div><dt>Reference</dt><dd><code>{simulation.simulationReference}</code></dd></div>
              <div><dt>Method</dt><dd>{label(simulation.method)}</dd></div>
              <div><dt>Money effect</dt><dd>none</dd></div>
              <div><dt>Stock effect</dt><dd>none</dd></div>
            </dl>
          </>
        ) : (
          <p className="muted">
            {returnCase.status === "inspection_complete"
              ? "Inspection is complete. Admin may record a simulated projection next."
              : "A simulation can be recorded only after complete inspection evidence."}
          </p>
        )}
        <div className="notice simulation-notice">
          This pilot status does not mean a payment was refunded. No real money moved and no stock,
          accounting, settlement or carrier record changed.
        </div>
      </article>
    </section>
  );
}
