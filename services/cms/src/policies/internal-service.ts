import { timingSafeEqual } from "node:crypto";

function equalSecret(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export default (policyContext: any): boolean => {
  const expected = process.env.CMS_INTERNAL_KEY?.trim();
  const supplied = String(policyContext.request.headers["x-buildkart-cms-key"] ?? "").trim();
  return Boolean(expected && supplied && equalSecret(expected, supplied));
};
