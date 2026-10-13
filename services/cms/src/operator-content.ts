import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Core } from "@strapi/strapi";
import type { Context } from "koa";

type ContentFieldType =
  | "string"
  | "text"
  | "richtext"
  | "enum"
  | "datetime"
  | "integer"
  | "json";

interface ContentField {
  name: string;
  label: string;
  type: ContentFieldType;
  required?: boolean;
  options?: string[];
  description?: string;
}

interface ContentKindDefinition {
  kind: string;
  uid: string;
  label: string;
  description: string;
  keyField: string;
  titleField: string;
  fields: ContentField[];
}

type JsonRecord = Record<string, unknown>;

type DocumentService = {
  findMany(params: JsonRecord): Promise<JsonRecord[]>;
  findOne(params: JsonRecord): Promise<JsonRecord | null>;
  create(params: JsonRecord): Promise<JsonRecord>;
  update(params: JsonRecord): Promise<JsonRecord>;
  publish(params: JsonRecord): Promise<unknown>;
  unpublish(params: JsonRecord): Promise<unknown>;
};

const CONTENT_KINDS: ContentKindDefinition[] = [
  {
    kind: "storefront-layout",
    uid: "api::storefront-layout.storefront-layout",
    label: "Storefront layouts",
    description: "Ordered B2C and B2B home composition. Product and offer membership stays reference-only.",
    keyField: "layoutKey",
    titleField: "layoutKey",
    fields: [
      { name: "layoutKey", label: "Layout key", type: "string", required: true },
      { name: "channel", label: "Channel", type: "enum", required: true, options: ["b2c", "b2b"] },
      {
        name: "modules",
        label: "Ordered modules",
        type: "json",
        required: true,
        description: "JSON array of governed layout components. Use stable moduleKey values and commerce references only.",
      },
      { name: "startsAt", label: "Starts at", type: "datetime" },
      { name: "endsAt", label: "Ends at", type: "datetime" },
    ],
  },
  {
    kind: "banner",
    uid: "api::banner.banner",
    label: "Banners",
    description: "Editorial campaign copy, placement, action, schedule and audience.",
    keyField: "contentKey",
    titleField: "title",
    fields: [
      { name: "contentKey", label: "Content key", type: "string", required: true },
      { name: "audience", label: "Audience", type: "enum", required: true, options: ["b2c", "b2b", "both"] },
      { name: "placement", label: "Placement", type: "string", required: true },
      { name: "title", label: "Title", type: "string", required: true },
      { name: "subtitle", label: "Subtitle", type: "text" },
      { name: "ctaLabel", label: "Action label", type: "string" },
      {
        name: "ctaTargetType",
        label: "Action target type",
        type: "enum",
        options: ["route", "product", "category", "collection", "url"],
      },
      { name: "ctaTargetId", label: "Action target", type: "string" },
      { name: "imageAltText", label: "Image alternative text", type: "string", required: true },
      { name: "startsAt", label: "Starts at", type: "datetime" },
      { name: "endsAt", label: "Ends at", type: "datetime" },
      { name: "timezone", label: "Timezone", type: "string" },
      { name: "priority", label: "Priority", type: "integer" },
      { name: "segments", label: "Segments", type: "json" },
    ],
  },
  {
    kind: "curated-collection",
    uid: "api::curated-collection.curated-collection",
    label: "Curated collections",
    description: "Editorial product references; commerce resolves live product data and ranking.",
    keyField: "collectionKey",
    titleField: "title",
    fields: [
      { name: "collectionKey", label: "Collection key", type: "string", required: true },
      { name: "audience", label: "Audience", type: "enum", required: true, options: ["b2c", "b2b", "both"] },
      { name: "title", label: "Title", type: "string", required: true },
      { name: "tag", label: "Tag", type: "string" },
      { name: "placement", label: "Placement", type: "string" },
      {
        name: "productIds",
        label: "Commerce product references",
        type: "json",
        description: "JSON array of stable commerce product ids. Never enter price, stock or seller data.",
      },
      { name: "selectionRule", label: "Selection rule", type: "text" },
      { name: "startsAt", label: "Starts at", type: "datetime" },
      { name: "endsAt", label: "Ends at", type: "datetime" },
      {
        name: "fallbackBehavior",
        label: "Fallback behavior",
        type: "enum",
        options: ["omit-unavailable", "hide-collection", "use-fallback-collection"],
      },
    ],
  },
  {
    kind: "category-editorial",
    uid: "api::category-editorial.category-editorial",
    label: "Category editorial",
    description: "Localized category headings, guidance and ordered promotional banners.",
    keyField: "categoryId",
    titleField: "heading",
    fields: [
      { name: "categoryId", label: "Commerce category id", type: "string", required: true },
      { name: "heading", label: "Heading", type: "string", required: true },
      { name: "description", label: "Description", type: "text" },
      { name: "heroAltText", label: "Hero alternative text", type: "string" },
      { name: "inspirationBlocks", label: "Inspiration content", type: "richtext" },
      {
        name: "banners",
        label: "Category banners",
        type: "json",
        description: "JSON array of layout.category-banner components, ordered by priority.",
      },
    ],
  },
  {
    kind: "product-editorial",
    uid: "api::product-editorial.product-editorial",
    label: "Product editorial",
    description: "Editorial enrichment attached to a stable commerce product id.",
    keyField: "medusaId",
    titleField: "subtitle",
    fields: [
      { name: "medusaId", label: "Commerce product id", type: "string", required: true },
      { name: "subtitle", label: "Subtitle", type: "string" },
      { name: "descriptionBlocks", label: "Description", type: "richtext" },
      { name: "buyingGuidance", label: "Buying guidance", type: "richtext" },
      { name: "careAndSafety", label: "Care and safety", type: "richtext" },
      { name: "seoTitle", label: "SEO title", type: "string" },
      { name: "seoDescription", label: "SEO description", type: "text" },
    ],
  },
  {
    kind: "faq-article",
    uid: "api::faq-article.faq-article",
    label: "Help and articles",
    description: "FAQ, help, policy, onboarding and inspiration content.",
    keyField: "articleKey",
    titleField: "title",
    fields: [
      { name: "articleKey", label: "Article key", type: "string", required: true },
      {
        name: "contentKind",
        label: "Content kind",
        type: "enum",
        required: true,
        options: ["faq", "help", "legal", "onboarding", "inspiration"],
      },
      { name: "audience", label: "Audience", type: "enum", required: true, options: ["b2c", "b2b", "both"] },
      { name: "title", label: "Title", type: "string", required: true },
      { name: "body", label: "Body", type: "richtext" },
      { name: "effectiveVersion", label: "Effective version", type: "string" },
      { name: "effectiveAt", label: "Effective at", type: "datetime" },
    ],
  },
];

