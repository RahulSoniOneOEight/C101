export interface GuestCheckoutInput {
  lines: Array<{ offerId: string; quantity: number }>;
  email: string;
  mobile: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  postalCode: string;
  promoCode?: string;
}

export type GuestCheckoutParse =
  | { ok: true; value: GuestCheckoutInput }
  | { ok: false; error: string };

export type GuestQuoteParse =
  | {
      ok: true;
      value: {
        lines: Array<{ offerId: string; quantity: number }>;
        postalCode: string;
        promoCode?: string;
      };
    }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts common Indian formats and stores one canonical E.164 value. */
export function normalizeIndianMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

function parseLines(
  rawLines: unknown,
): { ok: true; lines: Array<{ offerId: string; quantity: number }> } | { ok: false; error: string } {
  const lines = (Array.isArray(rawLines) ? rawLines : [])
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const entry = line as { offerId?: unknown; quantity?: unknown };
      const offerId = typeof entry.offerId === "string" ? entry.offerId.trim() : "";
      const quantity = Number(entry.quantity);
      if (!offerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return null;
      }
      return { offerId, quantity };
    })
    .filter((line): line is { offerId: string; quantity: number } => line !== null);
  if (lines.length === 0) return { ok: false, error: "The cart is empty." };
  if (lines.length > 30) return { ok: false, error: "This cart has too many lines." };
  if (new Set(lines.map((line) => line.offerId)).size !== lines.length) {
    return { ok: false, error: "The cart has duplicate offers." };
  }
  return { ok: true, lines };
}

export function parseGuestQuoteBody(body: unknown): GuestQuoteParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON quote body." };
  }
  const candidate = body as Record<string, unknown>;
  if (candidate.channel !== undefined && candidate.channel !== "b2c") {
    return { ok: false, error: "Guest checkout is available for Shop orders only." };
  }
  const parsedLines = parseLines(candidate.lines);
  if (!parsedLines.ok) return parsedLines;
  const postalCode =
    typeof candidate.postalCode === "string"
      ? candidate.postalCode.replace(/\D/g, "").slice(0, 6)
      : "";
  if (!/^\d{6}$/.test(postalCode)) {
    return { ok: false, error: "A six-digit postal code is required." };
  }
  const promoCode =
    typeof candidate.promoCode === "string"
      ? candidate.promoCode.trim().slice(0, 40) || undefined
      : undefined;
  return { ok: true, value: { lines: parsedLines.lines, postalCode, promoCode } };
}

export function parseGuestCheckoutBody(body: unknown): GuestCheckoutParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON checkout body." };
  }
  const candidate = body as Record<string, unknown>;
  const parsedLines = parseLines(candidate.lines);
  if (!parsedLines.ok) return parsedLines;
  const lines = parsedLines.lines;

  const email = typeof candidate.email === "string" ? candidate.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, error: "A valid email address is required." };
  }
  const mobile = normalizeIndianMobile(
    typeof candidate.mobile === "string" ? candidate.mobile : "",
  );
  if (!mobile) {
    return { ok: false, error: "A valid 10-digit Indian mobile number is required." };
  }
  const firstName =
    typeof candidate.firstName === "string" ? candidate.firstName.trim().slice(0, 80) : "";
  const lastName =
    typeof candidate.lastName === "string" ? candidate.lastName.trim().slice(0, 80) : "";
  const address1 =
    typeof candidate.address1 === "string" ? candidate.address1.trim().slice(0, 240) : "";
  const city = typeof candidate.city === "string" ? candidate.city.trim().slice(0, 120) : "";
  const postalCode =
    typeof candidate.postalCode === "string"
      ? candidate.postalCode.replace(/\D/g, "").slice(0, 6)
      : "";
  if (!firstName || !lastName || !address1 || !city || !/^\d{6}$/.test(postalCode)) {
    return {
      ok: false,
      error: "Name, address, city and a six-digit postal code are required.",
    };
  }
  if (candidate.channel !== undefined && candidate.channel !== "b2c") {
    return { ok: false, error: "Guest checkout is available for Shop orders only." };
  }
  const promoCode =
    typeof candidate.promoCode === "string"
      ? candidate.promoCode.trim().slice(0, 40) || undefined
      : undefined;
  return {
    ok: true,
    value: {
      lines,
      email,
      mobile,
      firstName,
      lastName,
      address1,
      city,
      postalCode,
      promoCode,
    },
  };
}
