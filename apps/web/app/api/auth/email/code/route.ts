import { NextResponse } from "next/server";
import {
  EMAIL_CHALLENGE_COOKIE,
  ExperienceApiError,
  requestEmailCode,
} from "@/lib/experience-api";

const secureCookie = process.env.NODE_ENV === "production";

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
    const challenge = await requestEmailCode(email);
    const maxAge = Math.max(30, Math.min(challenge.expires_in_seconds, 15 * 60));
    const response = NextResponse.json({
      ok: true,
      expires_in_seconds: maxAge,
      test_data: true,
      ...(challenge.preview_code ? { preview_code: challenge.preview_code } : {}),
    });
    response.headers.set("cache-control", "no-store");
    response.cookies.set(EMAIL_CHALLENGE_COOKIE, challenge.challenge_id, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      path: "/",
      maxAge,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send the sign-in code." },
      { status: upstreamStatus(error) },
    );
  }
}
