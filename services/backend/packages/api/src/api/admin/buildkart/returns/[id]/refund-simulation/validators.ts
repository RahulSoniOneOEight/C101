import { z } from "zod";

const RefundSimulationBreakdown = z.object({
  item_subtotal_minor: z.number().int().min(0),
  tax_minor: z.number().int().min(0),
  shipping_minor: z.number().int().min(0),
  restocking_fee_minor: z.number().int().min(0),
  return_freight_minor: z.number().int().min(0),
}).strict();

export const RecordRefundSimulation = z.object({
  expected_version: z.number().int().positive(),
  operation_key: z.string().trim().min(8).max(200),
  amount_minor: z.number().int().positive(),
  currency_code: z.literal("INR"),
  method: z.enum([
    "original_method_simulation",
    "cod_bank_transfer_simulation",
  ]),
  breakdown: RefundSimulationBreakdown,
}).strict().superRefine((value, context) => {
  const calculated =
    value.breakdown.item_subtotal_minor +
    value.breakdown.tax_minor +
    value.breakdown.shipping_minor -
    value.breakdown.restocking_fee_minor -
    value.breakdown.return_freight_minor;
  if (calculated !== value.amount_minor) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount_minor"],
      message: "The amount must equal additions minus deductions in the breakdown.",
    });
  }
});

export type RecordRefundSimulationType = z.infer<typeof RecordRefundSimulation>;
