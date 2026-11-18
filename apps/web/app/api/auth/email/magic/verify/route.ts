import { NextResponse } from "next/server";
import {
  EMAIL_HINT_COOKIE,
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  verifyMagicLink,
} from "@/lib/experience-api";

const secureCookie = process.env.NODE_ENV === "production";

export async function POST(request: Request) {
  let token: string;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!token || token.length > 512) {
    return NextResponse.json({ error: "This sign-in link is invalid." }, { status: 400 });
  }

  try {
    const verified = await verifyMagicLink(token);
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
    return response;
  } catch (error) {
    const status = error instanceof ExperienceApiError && error.status < 500
      ? error.status
      : 503;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to use this sign-in link." },
      { status },
    );
  }
}
