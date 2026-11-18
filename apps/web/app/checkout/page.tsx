import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  EMAIL_HINT_COOKIE,
  PILOT_SESSION_COOKIE,
} from "@/lib/experience-api";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/checkout")}`);
  }
  const defaultEmail = cookieStore.get(EMAIL_HINT_COOKIE)?.value ?? "";

  return (
    <section className="checkout-page">
      <div className="checkout-steps" aria-label="Checkout progress">
        <span className="checkout-step done">1 · Cart</span>
        <span className="checkout-step current">2 · Details &amp; payment</span>
        <span className="checkout-step">3 · Confirmation</span>
      </div>
      <CheckoutForm defaultEmail={defaultEmail} />
    </section>
  );
}
