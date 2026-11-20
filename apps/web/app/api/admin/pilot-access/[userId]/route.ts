import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  updatePilotAccess,
} from "@/lib/experience-api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in as a super-admin." }, { status: 401 });
  }
  const { userId } = await params;
  let body: { roles?: unknown; businessAccountId?: unknown; sellerId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.roles) || body.roles.length === 0) {
    return NextResponse.json({ error: "Select at least one role." }, { status: 400 });
  }
  try {
    const result = await updatePilotAccess(token, userId, {
      roles: body.roles.map((role) => String(role)),
      businessAccountId:
        typeof body.businessAccountId === "string" ? body.businessAccountId : undefined,
      sellerId: typeof body.sellerId === "string" ? body.sellerId : undefined,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
