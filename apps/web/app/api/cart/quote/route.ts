import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  EMAIL_HINT_COOKIE,
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  quoteCart,
  type CheckoutLineInput,
} from "@/lib/experience-api";

/** Quotes the signed-in customer's basket with delivery for the entered postal code. */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to see delivery and totals." }, { status: 401 });
  }
  const email = cookieStore.get(EMAIL_HINT_COOKIE)?.value?.trim() ?? "";
  if (!email) {
    return NextResponse.json(
      { error: "Sign in again to see delivery and totals." },
      { status: 401 },
    );
  }

  let body: { lines?: unknown; postalCode?: string; promoCode?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const lines: CheckoutLineInput[] = Array.isArray(body.lines)
    ? body.lines
        .map((line) => {
          if (!line || typeof line !== "object") return null;
          const candidate = line as { offerId?: unknown; quantity?: unknown };
          const offerId = typeof candidate.offerId === "string" ? candidate.offerId.trim() : "";
          const quantity = Number(candidate.quantity);
          if (!offerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
          return { offerId, quantity };
        })
        .filter((line): line is CheckoutLineInput => line !== null)
    : [];
  if (lines.length === 0) {
    return NextResponse.json({ error: "The cart is empty." }, { status: 400 });
  }
  if (lines.length > 30) {
    return NextResponse.json({ error: "This cart has too many lines." }, { status: 400 });
  }

  try {
    const quote = await quoteCart(
      {
        lines,
        postalCode: typeof body.postalCode === "string" ? body.postalCode : "",
        email,
        promoCode:
          typeof body.promoCode === "string"
            ? body.promoCode.trim().slice(0, 40) || undefined
            : undefined,
      },
      token,
    );
    return NextResponse.json(quote, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ExperienceApiError && error.status === 401) {
      return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    }
    if (
      error instanceof ExperienceApiError &&
      (error.problemType === "promotion-rejected" ||
        error.problemType === "promotion-not-found" ||
        error.problemType === "promotion-usage-limit" ||
        error.problemType === "promotion-unavailable")
    ) {
      const message =
        error.problemType === "promotion-not-found"
          ? "That promo code was not found."
          : error.problemType === "promotion-usage-limit"
            ? "That offer has reached its usage limit."
            : error.problemType === "promotion-unavailable"
              ? "Promotions are unavailable right now. Please retry."
              : "That code is not eligible for this cart.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof ExperienceApiError && [400, 404, 409].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
