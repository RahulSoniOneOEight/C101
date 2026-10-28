import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_CHALLENGE_COOKIE,
  requestOtpChallenge,
} from "@/lib/experience-api";

const secureCookie = process.env.NODE_ENV === "production";

function upstreamStatus(error: unknown): number {
  if (!(error instanceof ExperienceApiError)) return 502;
  return error.status >= 400 && error.status < 500 ? error.status : 503;
}

export async function POST(request: Request) {
  let identifier: string;
  try {
    const body = (await request.json()) as { identifier?: unknown };
    identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!identifier || identifier.length > 320) {
    return NextResponse.json(
      { error: "Enter an allowlisted pilot email or phone." },
      { status: 400 },
    );
  }

  try {
    const challenge = await requestOtpChallenge(identifier);
    const maxAge = Math.max(30, Math.min(challenge.expires_in_seconds, 15 * 60));
    const response = NextResponse.json({
      ok: true,
      expires_in_seconds: maxAge,
      test_data: true,
    });
    response.headers.set("cache-control", "no-store");
    response.cookies.set(PILOT_CHALLENGE_COOKIE, challenge.challenge_id, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      path: "/",
      maxAge,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to issue the OTP challenge." },
      { status: upstreamStatus(error) },
    );
  }
}