const CONTENT_KIND_MAP = new Map(CONTENT_KINDS.map((definition) => [definition.kind, definition]));
const FORBIDDEN_KEYS = new Set([
  "price",
  "prices",
  "pricing",
  "stock",
  "inventory",
  "seller",
  "sellers",
  "order",
  "orders",
  "payment",
  "payments",
  "credit",
  "commission",
  "commissions",
  "payout",
  "payouts",
]);

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function secureEqual(expected: string, supplied: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authenticate(ctx: Context): { actorId: string; correlationId: string } {
  const expected = process.env.CMS_OPERATOR_SECRET?.trim();
  const authorization = ctx.get("authorization");
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!expected || !supplied || !secureEqual(expected, supplied)) {
    ctx.throw(401, "Invalid CMS operator credentials.");
  }
  const actorId = ctx.get("x-cms-operator-id").trim();
  const correlationId = ctx.get("x-correlation-id").trim();
  if (!actorId || !correlationId) ctx.throw(400, "Operator and correlation headers are required.");
  return { actorId, correlationId };
}

function definitionFor(ctx: Context): ContentKindDefinition {
  const kind = String(ctx.params.kind ?? "");
  const definition = CONTENT_KIND_MAP.get(kind);
  if (!definition) ctx.throw(404, "Unknown CMS content kind.");
  return definition!;
}

function documents(strapi: Core.Strapi, definition: ContentKindDefinition): DocumentService {
  return strapi.documents(definition.uid as never) as unknown as DocumentService;
}

function assertNoCommerceFields(value: unknown, path = "data"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCommerceFields(item, `${path}[${index}]`));
    return;
  }
  const object = record(value);
  if (!object) return;
  for (const [key, nested] of Object.entries(object)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`Commerce-owned field '${path}.${key}' is not allowed in CMS content.`);
    }
    assertNoCommerceFields(nested, `${path}.${key}`);
  }
}

function sanitizeData(definition: ContentKindDefinition, value: unknown): JsonRecord {
  const input = record(value);
  if (!input) throw new Error("data must be an object.");
  const allowed = new Set(definition.fields.map((field) => field.name));
  const output: JsonRecord = {};
  for (const [key, fieldValue] of Object.entries(input)) {
    if (!allowed.has(key)) throw new Error(`Field '${key}' is not editable for ${definition.kind}.`);
    output[key] = fieldValue;
  }
  assertNoCommerceFields(output);
  return output;
}

