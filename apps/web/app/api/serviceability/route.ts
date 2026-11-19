import { NextResponse } from "next/server";
import { ExperienceApiError, checkServiceability } from "@/lib/experience-api";

const POSTCODE = /^\d{6}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const postcode = (url.searchParams.get("postcode") ?? "").trim();
  if (!POSTCODE.test(postcode)) {
    return NextResponse.json({ error: "Enter a six-digit pincode." }, { status: 400 });
  }
  try {
    const result = await checkServiceability(postcode);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ExperienceApiError && [400, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Delivery could not be checked right now." },
      { status: 502 },
    );
  }
}
