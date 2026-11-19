import {
  getStorefrontPresentation,
  type StorefrontBanner,
} from "@/lib/experience-api";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const channel = next?.startsWith("/trade") ? "b2b" : "b2c";
  let welcomeBanner: StorefrontBanner | null = null;
  try {
    const presentation = await getStorefrontPresentation(channel);
    welcomeBanner =
      presentation.banners.find(
        (banner) => banner.placement === `${channel}.welcome.banner`,
      ) ?? null;
  } catch {
    // The sign-in form remains usable if CMS content is unavailable.
  }
  return (
    <section className="narrow-page auth-page">
      <div className="auth-heading">
        <span className="eyebrow">Customer access</span>
        <h1>Sign in to BazarBee</h1>
        <p className="muted page-lead">
          Use a one-time email code or a magic link. Orders, tracking and returns stay
          owner-scoped — an order number alone never grants access.
        </p>
      </div>
      <SignInForm next={next} welcomeBanner={welcomeBanner} />
      <p className="boundary-note">
        Bounded staging pilot · allowlisted identities · single-use codes and links · HTTP-only
        browser session
      </p>
    </section>
  );
}
