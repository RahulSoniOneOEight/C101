import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  placeCodCheckout,
  type CheckoutLineInput,
} from "@/lib/experience-api";

function errorResponse(error: unknown) {
  if (error instanceof ExperienceApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: (error as Error).message }, { status: 502 });
}

function linesFrom(value: unknown): CheckoutLineInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const candidate = line as { offerId?: unknown; quantity?: unknown; channel?: unknown };
      const offerId = typeof candidate.offerId === "string" ? candidate.offerId.trim() : "";
      const quantity = Number(candidate.quantity);
      if (!offerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return null;
      }
      return {
        offerId,
        quantity,
        channel: candidate.channel === "b2b" ? ("b2b" as const) : ("b2c" as const),
      };
    })
    .filter((line): line is CheckoutLineInput => line !== null);
}

/** Server-side COD placement. The order is confirmed with cash due, never marked paid. */
export async function POST(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  try {
    const lines = linesFrom(body.lines);
    if (lines.length === 0) {
      return NextResponse.json({ error: "The cart is empty." }, { status: 400 });
    }
    const channel = body.channel === "b2b" ? "b2b" : "b2c";
    if (lines.some((line) => line.channel !== channel)) {
      return NextResponse.json(
        { error: "The cart channel does not match its items." },
        { status: 400 },
      );
    }
    if (!token && channel === "b2b") {
      return NextResponse.json({ error: "Sign in to place a trade order." }, { status: 403 });
    }
    const result = await placeCodCheckout(
      {
        lines,
        email: typeof body.email === "string" ? body.email : "",
        mobile: typeof body.mobile === "string" ? body.mobile : undefined,
        firstName: typeof body.firstName === "string" ? body.firstName : "",
        lastName: typeof body.lastName === "string" ? body.lastName : "",
        address1: typeof body.address1 === "string" ? body.address1 : "",
        city: typeof body.city === "string" ? body.city : "",
        postalCode: typeof body.postalCode === "string" ? body.postalCode : "",
        promoCode: typeof body.promoCode === "string" ? body.promoCode : undefined,
        channel,
      },
      token,
      request.headers.get("idempotency-key") ?? undefined,
    );
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
