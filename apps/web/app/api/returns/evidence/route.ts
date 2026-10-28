import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ExperienceApiError,
  PILOT_SESSION_COOKIE,
  uploadReturnEvidence,
} from "@/lib/experience-api";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Server-side evidence upload. The browser never sees the Experience API origin or the session
 * token; the API still re-checks ownership, content type and size.
 */
export async function POST(request: Request) {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Sign in to attach evidence." }, { status: 401 });
  }
  const orderId = new URL(request.url).searchParams.get("orderId")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.json({ error: "An order reference is required." }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Attach an image file." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Evidence must be a JPEG, PNG or WebP image." },
      { status: 415 },
    );
  }
  if (file.size < 1 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Evidence must be 5 MB or smaller." }, { status: 413 });
  }

  try {
    const stored = await uploadReturnEvidence(
      token,
      orderId,
      file,
      (file as File).name || "evidence",
    );
    return NextResponse.json(
      { ok: true, evidence: stored, test_data: true },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExperienceApiError) {
      if (error.status === 401 || error.status === 403) {
        return NextResponse.json(
          { error: "Your session cannot attach evidence to this order." },
          { status: 401 },
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: error.status < 500 ? error.status : 502 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The upload failed." },
      { status: 502 },
    );
  }
}
