import Link from "next/link";
import { MagicLinkHandler } from "./magic-link-handler";

export const dynamic = "force-dynamic";

export default async function EmailMagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;
  return (
    <section className="narrow-page auth-page">
      <div className="auth-heading">
        <span className="eyebrow">Customer access</span>
        <h1>Email sign-in</h1>
      </div>
      <MagicLinkHandler token={token ?? ""} next={next} />
      <p className="boundary-note">
        Trouble signing in?{" "}
        <Link href="/sign-in">Request a new code or link</Link>.
      </p>
    </section>
  );
}
