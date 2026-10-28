import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PILOT_SESSION_COOKIE, revokePilotSession } from "@/lib/experience-api";

const secureCookie = process.env.NODE_ENV === "production";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PILOT_SESSION_COOKIE)?.value;
  if (token) {
    try {
      await revokePilotSession(token);
    } catch {
      // Always remove the browser credential; the bounded server session expires independently.
    }
  }
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("cache-control", "no-store");
  response.cookies.set(PILOT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 0,
  });
  return response;
}
