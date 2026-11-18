import { NextResponse } from "next/server";
import { ExperienceApiError, requestMagicLink } from "@/lib/experience-api";

function upstreamStatus(error: unknown): number {
  if (!(error instanceof ExperienceApiError)) return 502;
  return error.status >= 400 && error.status < 500 ? error.status : 503;
}

export async function POST(request: Request) {
  let email: string;
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!email || !email.includes("@") || email.length > 320) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const result = await requestMagicLink(email);
    const response = NextResponse.json({
      ok: true,
      expires_in_seconds: result.expires_in_seconds,
      test_data: true,
      ...(result.preview_link ? { preview_link: result.preview_link } : {}),
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send the sign-in link." },
      { status: upstreamStatus(error) },
    );
  }
}
