const AUDIT_UID = "api::operation-audit.operation-audit";
declare const strapi: any;

const contentTypes = {
  banners: "api::banner.banner",
  campaigns: "api::campaign.campaign",
  "curated-collections": "api::curated-collection.curated-collection",
  "storefront-layouts": "api::storefront-layout.storefront-layout",
} as const;

type ContentTypeName = keyof typeof contentTypes;

function contentUid(type: string): string | undefined {
  return contentTypes[type as ContentTypeName];
}

function textHeader(ctx: any, name: string): string {
  return String(ctx.request.headers[name] ?? "").trim();
}

function commandInput(ctx: any): {
  commandId: string;
  correlationId: string;
  actorId: string;
  reason: string;
} {
  const commandId = textHeader(ctx, "idempotency-key") || String(ctx.request.body?.idempotency_key ?? "").trim();
  const correlationId = textHeader(ctx, "x-correlation-id") || commandId;
  const actorId = textHeader(ctx, "x-buildkart-actor-id");
  const reason = String(ctx.request.body?.reason ?? "").trim();
  if (!commandId || !correlationId || !actorId || reason.length < 3) {
    ctx.throw(400, "idempotency-key, actor identity and an operator reason are required");
  }
  return { commandId, correlationId, actorId, reason };
}

function documentData(ctx: any): Record<string, unknown> {
  const data = ctx.request.body?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    ctx.throw(400, "data must be an object");
  }
  return data as Record<string, unknown>;
}

async function priorAudit(strapi: any, commandId: string): Promise<any | undefined> {
  const items = await strapi.documents(AUDIT_UID).findMany({
    filters: { commandId: { $eq: commandId } },
    limit: 1,
  });
  return items[0];
}

async function appendAudit(
  strapi: any,
  input: ReturnType<typeof commandInput> & {
    action: string;
    entityType: string;
    entityId?: string;
    beforeState?: unknown;
    afterState?: unknown;
  },
): Promise<void> {
  await strapi.documents(AUDIT_UID).create({
    data: {
      commandId: input.commandId,
      correlationId: input.correlationId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      outcome: "succeeded",
      testData: true,
    },
  });
}

async function replay(ctx: any, strapi: any, commandId: string): Promise<boolean> {
  const previous = await priorAudit(strapi, commandId);
  if (!previous) return false;
  ctx.body = {
    data: previous.afterState ?? null,
    meta: { idempotentReplay: true, commandId },
  };
  return true;
}

export default {
  async health(ctx: any) {
    ctx.body = {
      status: "ok",
      service: "buildkart-cms",
      environment: process.env.BUILDKART_ENVIRONMENT ?? "development",
      test_data: true,
    };
  },

  async list(ctx: any) {
    const uid = contentUid(ctx.params.type);
    if (!uid) ctx.throw(404, "unsupported merchandising content type");
    const status = ctx.query.status === "published" ? "published" : "draft";
    const filters = ctx.query.audience ? { audience: { $eq: String(ctx.query.audience) } } : undefined;
    const data = await strapi.documents(uid!).findMany({
      status,
      filters,
      sort: ["updatedAt:desc"],
      limit: Math.min(Number(ctx.query.limit ?? 50), 100),
      populate: "*",
    });
    ctx.body = { data, meta: { status, count: data.length, test_data: true } };
  },

  async create(ctx: any) {
    const uid = contentUid(ctx.params.type);
    if (!uid) ctx.throw(404, "unsupported merchandising content type");
    const command = commandInput(ctx);
    if (await replay(ctx, strapi, command.commandId)) return;
    const data = documentData(ctx);
    const created = await strapi.documents(uid!).create({ data, status: "draft" });
    try {
      await appendAudit(strapi, {
        ...command,
        action: "create",
        entityType: ctx.params.type,
        entityId: created.documentId,
        afterState: created,
      });
    } catch (error) {
      await strapi.documents(uid!).delete({ documentId: created.documentId }).catch(() => undefined);
      throw error;
    }
    ctx.status = 201;
    ctx.body = { data: created, meta: { commandId: command.commandId, test_data: true } };
  },

  async update(ctx: any) {
    const uid = contentUid(ctx.params.type);
    if (!uid) ctx.throw(404, "unsupported merchandising content type");
    const command = commandInput(ctx);
    if (await replay(ctx, strapi, command.commandId)) return;
    const requestedData = documentData(ctx);
    const before = await strapi.documents(uid!).findOne({ documentId: ctx.params.documentId, status: "draft" });
    if (!before) ctx.throw(404, "content item not found");
    const data = {
      ...requestedData,
      ...(ctx.params.type === "banners" ? { version: Number(before.version ?? 1) + 1 } : {}),
    };
    const updated = await strapi.documents(uid!).update({ documentId: ctx.params.documentId, data, status: "draft" });
    try {
      await appendAudit(strapi, {
        ...command,
        action: "update",
        entityType: ctx.params.type,
        entityId: ctx.params.documentId,
        beforeState: before,
        afterState: updated,
      });
    } catch (error) {
      const restore = Object.fromEntries(Object.keys(data).map((key) => [key, before[key]]));
      await strapi.documents(uid!).update({ documentId: ctx.params.documentId, data: restore, status: "draft" }).catch(() => undefined);
      throw error;
    }
    ctx.body = { data: updated, meta: { commandId: command.commandId, test_data: true } };
  },

  async publish(ctx: any) {
    const uid = contentUid(ctx.params.type);
    if (!uid) ctx.throw(404, "unsupported merchandising content type");
    const command = commandInput(ctx);
    if (await replay(ctx, strapi, command.commandId)) return;
    const before = await strapi.documents(uid!).findOne({ documentId: ctx.params.documentId, status: "draft" });
    if (!before) ctx.throw(404, "content item not found");
    const published = await strapi.documents(uid!).publish({ documentId: ctx.params.documentId });
    try {
      await appendAudit(strapi, {
        ...command,
        action: "publish",
        entityType: ctx.params.type,
        entityId: ctx.params.documentId,
        beforeState: before,
        afterState: published,
      });
    } catch (error) {
      await strapi.documents(uid!).unpublish({ documentId: ctx.params.documentId }).catch(() => undefined);
      throw error;
    }
    ctx.body = { data: published, meta: { commandId: command.commandId, test_data: true } };
  },

  async unpublish(ctx: any) {
    const uid = contentUid(ctx.params.type);
    if (!uid) ctx.throw(404, "unsupported merchandising content type");
    const command = commandInput(ctx);
    if (await replay(ctx, strapi, command.commandId)) return;
    const before = await strapi.documents(uid!).findOne({ documentId: ctx.params.documentId, status: "published" });
    if (!before) ctx.throw(404, "published content item not found");
    const unpublished = await strapi.documents(uid!).unpublish({ documentId: ctx.params.documentId });
    try {
      await appendAudit(strapi, {
        ...command,
        action: "unpublish",
        entityType: ctx.params.type,
        entityId: ctx.params.documentId,
        beforeState: before,
        afterState: unpublished,
      });
    } catch (error) {
      await strapi.documents(uid!).publish({ documentId: ctx.params.documentId }).catch(() => undefined);
      throw error;
    }
    ctx.body = { data: unpublished, meta: { commandId: command.commandId, test_data: true } };
  },

  async audit(ctx: any) {
    const limit = Math.min(Number(ctx.query.limit ?? 100), 200);
    const data = await strapi.documents(AUDIT_UID).findMany({ sort: ["createdAt:desc"], limit });
    ctx.body = { data, meta: { count: data.length, test_data: true } };
  },
};
