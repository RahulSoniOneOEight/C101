import { z } from "zod";

export const ManualShipmentStatus = z.object({
  status: z.enum([
    "ready_for_pickup",
    "picked_up",
    "in_transit",
    "delayed",
    "out_for_delivery",
    "delivery_attempted",
    "delivery_failed",
    "buyer_action_required",
    "partially_delivered",
    "delivered",
    "damaged",
    "lost",
    "returning_to_seller",
    "returned_to_seller",
    "rto_in_transit",
    "rto_delivered",
    "cancelled",
  ]),
  expected_version: z.number().int().positive(),
  operation_key: z.string().trim().min(8).max(200),
  occurred_at: z.string().datetime().optional(),
  reason: z.string().trim().max(1000).optional(),
  note: z.string().trim().max(2000).optional(),
  attempt_number: z.number().int().positive().optional(),
  attempt_reason: z.string().trim().max(1000).optional(),
  next_action: z.string().trim().max(1000).optional(),
  revised_delivery_at: z.string().datetime().optional(),
  notify_customer: z.boolean().optional(),
  proof_ref: z.string().trim().max(2000).optional(),
  delivered_lines: z
    .array(
      z.object({
        line_key: z.string().trim().min(1),
        delivered_qty: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

export type ManualShipmentStatusType = z.infer<typeof ManualShipmentStatus>;
