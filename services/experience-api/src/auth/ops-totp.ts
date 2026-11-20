import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) primitives for the ops staff second factor.
 *
 * Six digits, 30-second period, SHA-1 — the interoperable default every authenticator app supports.
 * The caller must persist the last accepted step so a code cannot be replayed.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW_STEPS = 1;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(value: string): Buffer {
  const clean = value
    .trim()
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[\s-]/g, "");
  if (!clean) throw new Error("TOTP secret is empty.");
  if (/[^A-Z2-7]/.test(clean)) throw new Error("TOTP secret is not valid base32.");
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function totpStepAt(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpAt(secret: string, step: number): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export type TotpFailureReason = "format" | "mismatch" | "replay";

export type TotpVerification =
  | { valid: true; step: number }
  | { valid: false; reason: TotpFailureReason };

function equalCodes(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify a six-digit code in the current 30-second window plus one step of clock drift.
 * A step at or below `lastStep` is refused so a captured code cannot be reused.
 */
export function verifyTotp(
  secret: string,
  code: string,
  lastStep: number | null,
  nowMs = Date.now(),
): TotpVerification {
  const normalized = code.replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalized)) {
    return { valid: false, reason: "format" };
  }
  const current = totpStepAt(nowMs);
  let matchedPastStep = false;
  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset += 1) {
    const step = current + offset;
    if (step < 0) continue;
    if (!equalCodes(totpAt(secret, step), normalized)) continue;
    if (lastStep !== null && step <= lastStep) {
      matchedPastStep = true;
      continue;
    }
    return { valid: true, step };
  }
  return { valid: false, reason: matchedPastStep ? "replay" : "mismatch" };
}

export function otpauthUri(secret: string, email: string, issuer = "BazarBee"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
