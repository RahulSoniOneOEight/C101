import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  EMAIL_HINT_COOKIE,
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  listMyNotifications,
} from "@/lib/experience-api";
import { LogoutButton } from "../components/logout-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your account",
};

export default async function AccountPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/account")}`);
  }
  const email = cookieStore.get(EMAIL_HINT_COOKIE)?.value ?? "Signed-in pilot customer";
  let unread = 0;
  try {
    const notifications = await listMyNotifications(token, 50);
    unread = notifications.filter((item) => !item.read_at).length;
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/account")}`);
    }
    // The account hub still works when the notification inbox is briefly unavailable.
  }
  const name = email.includes("@") ? email.split("@")[0] : email;

  return (
    <section className="account-page">
      <div className="account-hero">
        <span className="account-avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="account-hero-copy">
          <span className="eyebrow">Your BazarBee account</span>
          <h1>Hello, {name}</h1>
          <p className="muted">
            {email} · staging pilot · orders, tracking and returns are owner-scoped
          </p>
        </div>
        <LogoutButton />
      </div>

      <div className="account-grid">
        <Link className="account-card" href="/orders">
          <span className="account-card-icon" aria-hidden="true">▤</span>
          <strong>Orders &amp; tracking</strong>
          <p>Every completed order, shipment event and return in one place.</p>
          <span className="card-link">View orders →</span>
        </Link>
        <Link className="account-card" href="/returns">
          <span className="account-card-icon" aria-hidden="true">↺</span>
          <strong>Returns</strong>
          <p>Open and follow return requests with inspection status.</p>
          <span className="card-link">View returns →</span>
        </Link>
        <Link className="account-card" href="/wishlist">
          <span className="account-card-icon" aria-hidden="true">♥</span>
          <strong>Wishlist</strong>
          <p>Products you saved on this device, ready when you are.</p>
          <span className="card-link">Open wishlist →</span>
        </Link>
        <Link className="account-card" href="/notifications">
          <span className="account-card-icon" aria-hidden="true">◉</span>
          <strong>Notifications</strong>
          <p>{unread > 0 ? `${unread} unread updates in your inbox.` : "Order and delivery updates."}</p>
          <span className="card-link">Open inbox →</span>
        </Link>
        <Link className="account-card" href="/cart">
          <span className="account-card-icon" aria-hidden="true">▦</span>
          <strong>Cart</strong>
          <p>Pick up where you left off and finish checkout.</p>
          <span className="card-link">View cart →</span>
        </Link>
        <Link className="account-card" href="/trade">
          <span className="account-card-icon" aria-hidden="true">◆</span>
          <strong>BazarBee Trade</strong>
          <p>Negotiated tiers, credit, quotes, RFQ and GST invoices.</p>
          <span className="card-link">Explore trade →</span>
        </Link>
      </div>

      <section className="account-trade-band">
        <div>
          <span className="eyebrow eyebrow-light">Business buyer?</span>
          <h2>Your trade workspace is ready in the BazarBee app</h2>
          <p>
            Credit limits, quotation carts, RFQ workspaces, projects and GST invoices are live in
            the trade app on this same account. The web trade workspace is the next slice.
          </p>
        </div>
        <div className="account-trade-actions">
          <Link className="button button-honey" href="/trade">
            See trade capabilities
          </Link>
          <a className="button button-ghost-light" href="https://gobazarbee.com/#/b2b">
            Open trade app
          </a>
        </div>
      </section>

      <p className="boundary-note">
        Bounded staging pilot · synthetic data · no production effect · email sign-in with
        single-use codes and links
      </p>
    </section>
  );
}
