import { createHmac, timingSafeEqual } from "node:crypto";

/** Evidence URLs are short-lived and signed; the object key never appears in the URL. */
export const EVIDENCE_URL_TTL_SECONDS = 10 * 60;

export function signEvidence(
  secret: string,
  evidenceId: string,
  expiresAt: number,
): string {
  return createHmac("sha256", secret).update(`${evidenceId}.${expiresAt}`).digest("hex");
}

export function verifyEvidenceSignature(
  secret: string,
  evidenceId: string,
  expiresAt: number,
  signature: string,
): boolean {
  if (!Number.isInteger(expiresAt)) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signEvidence(secret, evidenceId, expiresAt), "hex");
  const provided = Buffer.from(signature, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

export function evidenceUrl(
  baseUrl: string,
  secret: string,
  evidenceId: string,
  now = Date.now(),
): string {
  const expiresAt = Math.floor(now / 1000) + EVIDENCE_URL_TTL_SECONDS;
  const signature = signEvidence(secret, evidenceId, expiresAt);
  return `${baseUrl.replace(/\/$/, "")}/v1/evidence/${encodeURIComponent(evidenceId)}?exp=${expiresAt}&sig=${signature}`;
}
