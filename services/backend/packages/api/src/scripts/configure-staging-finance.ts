import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  batchCommissionRulesWorkflow,
  createCommissionRatesWorkflow,
  updateCommissionRatesWorkflow,
} from "@mercurjs/core/workflows";
import { CommissionRateType, MercurModules } from "@mercurjs/types";
import {
  COMMISSION_POLICY_PRESETS,
  SETTLEMENT_STATEMENT_SEEDS,
  settlementTotals,
} from "../staging-finance/presets";
import { MARKETPLACE_SETTLEMENT_MODULE } from "../modules/marketplace-settlement";
import type MarketplaceSettlementModuleService from "../modules/marketplace-settlement/service";
import { isStagingFinanceEnabled } from "../staging-finance/runtime";

interface CommissionRateRecord {
  id: string;
  code: string;
  is_default: boolean;
}

interface CommissionRuleRecord {
  id: string;
  commission_rate_id: string;
  reference: string;
  reference_id: string;
}

export default async function configureStagingFinance({ container }: ExecArgs) {
  if (!isStagingFinanceEnabled()) {
    throw new Error(
      "CHG-028 staging finance fixtures are prohibited in production.",
    );
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productService = container.resolve(Modules.PRODUCT);
  const commissionService = container.resolve(MercurModules.COMMISSION) as {
    listCommissionRates(
      filters: Record<string, unknown>,
    ): Promise<CommissionRateRecord[]>;
    listCommissionRules(
      filters: Record<string, unknown>,
    ): Promise<CommissionRuleRecord[]>;
  };
  const settlementService = container.resolve(
    MARKETPLACE_SETTLEMENT_MODULE,
  ) as MarketplaceSettlementModuleService;

  const defaultRates = await commissionService.listCommissionRates({
    is_default: true,
  });
  if (defaultRates.length !== 1) {
    throw new Error(
      `Expected exactly one Mercur global commission rate; found ${defaultRates.length}.`,
    );
  }

  const globalPreset = COMMISSION_POLICY_PRESETS.find(
    (preset) => preset.isDefault,
  )!;
  await updateCommissionRatesWorkflow(container).run({
    input: [
      {
        id: defaultRates[0].id,
        name: globalPreset.name,
        code: globalPreset.code,
        type: CommissionRateType.PERCENTAGE,
        value: globalPreset.percentage,
        include_tax: globalPreset.includeTax,
        include_shipping: globalPreset.includeShipping,
        is_enabled: true,
      },
    ],
  });
  logger.info(
    `Configured ${globalPreset.name}: ${globalPreset.percentage}% (tax/shipping excluded).`,
  );

  for (const preset of COMMISSION_POLICY_PRESETS.filter(
    (value) => !value.isDefault,
  )) {
    const categories = await productService.listProductCategories({
      name: preset.categoryName,
    });
    if (categories.length !== 1) {
      throw new Error(
        `Expected category '${preset.categoryName}' exactly once; found ${categories.length}.`,
      );
    }

    let [rate] = await commissionService.listCommissionRates({
      code: preset.code,
    });
    const categoryRules = await commissionService.listCommissionRules({
      reference: "product_category",
      reference_id: categories[0].id,
    });
    const conflictingRules = categoryRules.filter(
      (rule) => !rate || rule.commission_rate_id !== rate.id,
    );
    if (conflictingRules.length > 0) {
      throw new Error(
        `Category '${preset.categoryName}' already has a different commission rule. ` +
          "Resolve the governed policy conflict before applying CHG-028.",
      );
    }

    if (!rate) {
      await createCommissionRatesWorkflow(container).run({
        input: [
          {
            name: preset.name,
            code: preset.code,
            type: CommissionRateType.PERCENTAGE,
            value: preset.percentage,
            include_tax: preset.includeTax,
            include_shipping: preset.includeShipping,
            is_enabled: true,
            is_default: false,
          },
        ],
      });
      [rate] = await commissionService.listCommissionRates({
        code: preset.code,
      });
    } else {
      await updateCommissionRatesWorkflow(container).run({
        input: [
          {
            id: rate.id,
            name: preset.name,
            code: preset.code,
            type: CommissionRateType.PERCENTAGE,
            value: preset.percentage,
            include_tax: preset.includeTax,
            include_shipping: preset.includeShipping,
            is_enabled: true,
          },
        ],
      });
    }
    const rules = await commissionService.listCommissionRules({
      commission_rate_id: rate.id,
    });
    const expectedRule =
      rules.length === 1 &&
      rules[0].reference === "product_category" &&
      rules[0].reference_id === categories[0].id;
    if (!expectedRule) {
      await batchCommissionRulesWorkflow(container).run({
        input: {
          commission_rate_id: rate.id,
          delete: rules.map((rule) => rule.id),
          create: [
            {
              reference: "product_category",
              reference_id: categories[0].id,
            },
          ],
        },
      });
    }
    logger.info(
      `Configured ${preset.name}: ${preset.percentage}% for ${preset.categoryName}.`,
    );
  }

  for (const seed of SETTLEMENT_STATEMENT_SEEDS) {
    const { data: sellers } = await query.graph({
      entity: "seller",
      fields: ["id", "name"],
      filters: { name: seed.sellerName },
    });
    if (sellers.length !== 1) {
      throw new Error(
        `Expected seller '${seed.sellerName}' exactly once; found ${sellers.length}.`,
      );
    }

    const totals = settlementTotals(seed.lines);
    const data = {
      statement_number: seed.statementNumber,
      seller_id: sellers[0].id as string,
      seller_name: seed.sellerName,
      period_start: new Date(seed.periodStart),
      period_end: new Date(seed.periodEnd),
      generated_at: new Date(seed.generatedAt),
      currency_code: seed.currencyCode,
      gross_amount_minor: totals.grossAmountMinor,
      refund_amount_minor: totals.refundAmountMinor,
      commission_amount_minor: totals.commissionAmountMinor,
      adjustment_amount_minor: totals.adjustmentAmountMinor,
      payable_amount_minor: totals.payableAmountMinor,
      status: seed.status,
      lines: { items: seed.lines },
      policy_snapshot: {
        change_id: "CHG-028",
        global_percent: 10,
        category_overrides: {
          "Building Materials": 8,
          "Power Tools": 12,
        },
        include_tax: false,
        include_shipping: false,
      },
      test_data: true,
      payment_mode: "simulated",
      payout_execution_authorized: false,
    };

    const [existing] = await settlementService.listSettlementStatements({
      statement_number: seed.statementNumber,
    });
    if (existing) {
      await settlementService.updateSettlementStatements({
        id: existing.id,
        ...data,
      });
    } else {
      await settlementService.createSettlementStatements(data);
    }
    logger.info(
      `Upserted simulated settlement statement ${seed.statementNumber}.`,
    );
  }

  logger.info(
    "CHG-028 staging commission policies and statement fixtures are configured; payout execution remains disabled.",
  );
}
