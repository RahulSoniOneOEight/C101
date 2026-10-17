import { z } from "zod";
import { CMS_CONTENT_KINDS } from "../../../../integrations/cms-operator-client";

export const CmsContentKind = z.enum(CMS_CONTENT_KINDS);

export const AdminGetCmsContent = z.object({
  kind: CmsContentKind,
  locale: z.enum(["en-IN", "hi-IN"]).default("en-IN"),
});

export type AdminGetCmsContentType = z.infer<typeof AdminGetCmsContent>;

export const AdminMutateCmsContent = z.object({
  kind: CmsContentKind,
  operation: z.enum(["create-draft", "update-draft", "duplicate-draft", "publish", "unpublish"]),
  documentId: z.string().min(1).optional(),
  locale: z.enum(["en-IN", "hi-IN"]).default("en-IN"),
  data: z.record(z.unknown()).optional(),
  expectedUpdatedAt: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.operation !== "create-draft" && !value.documentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["documentId"], message: "documentId is required." });
  }
  if ((value.operation === "create-draft" || value.operation === "update-draft") && !value.data) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message: "data is required." });
  }
});

export type AdminMutateCmsContentType = z.infer<typeof AdminMutateCmsContent>;

/**
 * Draft preview request. The operator sends the unsaved form values so the preview reflects what is
 * on screen. The handler allowlists them against the live CMS definition before forwarding, and only
 * the banner kind is supported by the delivery mapper today.
 */
export const AdminPreviewCmsContent = z.object({
  kind: CmsContentKind,
  locale: z.enum(["en-IN", "hi-IN"]).default("en-IN"),
  data: z.record(z.unknown()),
});

export type AdminPreviewCmsContentType = z.infer<typeof AdminPreviewCmsContent>;
