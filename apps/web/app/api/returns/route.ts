import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  createMyReturn,
} from "@/lib/experience-api";

/**
 * Owner-scoped return request. The browser never supplies eligibility, quantities or the owner
 * identity: the session cookie identifies the customer and the Experience API re-computes
 * eligibility, allowed reasons and returnable quantities before accepting the request.
 */
export async function POST(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to start a return." }, { status: 401 });
  }

  let body: {
    orderId?: unknown;
    idempotencyKey?: unknown;
    resolution?: unknown;
    reasonCode?: unknown;
    comment?: unknown;
    lines?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";
  const resolution = body.resolution === "replacement" ? "replacement" : "refund";
  const comment = typeof body.comment === "string" ? body.comment : undefined;
  const rawLines = Array.isArray(body.lines) ? body.lines : [];

  if (!orderId) {
    return NextResponse.json({ error: "An order reference is required." }, { status: 400 });
  }
  if (idempotencyKey.length < 8) {
    return NextResponse.json({ error: "A return request needs an idempotency key." }, { status: 400 });
  }
  if (!reasonCode) {
    return NextResponse.json({ error: "Choose a return reason." }, { status: 400 });
  }

  const lines = rawLines
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const value = line as { lineKey?: unknown; requestedQty?: unknown };
      const lineKey = typeof value.lineKey === "string" ? value.lineKey.trim() : "";
      const requestedQty = Number(value.requestedQty);
      if (!lineKey || !Number.isInteger(requestedQty) || requestedQty < 1) return null;
      return { lineKey, requestedQty, reasonCode };
    })
    .filter((line): line is { lineKey: string; requestedQty: number; reasonCode: string } =>
      Boolean(line),
    );

  if (lines.length === 0) {
    return NextResponse.json({ error: "Select at least one item to return." }, { status: 400 });
  }

  try {
    const returnCase = await createMyReturn(token, orderId, {
      idempotencyKey,
      resolution,
      reasonCode,
      comment,
      lines,
    });
    return NextResponse.json(
      { ok: true, return: returnCase, test_data: true },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      if (error.status === 401 || error.status === 403) {
        return NextResponse.json(
          { error: "Your session cannot create a return for this order." },
          { status: 401 },
        );
      }
      const status = error.status < 500 ? error.status : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The return request failed." },
      { status: 502 },
    );
  }
}
