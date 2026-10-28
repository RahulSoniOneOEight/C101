import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  listMyReturns,
  type CustomerReturn,
} from "@/lib/experience-api";

export const dynamic = "force-dynamic";

const label = (value: string) => value.replaceAll("_", " ");

export default async function ReturnsPage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) redirect("/sign-in");

  let returns: CustomerReturn[];
  try {
    returns = await listMyReturns(token);
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect("/sign-in");
    }
    throw error;
  }

  return (
    <section>
      <div className="page-heading-row order-heading">
        <div>
          <span className="eyebrow">After-sales</span>
          <h1>Returns</h1>
          <p className="muted">
            Requests you opened from your orders. A request is reviewed by the marketplace; it is not
            a refund.
          </p>
        </div>
        <Link className="text-button" href="/orders">
          All orders →
        </Link>
      </div>

      {returns.length === 0 ? (
        <article className="detail-card section-card">
          <h2>No returns yet</h2>
          <p className="muted">
            Open an order and choose Start a return for delivered items inside the return window.
          </p>
          <Link className="button" href="/orders">
            Go to orders
          </Link>
        </article>
      ) : (
        <article className="detail-card section-card">
          <div className="card-row">
            <h2>Your return requests</h2>
            <span className="marker">{returns.length} total</span>
          </div>
          <div className="stack-list">
            {returns.map((returnCase) => (
              <Link
                key={returnCase.id}
                href={`/returns/${encodeURIComponent(returnCase.id)}`}
                className="return-row"
              >
                <div>
                  <strong>{label(returnCase.status)}</strong>
                  <span className="muted">
                    {label(returnCase.reasonCode)} · {returnCase.lines.length} line(s) ·{" "}
                    {new Date(returnCase.requestedAt).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <span className="card-link">
                  {returnCase.refundSimulation ? "View simulation →" : "View return →"}
                </span>
              </Link>
            ))}
          </div>
        </article>
      )}

      <div className="boundary-note">
        Owner-scoped after-sales · synthetic pilot data · no carrier, PSP, stock or settlement effect
      </div>
    </section>
  );
}
