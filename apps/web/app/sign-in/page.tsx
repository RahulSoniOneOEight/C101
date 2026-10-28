import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <section className="narrow-page">
      <span className="eyebrow">Customer access</span>
      <h1>Sign in to post-purchase</h1>
      <p className="muted page-lead">
        Orders, tracking and returns are owner-scoped. An order or return identifier alone never
        grants access.
      </p>
      <SignInForm />
      <p className="boundary-note">
        Bounded pilot identity · synthetic users · simulated OTP · HTTP-only browser session
      </p>
    </section>
  );
}
