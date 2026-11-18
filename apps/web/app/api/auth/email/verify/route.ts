import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  EMAIL_CHALLENGE_COOKIE,
  EMAIL_HINT_COOKIE,
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  verifyEmailCode,
} from "@/lib/experience-api";

const secureCookie = process.env.NODE_ENV === "production";

function clearChallenge(response: NextResponse): void {
  response.cookies.set(EMAIL_CHALLENGE_COOKIE, "", {
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
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the six-digit code from the email." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const challengeId = cookieStore.get(EMAIL_CHALLENGE_COOKIE)?.value;
  if (!challengeId) {
    return NextResponse.json(
      { error: "The email code expired. Request a new one." },
      { status: 400 },
    );
  }

  try {
    const verified = await verifyEmailCode(challengeId, code);
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
    response.cookies.set(EMAIL_HINT_COOKIE, verified.user.email, {
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
      { error: error instanceof Error ? error.message : "Unable to verify the email code." },
      { status },
    );
    clearChallenge(response);
    return response;
  }
}
