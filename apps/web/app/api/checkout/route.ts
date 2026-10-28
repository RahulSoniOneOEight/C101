import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  completeCheckout,
} from "@/lib/experience-api";

/**
 * Server-side checkout. The browser cannot manufacture a canonical order: this route calls the
 * shared Experience API with the signed-in customer's session and returns only what the server
 * produced. Anonymous checkout is intentionally unsupported because the cart API is owner-scoped.
 */
export async function POST(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to place an order." }, { status: 401 });
  }

  let body: Record<string, string>;
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.offerId || !body.email || !body.postalCode) {
    return NextResponse.json({ error: "offerId, email and postalCode are required" }, { status: 400 });
  }
  try {
    const result = await completeCheckout(
      {
        offerId: body.offerId,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        address1: body.address1,
        city: body.city,
        postalCode: body.postalCode,
      },
      token,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExperienceApiError && error.status === 401) {
      return NextResponse.json(
        { error: "Your session cannot place this order. Sign in again." },
        { status: 401 },
      );
    }
    if (error instanceof ExperienceApiError && [400, 404, 409].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