function projectDocument(definition: ContentKindDefinition, value: JsonRecord): JsonRecord {
  const projected: JsonRecord = {
    documentId: value.documentId,
    locale: value.locale,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    publishedAt: value.publishedAt,
  };
  for (const field of definition.fields) projected[field.name] = value[field.name];
  return projected;
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

export async function ensureCmsOperatorAudit(strapi: Core.Strapi): Promise<void> {
  const schema = strapi.db.connection.schema;
  if (await schema.hasTable("cms_operator_audit")) return;
  await schema.createTable("cms_operator_audit", (table) => {
    table.text("id").primary();
    table.text("actor_id").notNullable();
    table.text("correlation_id").notNullable();
    table.text("action").notNullable();
    table.text("content_kind").notNullable();
    table.text("document_id").nullable();
    table.text("locale").notNullable();
    table.text("payload_sha256").notNullable();
    table.text("status").notNullable();
    table.text("error_code").nullable();
    table.timestamp("occurred_at", { useTz: true }).notNullable().defaultTo(strapi.db.connection.fn.now());
  });
}

async function mutateWithAudit(
  strapi: Core.Strapi,
  input: {
    actorId: string;
    correlationId: string;
    action: string;
    kind: string;
    documentId?: string;
    locale: string;
    payload: unknown;
  },
  mutation: () => Promise<unknown>,
): Promise<unknown> {
  const id = randomUUID();
  await strapi.db.connection("cms_operator_audit").insert({
    id,
    actor_id: input.actorId,
    correlation_id: input.correlationId,
    action: input.action,
    content_kind: input.kind,
    document_id: input.documentId ?? null,
    locale: input.locale,
    payload_sha256: payloadHash(input.payload),
    status: "started",
    error_code: null,
  });
  try {
    const result = await mutation();
    await strapi.db.connection("cms_operator_audit").where({ id }).update({ status: "succeeded" });
    return result;
  } catch (error) {
    await strapi.db.connection("cms_operator_audit").where({ id }).update({
      status: "failed",
      error_code: (error as Error).name || "Error",
    });
    throw error;
  }
}

async function listHandler(strapi: Core.Strapi, ctx: Context): Promise<void> {
  authenticate(ctx);
  const definition = definitionFor(ctx);
  const locale = stringValue(ctx.query.locale) ?? "en-IN";
  const service = documents(strapi, definition);
  const [drafts, published] = await Promise.all([
    service.findMany({ status: "draft", locale, populate: "*", sort: ["updatedAt:desc"], limit: 100 }),
    service.findMany({ status: "published", locale, fields: ["documentId", "updatedAt"], limit: 100 }),
  ]);
  const publishedById = new Map(published.map((item) => [String(item.documentId), item]));
  ctx.body = {
    kind: definition.kind,
    locale,
    definition,
    documents: drafts.map((draft) => {
      const live = publishedById.get(String(draft.documentId));
      const modified = live && Date.parse(String(draft.updatedAt)) > Date.parse(String(live.updatedAt));
      return {
        ...projectDocument(definition, draft),
        publicationStatus: live ? (modified ? "modified" : "published") : "draft",
      };
    }),
  };
}

async function mutationHandler(strapi: Core.Strapi, ctx: Context): Promise<void> {
  const identity = authenticate(ctx);
  const definition = definitionFor(ctx);
  const body = record(ctx.request.body);
  if (!body) ctx.throw(400, "Expected a JSON body.");
  const operation = stringValue(body!.operation);
  const documentId = stringValue(body!.documentId);
  const locale = stringValue(body!.locale) ?? "en-IN";
  const service = documents(strapi, definition);
  if (!operation || !["create-draft", "update-draft", "publish", "unpublish"].includes(operation)) {
    ctx.throw(400, "Unsupported CMS operation.");
  }
  if (operation !== "create-draft" && !documentId) ctx.throw(400, "documentId is required.");

  let data: JsonRecord | undefined;
  if (operation === "create-draft" || operation === "update-draft") {
    try {
      data = sanitizeData(definition, body!.data);
    } catch (error) {
      ctx.throw(400, (error as Error).message);
    }
  }

  const result = await mutateWithAudit(
    strapi,
    {
      ...identity,
      action: operation,
      kind: definition.kind,
      documentId,
      locale,
      payload: data ?? {},
    },
    async () => {
      if (operation === "create-draft") return service.create({ locale, status: "draft", data });
      if (operation === "update-draft") {
        return service.update({ documentId, locale, status: "draft", data });
      }
      if (operation === "publish") return service.publish({ documentId, locale });
      return service.unpublish({ documentId, locale });
    },
  );

  const refreshed = documentId
    ? await service.findOne({ documentId, locale, status: "draft", populate: "*" })
    : record(result);
  ctx.status = operation === "create-draft" ? 201 : 200;
  ctx.body = {
    kind: definition.kind,
    operation,
    document: refreshed ? projectDocument(definition, refreshed) : null,
  };
}

export function registerCmsOperatorRoutes(strapi: Core.Strapi): void {
  strapi.server.routes([
    {
      method: "GET",
      path: "/api/operator-content/:kind",
      handler: (ctx: Context) => listHandler(strapi, ctx),
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/api/operator-content/:kind",
      handler: (ctx: Context) => mutationHandler(strapi, ctx),
      config: { auth: false },
    },
  ]);
}
