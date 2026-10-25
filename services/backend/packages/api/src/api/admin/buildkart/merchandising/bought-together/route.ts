import { randomUUID } from "node:crypto";
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { experienceAdminFetch } from "../../../../../lib/experience-admin";
import { hasPermission, permissionDenied } from "../../../../../lib/rbac";

function correlation(req: AuthenticatedMedusaRequest): string {
  const incoming = req.headers["x-correlation-id"];
  return typeof incoming === "string" && incoming.trim()
    ? incoming.trim()
    : randomUUID();
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "merchandising.read")) {
    res.status(403).json({ message: permissionDenied("merchandising.read") } as never);
    return;
  }
  const params = new URLSearchParams();
  for (const key of ["status", "channel", "limit", "offset"]) {
    const value = req.query[key];
    if (typeof value === "string" && value.trim()) params.set(key, value);
  }
  const result = await experienceAdminFetch(
    "/v1/admin/merchandising/bought-together",
    {
      actorId: req.auth_context?.actor_id,
      correlationId: correlation(req),
      query: params.toString(),
    },
  );
  res.status(result.status).json(result.body as never);
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  if (!hasPermission(req, "merchandising.update")) {
    res.status(403).json({ message: permissionDenied("merchandising.update") } as never);
    return;
  }
  const result = await experienceAdminFetch(
    "/v1/admin/merchandising/bought-together",
    {
      method: "POST",
      actorId: req.auth_context?.actor_id,
      correlationId: correlation(req),
      body: req.body,
    },
  );
  res.status(result.status).json(result.body as never);
}
