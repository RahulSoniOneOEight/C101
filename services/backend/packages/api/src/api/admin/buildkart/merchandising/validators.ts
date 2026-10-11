import { z } from "zod";

const CommandBase = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotency_key: z.string().uuid(),
});

export const AdminCmsContentCommand = CommandBase.extend({
  data: z.record(z.unknown()),
});

export const AdminCmsPublicationCommand = CommandBase;

export type AdminCmsContentCommandType = z.infer<typeof AdminCmsContentCommand>;
export type AdminCmsPublicationCommandType = z.infer<typeof AdminCmsPublicationCommand>;
