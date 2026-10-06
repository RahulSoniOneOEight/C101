import { NextResponse } from "next/server";
import { completeCheckout } from "@/lib/experience-api";

/**
 * Server-side checkout. The browser cannot manufacture a canonical order: this route calls the
 * shared Experience API and returns only what the server produced.
 */
export async function POST(request: Request) {
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
    const result = await completeCheckout({
      offerId: body.offerId,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      address1: body.address1,
      city: body.city,
      postalCode: body.postalCode,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
