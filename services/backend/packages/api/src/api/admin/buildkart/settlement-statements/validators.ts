import { z } from "zod";

export const AdminGetSettlementStatementsParams = z.object({
  seller_id: z.string().optional(),
  status: z.enum(["calculated", "reviewed", "held"]).optional(),
});

export type AdminGetSettlementStatementsParamsType = z.infer<
  typeof AdminGetSettlementStatementsParams
>;
