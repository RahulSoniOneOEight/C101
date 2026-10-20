/**
 * Workspace Phase 1 smoke test. Run inside the private network:
 *   docker exec buildkart-hosted-pilot-workspace-1 bun run src/scripts/smoke.ts
 *
 * It signs the same actor context the Experience API would send and checks two
 * business accounts cannot see each other.
 */
import { createHmac } from "node:crypto";

const BASE = process.env.WORKSPACE_SERVICE_URL ?? "http://localhost:9040";
const SECRET = process.env.WORKSPACE_SERVICE_SECRET;
if (!SECRET) throw new Error("WORKSPACE_SERVICE_SECRET is required.");

type Actor = {
  userId: string;
  name: string;
  roles: string[];
  businessAccountId: string;
  iat: number;
  correlationId: string;
};

function headers(actor: Actor): Record<string, string> {
  const encoded = Buffer.from(JSON.stringify(actor)).toString("base64url");
  return {
    "x-workspace-actor": encoded,
    "x-workspace-signature": createHmac("sha256", SECRET as string)
      .update(encoded)
      .digest("hex"),
    "content-type": "application/json",
  };
}

async function call(
  actor: Actor,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(actor),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

const arjun: Actor = {
  userId: "pilot_buyer_b2b01",
  name: "Arjun Traders Buyer",
  roles: ["b2b_buyer"],
  businessAccountId: "business_arjun_traders",
  iat: Math.floor(Date.now() / 1000),
  correlationId: "workspace-smoke-arjun",
};
const shakti: Actor = {
  userId: "pilot_buyer_b2b02",
  name: "Shakti Hardware Buyer",
  roles: ["b2b_buyer"],
  businessAccountId: "business_shakti_hardware",
  iat: Math.floor(Date.now() / 1000),
  correlationId: "workspace-smoke-shakti",
};

const arjunWorkspaces = await call(arjun, "GET", "/v1/workspaces");
const arjunWorkspaceId = (arjunWorkspaces.body.workspaces as Array<{ id: string }>)[0]?.id;
if (!arjunWorkspaceId) throw new Error("Arjun workspace missing.");
const channels = await call(arjun, "GET", `/v1/workspaces/${arjunWorkspaceId}/channels`);
const channelId = (channels.body.channels as Array<{ id: string }>)[0]?.id;
if (!channelId) throw new Error("Arjun channel missing.");

const posted = await call(arjun, "POST", `/v1/channels/${channelId}/messages`, {
  body: `Workspace smoke ${Date.now()}`,
  message_type: "text",
});
const shaktiWorkspaces = await call(shakti, "GET", "/v1/workspaces");
const crossTenant = await call(shakti, "GET", `/v1/channels/${channelId}/messages`);

const shaktiWorkspaceId = (shaktiWorkspaces.body.workspaces as Array<{ id: string }>)[0]?.id;
const result = {
  arjun_workspace: arjunWorkspaceId,
  arjun_channels: (channels.body.channels as Array<{ kind: string }>).map((c) => c.kind),
  post_status: posted.status,
  shakti_workspace: shaktiWorkspaceId ?? null,
  cross_tenant_status: crossTenant.status,
};
console.log(JSON.stringify(result, null, 2));

const failures = [
  arjunWorkspaces.status !== 200,
  channels.status !== 200,
  posted.status !== 201,
  shaktiWorkspaces.status !== 200,
  shaktiWorkspaceId !== "ws_shakti_procurement",
  crossTenant.status !== 404,
];
if (failures.some(Boolean)) {
  console.error("WORKSPACE_SMOKE_FAILED");
  process.exit(1);
}
console.log("WORKSPACE_SMOKE_PASS");
