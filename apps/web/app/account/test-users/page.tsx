import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  getMyContexts,
  hasAdminRole,
  listPilotAccess,
} from "@/lib/experience-api";
import { PilotAccessForm } from "./pilot-access-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test-user access",
};

export default async function PilotAccessPage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/account/test-users")}`);
  }

  let isAdmin = false;
  try {
    isAdmin = hasAdminRole(await getMyContexts(token));
  } catch (error) {
    if (error instanceof ExperienceApiError && [401, 403].includes(error.status)) {
      redirect(`/sign-in?next=${encodeURIComponent("/account/test-users")}`);
    }
  }

  if (!isAdmin) {
    return (
      <section className="account-page">
        <div className="empty-panel">
          <span className="eyebrow">Super-admin only</span>
          <h1>Test-user access is restricted</h1>
          <p className="muted">
            The signed-in account does not carry the <code>super_admin</code> role. Ask a
            super-admin to grant access, or sign in with the staging super-admin account.
          </p>
          <div className="buy-actions">
            <Link className="button" href="/account">
              Back to account
            </Link>
            <Link className="button button-ghost" href="/">
              Storefront
            </Link>
          </div>
        </div>
      </section>
    );
  }

  try {
    const directory = await listPilotAccess(token);
    return (
      <section className="account-page">
        <div className="account-hero">
          <div className="account-hero-copy">
            <span className="eyebrow">C101 staging control</span>
            <h1>Test-user access</h1>
            <p className="muted">
              Every allowlisted tester can hold both the consumer and trade channel. Changes take
              effect on the tester&apos;s next request; the environment assignment remains the
              fallback.
            </p>
          </div>
          <Link className="button button-ghost" href="/account">
            Back to account
          </Link>
        </div>
        <PilotAccessForm initial={directory} />
      </section>
    );
  } catch (error) {
    return (
      <section className="account-page">
        <div className="empty-panel">
          <span className="eyebrow">Test-user access</span>
          <h1>The directory is unavailable</h1>
          <p className="muted">
            {error instanceof ExperienceApiError
              ? error.message
              : "The Experience API did not return the pilot-user directory."}
          </p>
          <Link className="button" href="/account">
            Back to account
          </Link>
        </div>
      </section>
    );
  }
}
