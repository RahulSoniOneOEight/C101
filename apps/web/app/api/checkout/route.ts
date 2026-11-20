import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  completeCheckout,
  completeGuestCheckout,
  type CheckoutLineInput,
} from "@/lib/experience-api";

function checkoutError(error: unknown) {
  if (error instanceof ExperienceApiError && error.status === 401) {
    return NextResponse.json(
      { error: "Your session cannot place this order. Sign in again." },
      { status: 401 },
    );
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

/**
 * Server-side checkout. The browser cannot manufacture a canonical order: this route calls the
 * shared Experience API and returns only what the server produced. Signed-in customers use their
 * owner-scoped cart; guests use the public B2C path, which requires an email and Indian mobile and
 * never creates an account.
 */
export async function POST(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;

  let body: {
    lines?: unknown;
    email?: string;
    firstName?: string;
    lastName?: string;
    address1?: string;
    city?: string;
    postalCode?: string;
    mobile?: string;
    promoCode?: string;
    channel?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const lines: CheckoutLineInput[] = Array.isArray(body.lines)
    ? body.lines
        .map((line) => {
          if (!line || typeof line !== "object") return null;
          const candidate = line as { offerId?: unknown; quantity?: unknown; channel?: unknown };
          const offerId = typeof candidate.offerId === "string" ? candidate.offerId.trim() : "";
          const quantity = Number(candidate.quantity);
          if (!offerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
          return {
            offerId,
            quantity,
            channel: candidate.channel === "b2b" ? ("b2b" as const) : ("b2c" as const),
          };
        })
        .filter((line): line is CheckoutLineInput => line !== null)
    : [];
  if (lines.length === 0) {
    return NextResponse.json({ error: "The cart is empty." }, { status: 400 });
  }
  if (lines.length > 30) {
    return NextResponse.json({ error: "This cart has too many lines." }, { status: 400 });
  }
  const lineChannels = new Set(lines.map((line) => line.channel ?? "b2c"));
  if (lineChannels.size > 1) {
    return NextResponse.json(
      { error: "Your cart mixes Shop and Trade items. Remove one channel first." },
      { status: 400 },
    );
  }
  const requestedChannel = body.channel === "b2b" ? "b2b" : "b2c";
  if (!lineChannels.has(requestedChannel)) {
    return NextResponse.json(
      { error: "The cart channel does not match its items." },
      { status: 400 },
    );
  }
  if (!body.email || !body.postalCode || !body.firstName || !body.address1 || !body.city) {
    return NextResponse.json(
      { error: "email, name, address, city and postalCode are required" },
      { status: 400 },
    );
  }
  const checkoutInput = {
    lines,
    email: body.email,
    firstName: body.firstName,
    lastName: body.lastName ?? "",
    address1: body.address1,
    city: body.city,
    postalCode: body.postalCode,
    promoCode:
      typeof body.promoCode === "string"
        ? body.promoCode.trim().slice(0, 40) || undefined
        : undefined,
    channel: body.channel === "b2b" ? ("b2b" as const) : ("b2c" as const),
  };
  if (!token) {
    if (checkoutInput.channel !== "b2c" || lines.some((line) => line.channel !== "b2c")) {
      return NextResponse.json(
        { error: "Sign in to place a trade order. Guest checkout is for Shop orders only." },
        { status: 403 },
      );
    }
    const mobile = typeof body.mobile === "string" ? body.mobile.trim() : "";
    if (!mobile) {
      return NextResponse.json(
        { error: "A mobile number is required for guest checkout." },
        { status: 400 },
      );
    }
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
    if (!/^[A-Za-z0-9._:-]{16,100}$/.test(idempotencyKey)) {
      return NextResponse.json(
        { error: "A valid checkout idempotency key is required." },
        { status: 400 },
      );
    }
    try {
      const result = await completeGuestCheckout(
        {
          ...checkoutInput,
          mobile,
        },
        idempotencyKey,
      );
      return NextResponse.json(result);
    } catch (error) {
      return checkoutError(error);
    }
  }
  try {
    const result = await completeCheckout(checkoutInput, token);
    return NextResponse.json(result);
  } catch (error) {
    return checkoutError(error);
  }
}
