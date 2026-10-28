import { z } from "zod";

const InspectionLine = z.object({
  line_key: z.string().trim().min(1).max(200),
  received_qty: z.number().int().min(0),
  condition: z.enum(["sellable", "damaged", "incomplete", "wrong_item"]),
  disposition: z.enum(["restock", "repair", "quarantine", "dispose"]),
  note: z.string().trim().min(1).max(2000),
}).strict();

export const ReturnInspection = z.object({
  expected_version: z.number().int().positive(),
  lines: z.array(InspectionLine).min(1).max(100),
  note: z.string().trim().max(2000).optional(),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.lines.forEach((line, index) => {
    if (seen.has(line.line_key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines", index, "line_key"],
        message: "Each approved return line can appear only once.",
      });
    }
    seen.add(line.line_key);
  });
});

export type ReturnInspectionType = z.infer<typeof ReturnInspection>;
