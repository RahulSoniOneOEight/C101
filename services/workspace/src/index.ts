import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

type Role =
  | "b2b_buyer"
  | "b2b_account_admin"
  | "b2b_approver"
  | "super_admin"
  | "customer"
  | "seller_admin"
  | "seller_catalog_manager"
  | "seller_order_manager"
  | "support_operator"
  | "marketplace_operator"
  | "erp_operator"
  | "finance_operator";

type Actor = {
  userId: string;
  name: string;
  roles: Role[];
  businessAccountId?: string;
  sellerId?: string;
  iat: number;
  correlationId: string;
};

type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  correlation_id: string;
};

const PORT = Number.parseInt(process.env.PORT ?? "9040", 10);
const DATABASE_URL = process.env.WORKSPACE_DATABASE_URL;
const SERVICE_SECRET = process.env.WORKSPACE_SERVICE_SECRET;

if (!DATABASE_URL) throw new Error("WORKSPACE_DATABASE_URL is required.");
if (!SERVICE_SECRET || SERVICE_SECRET.length < 24) {
  throw new Error("WORKSPACE_SERVICE_SECRET must be at least 24 characters.");
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const ALLOWED_ROLES = new Set<Role>([
  "b2b_buyer",
  "b2b_account_admin",
  "b2b_approver",
  "super_admin",
]);
const WRITE_ROLES = new Set<Role>([
  "b2b_buyer",
  "b2b_account_admin",
  "b2b_approver",
  "super_admin",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function problem(
  status: number,
  code: string,
  detail: string,
  correlationId: string,
): Response {
  const body: Problem = {
    type: "about:blank",
    title: code,
    status,
    detail,
    code,
    correlation_id: correlationId,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}

function parseActor(req: Request): Actor | Response {
  const encoded = req.headers.get("x-workspace-actor");
  const signature = req.headers.get("x-workspace-signature");
  if (!encoded || !signature) {
    return problem(401, "workspace-context-required", "Signed actor context is required.", "unknown");
  }
  let actor: Actor;
  try {
    actor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Actor;
  } catch {
    return problem(401, "invalid-workspace-context", "Actor context is invalid.", "unknown");
  }
  const expected = createHmac("sha256", SERVICE_SECRET as string).update(encoded).digest();
  const provided = Buffer.from(signature, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return problem(401, "invalid-workspace-signature", "Actor signature is invalid.", actor.correlationId ?? "unknown");
  }
  if (!actor.userId || !actor.name || !Array.isArray(actor.roles) || !actor.businessAccountId) {
    return problem(401, "incomplete-workspace-context", "Actor context is incomplete.", actor.correlationId ?? "unknown");
  }
  if (!Number.isInteger(actor.iat) || Math.abs(Date.now() / 1000 - actor.iat) > 120) {
    return problem(401, "expired-workspace-context", "Actor context has expired.", actor.correlationId);
  }
  if (!actor.roles.some((role) => ALLOWED_ROLES.has(role))) {
    return problem(403, "workspace-role-required", "A business-account role is required.", actor.correlationId);
  }
  return actor;
}

async function ensureSchema(): Promise<void> {
  const sql = await Bun.file(new URL("./schema.sql", import.meta.url)).text();
  await pool.query(sql);
  console.log("[workspace] schema ready");
}

type WorkspaceRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  owner_user_id: string;
  name: string;
  status: string;
  created_at: Date;
  role?: string;
  unread_count?: number;
};

async function workspaceForMember(
  workspaceId: string,
  actor: Actor,
): Promise<WorkspaceRow | null> {
  const result = await pool.query<WorkspaceRow>(
    `select w.id, w.scope_type, w.scope_id, w.owner_user_id, w.name, w.status, w.created_at, wm.role
       from workspace w
       join workspace_member wm on wm.workspace_id = w.id
      where w.id = $1 and w.scope_id = $2 and w.status = 'active'
        and wm.user_id = $3 and wm.status = 'active'`,
    [workspaceId, actor.businessAccountId, actor.userId],
  );
  return result.rows[0] ?? null;
}

type ChannelRow = {
  id: string;
  workspace_id: string;
  kind: string;
  name: string;
  status: string;
  created_at: Date;
  role?: string;
  unread_count?: number;
};

async function channelForMember(
  channelId: string,
  actor: Actor,
): Promise<ChannelRow | null> {
  const result = await pool.query<ChannelRow>(
    `select c.id, c.workspace_id, c.kind, c.name, c.status, c.created_at, wm.role
       from channel c
       join workspace w on w.id = c.workspace_id
       join workspace_member wm on wm.workspace_id = w.id
      where c.id = $1 and c.status = 'active'
        and w.scope_id = $2 and w.status = 'active'
        and wm.user_id = $3 and wm.status = 'active'`,
    [channelId, actor.businessAccountId, actor.userId],
  );
  return result.rows[0] ?? null;
}

function canWrite(actor: Actor): boolean {
  return actor.roles.some((role) => WRITE_ROLES.has(role));
}

async function listWorkspaces(actor: Actor): Promise<Response> {
  const result = await pool.query(
    `select w.id, w.scope_type, w.scope_id, w.name, w.status, w.created_at, wm.role,
            coalesce((
              select count(*) from message m
                join channel c on c.id = m.channel_id
               where c.workspace_id = w.id and m.actor_id <> $2 and m.deleted_at is null
                 and m.sequence > coalesce((
                   select rc.last_event_sequence from read_cursor rc
                    where rc.channel_id = c.id and rc.user_id = $2
                 ), 0)
            ), 0)::int as unread_count
       from workspace w
       join workspace_member wm on wm.workspace_id = w.id
      where wm.user_id = $2 and wm.status = 'active' and w.status = 'active'
        and w.scope_id = $1
      order by w.created_at asc`,
    [actor.businessAccountId, actor.userId],
  );
  return json({
    workspaces: result.rows,
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function createWorkspace(req: Request, actor: Actor): Promise<Response> {
  if (!actor.roles.some((role) => role === "b2b_account_admin" || role === "super_admin")) {
    return problem(403, "workspace-admin-required", "Only a business-account admin can create a workspace.", actor.correlationId);
  }
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const name = body.name?.trim();
  if (!name || name.length > 120) {
    return problem(400, "invalid-workspace-name", "A workspace name of 1-120 characters is required.", actor.correlationId);
  }
  const existing = await pool.query(
    "select id from workspace where scope_type = 'business_account' and scope_id = $1",
    [actor.businessAccountId],
  );
  if (existing.rows[0]) {
    return problem(409, "workspace-exists", "This business account already has a workspace.", actor.correlationId);
  }
  const workspaceId = `ws_${randomUUID().replaceAll("-", "")}`;
  const procurementId = `ch_${randomUUID().replaceAll("-", "")}`;
  const approvalsId = `ch_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into workspace (id, scope_type, scope_id, owner_user_id, name)
       values ($1, 'business_account', $2, $3, $4)`,
      [workspaceId, actor.businessAccountId, actor.userId, name],
    );
    await client.query(
      `insert into workspace_member (workspace_id, user_id, role)
       values ($1, $2, 'admin')`,
      [workspaceId, actor.userId],
    );
    await client.query(
      `insert into channel (id, workspace_id, kind, name)
       values ($1, $2, 'procurement', 'Procurement'), ($3, $2, 'approvals', 'Approvals')`,
      [procurementId, workspaceId, approvalsId],
    );
    await client.query(
      `insert into activity_event (id, workspace_id, kind, entity_ref, actor_id, payload_summary)
       values ($1, $2, 'workspace.created', $3, $4, $5)`,
      [
        `act_${randomUUID().replaceAll("-", "")}`,
        workspaceId,
        JSON.stringify({ type: "workspace", id: workspaceId }),
        actor.userId,
        JSON.stringify({ message: "Workspace created" }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const created = await workspaceForMember(workspaceId, actor);
  return json({ workspace: created }, 201);
}

async function listChannels(workspaceId: string, actor: Actor): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) {
    return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  }
  const result = await pool.query(
    `select c.id, c.workspace_id, c.kind, c.name, c.status, c.created_at,
            coalesce((
              select count(*) from message m
               where m.channel_id = c.id and m.actor_id <> $3 and m.deleted_at is null
                 and m.sequence > coalesce((
                   select rc.last_event_sequence from read_cursor rc
                    where rc.channel_id = c.id and rc.user_id = $3
                 ), 0)
            ), 0)::int as unread_count
       from channel c
      where c.workspace_id = $1 and c.status = 'active' and $2 = true
      order by case c.kind when 'procurement' then 0 else 1 end, c.created_at asc`,
    [workspaceId, true, actor.userId],
  );
  return json({
    channels: result.rows,
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function getWorkspace(workspaceId: string, actor: Actor): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) {
    return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  }
  return json({
    workspace,
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function listMessages(
  channelId: string,
  actor: Actor,
  url: URL,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) {
    return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  }
  const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
  if (!Number.isInteger(cursor) || cursor < 0) {
    return problem(400, "invalid-cursor", "Cursor must be a non-negative integer.", actor.correlationId);
  }
  const result = await pool.query(
    `select id, workspace_id, channel_id, actor_id, actor_name, body, message_type,
            sequence, created_at, edited_at
       from message
      where channel_id = $1 and sequence > $2 and deleted_at is null
      order by sequence asc
      limit 50`,
    [channelId, cursor],
  );
  const nextCursor = result.rows.length ? result.rows[result.rows.length - 1].sequence : cursor;
  return json({
    messages: result.rows,
    next_cursor: String(nextCursor),
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function postMessage(
  req: Request,
  channelId: string,
  actor: Actor,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) {
    return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  }
  if (!canWrite(actor)) {
    return problem(403, "message-write-forbidden", "This role cannot post messages.", actor.correlationId);
  }
  let body: { body?: string; message_type?: string };
  try {
    body = (await req.json()) as { body?: string; message_type?: string };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const text = body.body?.trim();
  if (!text || text.length > 4000) {
    return problem(400, "invalid-message", "Message body must be 1-4000 characters.", actor.correlationId);
  }
  const type = body.message_type === "mention" ? "mention" : "text";
  const messageId = `msg_${randomUUID().replaceAll("-", "")}`;
  const activityId = `act_${randomUUID().replaceAll("-", "")}`;
  const outboxId = `out_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  let row: Record<string, unknown>;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `insert into message (id, workspace_id, channel_id, actor_id, actor_name, body, message_type)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, workspace_id, channel_id, actor_id, actor_name, body, message_type, sequence, created_at`,
      [messageId, channel.workspace_id, channelId, actor.userId, actor.name, text, type],
    );
    row = inserted.rows[0];
    await client.query(
      `insert into activity_event (id, workspace_id, kind, entity_ref, actor_id, payload_summary)
       values ($1, $2, 'message.created', $3, $4, $5)`,
      [
        activityId,
        channel.workspace_id,
        JSON.stringify({ type: "message", id: messageId, channel_id: channelId }),
        actor.userId,
        JSON.stringify({ message_type: type }),
      ],
    );
    await client.query(
      `insert into workspace_outbox
         (id, event_type, aggregate_type, aggregate_id, correlation_id, payload)
       values ($1, 'workspace.message.created', 'workspace_message', $2, $3, $4)`,
      [
        outboxId,
        messageId,
        actor.correlationId,
        JSON.stringify({
          workspace_id: channel.workspace_id,
          channel_id: channelId,
          message_id: messageId,
          actor_id: actor.userId,
          message_type: type,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return json(
    {
      message: row,
      environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
      test_data: true,
      correlation_id: actor.correlationId,
    },
    201,
  );
}

async function setReadCursor(
  req: Request,
  channelId: string,
  actor: Actor,
): Promise<Response> {
  const channel = await channelForMember(channelId, actor);
  if (!channel) {
    return problem(404, "channel-not-found", "Channel not found.", actor.correlationId);
  }
  let body: { last_event_sequence?: number };
  try {
    body = (await req.json()) as { last_event_sequence?: number };
  } catch {
    return problem(400, "invalid-request-body", "Expected a JSON body.", actor.correlationId);
  }
  const seq = body.last_event_sequence;
  if (!Number.isInteger(seq) || (seq as number) < 0) {
    return problem(400, "invalid-cursor", "last_event_sequence must be a non-negative integer.", actor.correlationId);
  }
  await pool.query(
    `insert into read_cursor (channel_id, user_id, last_event_sequence, updated_at)
     values ($1, $2, $3, now())
     on conflict (channel_id, user_id)
     do update set last_event_sequence = greatest(read_cursor.last_event_sequence, excluded.last_event_sequence),
                   updated_at = now()`,
    [channelId, actor.userId, seq],
  );
  return new Response(null, { status: 204 });
}

async function listActivity(
  workspaceId: string,
  actor: Actor,
  url: URL,
): Promise<Response> {
  const workspace = await workspaceForMember(workspaceId, actor);
  if (!workspace) {
    return problem(404, "workspace-not-found", "Workspace not found.", actor.correlationId);
  }
  const cursor = Number.parseInt(url.searchParams.get("cursor") ?? "0", 10);
  if (!Number.isInteger(cursor) || cursor < 0) {
    return problem(400, "invalid-cursor", "Cursor must be a non-negative integer.", actor.correlationId);
  }
  const result = await pool.query(
    `select id, workspace_id, draft_id, kind, entity_ref, actor_id,
            resulting_version, payload_summary, sequence, occurred_at
       from activity_event
      where workspace_id = $1 and sequence > $2
      order by sequence asc
      limit 50`,
    [workspaceId, cursor],
  );
  const nextCursor = result.rows.length ? result.rows[result.rows.length - 1].sequence : cursor;
  return json({
    events: result.rows,
    next_cursor: String(nextCursor),
    environment: process.env.BUILDKART_ENVIRONMENT ?? "staging",
    test_data: true,
    correlation_id: actor.correlationId,
  });
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === "/health") return json({ status: "ok", service: "workspace" });
  if (path === "/ready") {
    await pool.query("select 1");
    return json({ status: "ready", service: "workspace" });
  }

  const actorOrResponse = parseActor(req);
  if (actorOrResponse instanceof Response) return actorOrResponse;
  const actor = actorOrResponse;

  if (path === "/v1/workspaces" && req.method === "GET") {
    return listWorkspaces(actor);
  }
  if (path === "/v1/workspaces" && req.method === "POST") {
    return createWorkspace(req, actor);
  }

  const workspaceMatch = path.match(/^\/v1\/workspaces\/([^/]+)$/);
  if (workspaceMatch && req.method === "GET") {
    return getWorkspace(workspaceMatch[1], actor);
  }
  const channelsMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/channels$/);
  if (channelsMatch && req.method === "GET") {
    return listChannels(channelsMatch[1], actor);
  }
  const activityMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/activity$/);
  if (activityMatch && req.method === "GET") {
    return listActivity(activityMatch[1], actor, url);
  }
  const streamMatch = path.match(/^\/v1\/workspaces\/([^/]+)\/stream$/);
  if (streamMatch && req.method === "GET") {
    return problem(501, "stream-not-enabled", "The WebSocket feed is not enabled in this kernel slice.", actor.correlationId);
  }

  const messagesMatch = path.match(/^\/v1\/channels\/([^/]+)\/messages$/);
  if (messagesMatch && req.method === "GET") {
    return listMessages(messagesMatch[1], actor, url);
  }
  if (messagesMatch && req.method === "POST") {
    return postMessage(req, messagesMatch[1], actor);
  }
  const cursorMatch = path.match(/^\/v1\/channels\/([^/]+)\/read-cursor$/);
  if (cursorMatch && req.method === "POST") {
    return setReadCursor(req, cursorMatch[1], actor);
  }

  return problem(404, "not-found", "No workspace route matched.", actor.correlationId);
}

await ensureSchema();

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    try {
      return await route(req);
    } catch (error) {
      console.error("[workspace] request failed:", (error as Error).message);
      return problem(500, "workspace-error", "The workspace request failed.", "unknown");
    }
  },
});

console.log(`[workspace] listening on ${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await pool.end();
    server.stop();
    process.exit(0);
  });
}
