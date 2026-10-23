import { z } from "zod";

export const ManualReturnStatus = z.object({
  status: z.enum([
    "under_review",
    "pickup_scheduled",
    "pickup_attempted",
    "in_return_transit",
    "received",
    "inspection_pending",
    "inspection_complete",
    "closed",
    "cancelled",
  ]),
  expected_version: z.number().int().positive(),
  operation_key: z.string().trim().min(8).max(200),
  note: z.string().trim().min(1).max(2000),
});

export type ManualReturnStatusType = z.infer<typeof ManualReturnStatus>;
