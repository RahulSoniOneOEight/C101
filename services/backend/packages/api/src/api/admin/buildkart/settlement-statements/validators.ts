import { z } from "zod";

export const AdminGetSettlementStatementsParams = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM")
    .optional(),
  seller_id: z.string().min(1).optional(),
});

export type AdminGetSettlementStatementsParamsType = z.infer<
  typeof AdminGetSettlementStatementsParams
>;
