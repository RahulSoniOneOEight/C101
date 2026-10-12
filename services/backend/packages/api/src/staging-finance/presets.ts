export type StagingStatementStatus = "calculated" | "reviewed" | "held";

export interface CommissionPolicyPreset {
  name: string;
  code: string;
  percentage: number;
  categoryName?: string;
  isDefault: boolean;
  includeTax: false;
  includeShipping: false;
}

export const COMMISSION_POLICY_PRESETS: CommissionPolicyPreset[] = [
  {
    name: "BuildKart Staging Global",
    code: "default",
    percentage: 10,
    isDefault: true,
    includeTax: false,
    includeShipping: false,
  },
  {
    name: "Building Materials Staging",
    code: "buildkart-staging-building-materials",
    percentage: 8,
    categoryName: "Building Materials",
    isDefault: false,
    includeTax: false,
    includeShipping: false,
  },
  {
    name: "Power Tools Staging",
    code: "buildkart-staging-power-tools",
    percentage: 12,
    categoryName: "Power Tools",
    isDefault: false,
    includeTax: false,
    includeShipping: false,
  },
];

export interface StatementLineSeed {
  orderReference: string;
  categoryName: string;
  grossAmountMinor: number;
  refundAmountMinor: number;
  commissionRatePercent: number;
  commissionAmountMinor: number;
  adjustmentAmountMinor: number;
  payableAmountMinor: number;
}

export interface SettlementStatementSeed {
  statementNumber: string;
  sellerName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  status: StagingStatementStatus;
  currencyCode: "inr";
  lines: StatementLineSeed[];
}

export const SETTLEMENT_STATEMENT_SEEDS: SettlementStatementSeed[] = [
  {
    statementNumber: "BK-STG-SET-001",
    sellerName: "BuildMaster Supplies",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-30T23:59:59.999Z",
    generatedAt: "2026-10-01T06:00:00.000Z",
    status: "reviewed",
    currencyCode: "inr",
    lines: [
      {
        orderReference: "BK-STG-ORDER-1001",
        categoryName: "Building Materials",
        grossAmountMinor: 5_000_000,
        refundAmountMinor: 0,
        commissionRatePercent: 8,
        commissionAmountMinor: 400_000,
        adjustmentAmountMinor: 0,
        payableAmountMinor: 4_600_000,
      },
      {
        orderReference: "BK-STG-ORDER-1002",
        categoryName: "Power Tools",
        grossAmountMinor: 2_000_000,
        refundAmountMinor: 0,
        commissionRatePercent: 12,
        commissionAmountMinor: 240_000,
        adjustmentAmountMinor: 0,
        payableAmountMinor: 1_760_000,
      },
    ],
  },
  {
    statementNumber: "BK-STG-SET-002",
    sellerName: "PowerMax Depot",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-30T23:59:59.999Z",
    generatedAt: "2026-10-01T06:05:00.000Z",
    status: "calculated",
    currencyCode: "inr",
    lines: [
      {
        orderReference: "BK-STG-ORDER-2001",
        categoryName: "Safety Gear",
        grossAmountMinor: 4_800_000,
        refundAmountMinor: 0,
        commissionRatePercent: 10,
        commissionAmountMinor: 480_000,
        adjustmentAmountMinor: 0,
        payableAmountMinor: 4_320_000,
      },
    ],
  },
  {
    statementNumber: "BK-STG-SET-003",
    sellerName: "AquaFlow Supplies",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-30T23:59:59.999Z",
    generatedAt: "2026-10-01T06:10:00.000Z",
    status: "held",
    currencyCode: "inr",
    lines: [
      {
        orderReference: "BK-STG-ORDER-3001",
        categoryName: "Pipes & Fittings",
        grossAmountMinor: 3_200_000,
        refundAmountMinor: 200_000,
        commissionRatePercent: 10,
        commissionAmountMinor: 300_000,
        adjustmentAmountMinor: 0,
        payableAmountMinor: 2_700_000,
      },
    ],
  },
  {
    statementNumber: "BK-STG-SET-004",
    sellerName: "UrbanBuild Supply",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-09-30T23:59:59.999Z",
    generatedAt: "2026-10-01T06:15:00.000Z",
    status: "calculated",
    currencyCode: "inr",
    lines: [
      {
        orderReference: "BK-STG-ORDER-4001",
        categoryName: "Building Materials",
        grossAmountMinor: 2_500_000,
        refundAmountMinor: 0,
        commissionRatePercent: 8,
        commissionAmountMinor: 200_000,
        adjustmentAmountMinor: -50_000,
        payableAmountMinor: 2_250_000,
      },
    ],
  },
];

export function settlementTotals(lines: StatementLineSeed[]) {
  return lines.reduce(
    (totals, line) => ({
      grossAmountMinor: totals.grossAmountMinor + line.grossAmountMinor,
      refundAmountMinor: totals.refundAmountMinor + line.refundAmountMinor,
      commissionAmountMinor:
        totals.commissionAmountMinor + line.commissionAmountMinor,
      adjustmentAmountMinor:
        totals.adjustmentAmountMinor + line.adjustmentAmountMinor,
      payableAmountMinor: totals.payableAmountMinor + line.payableAmountMinor,
    }),
    {
      grossAmountMinor: 0,
      refundAmountMinor: 0,
      commissionAmountMinor: 0,
      adjustmentAmountMinor: 0,
      payableAmountMinor: 0,
    },
  );
}
