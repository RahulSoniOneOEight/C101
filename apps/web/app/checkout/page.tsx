import { cookies } from "next/headers";
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
  const defaultEmail = token ? cookieStore.get(EMAIL_HINT_COOKIE)?.value ?? "" : "";

  return (
    <section className="checkout-page">
      <CheckoutForm defaultEmail={defaultEmail} signedIn={Boolean(token)} />
    </section>
  );
}
