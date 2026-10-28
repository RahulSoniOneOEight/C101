import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_CHALLENGE_COOKIE,
  PILOT_SESSION_COOKIE,
  verifyOtpChallenge,
} from "@/lib/experience-api";

const secureCookie = process.env.NODE_ENV === "production";

function clearChallenge(response: NextResponse): void {
  response.cookies.set(PILOT_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie,
    path: "/",
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  let code: string;
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(code)) {
    return NextResponse.json({ error: "Enter the simulated OTP code." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const challengeId = cookieStore.get(PILOT_CHALLENGE_COOKIE)?.value;
  if (!challengeId) {
    return NextResponse.json(
      { error: "The OTP challenge is missing or expired. Request a new code." },
      { status: 400 },
    );
  }

  try {
    const verified = await verifyOtpChallenge(challengeId, code);
    if (!verified.session_token) throw new Error("The identity service returned no session.");
    const maxAge = Math.max(60, Math.min(verified.expires_in_seconds, 30 * 24 * 60 * 60));
    const response = NextResponse.json({
      ok: true,
      user: verified.user,
      test_data: true,
    });
    response.headers.set("cache-control", "no-store");
    response.cookies.set(PILOT_SESSION_COOKIE, verified.session_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge,
    });
    clearChallenge(response);
    return response;
  } catch (error) {
    const status = error instanceof ExperienceApiError && error.status < 500
      ? error.status
      : 503;
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify the OTP." },
      { status },
    );
    // Challenges are single-use in the identity store, including failed attempts.
    clearChallenge(response);
    return response;
  }
}
