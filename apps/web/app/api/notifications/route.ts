import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/experience-api";

export async function GET(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
  }
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  try {
    const items = await listMyNotifications(token, Number.isFinite(limit) ? limit : 50);
    return NextResponse.json(
      {
        items,
        unread: items.filter((item) => !item.read_at).length,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
  }
  let body: { id?: unknown } = {};
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    // An empty body means "mark all read".
  }
  try {
    if (typeof body.id === "string" && body.id.trim()) {
      await markNotificationRead(token, body.id.trim());
    } else {
      await markAllNotificationsRead(token);
    }
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
