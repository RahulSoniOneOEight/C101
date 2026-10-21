import { MedusaError } from "@medusajs/framework/utils";

/**
 * Thin admin-console proxy to the Experience API, which owns shipments and returns.
 *
 * The Mercur admin session proves the operator; the staging service secret is only a
 * service-to-service credential. The Experience API still authenticates and audits the call.
 */
export function experienceAdminConfig(): { baseUrl: string; secret: string } {
  const environment = process.env.BUILDKART_ENVIRONMENT ?? "development";
  if (environment === "production") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found");
  }
  const baseUrl = process.env.EXPERIENCE_API_URL?.trim().replace(/\/$/, "") ??
    (environment === "development" || environment === "integration"
      ? "http://localhost:9020"
      : undefined);
  if (!baseUrl) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "EXPERIENCE_API_URL is required for the admin proxy in staging.",
    );
  }
  // Staging uses the same dummy service secret as the Experience API. Production never reaches
  // this branch and must supply the real secret through the environment.
  const secret =
    process.env.EXPERIENCE_ADMIN_SERVICE_SECRET?.trim() ||
    "buildkart-staging-dummy-admin-service-secret";
  if (secret.length < 24) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Experience API admin proxy is not configured.",
    );
  }
  return { baseUrl, secret };
}

export async function experienceAdminFetch(
  path: string,
  options: {
    method?: "GET" | "POST";
    actorId?: string | null;
    sellerId?: string | null;
    query?: string;
    body?: unknown;
  } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { baseUrl, secret } = experienceAdminConfig();
  const response = await fetch(`${baseUrl}${path}${options.query ? `?${options.query}` : ""}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-buildkart-admin-service-secret": secret,
      "x-operator-user-id": options.actorId ?? "admin_console",
      ...(options.sellerId ? { "x-buildkart-seller-id": options.sellerId } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = { message: "Experience API returned a non-JSON response." };
  }
  return { status: response.status, body };
}
