import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  grantAllPilotAccess,
} from "@/lib/experience-api";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in as a super-admin." }, { status: 401 });
  }
  try {
    const result = await grantAllPilotAccess(token);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
