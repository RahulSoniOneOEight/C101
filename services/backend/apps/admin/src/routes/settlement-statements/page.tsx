import { ChartBar } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../../lib/client";

// The dashboard SDK requires route metadata beside the page component.
// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Settlement statements",
  icon: ChartBar,
  rank: 60,
};

type SettlementResponse = InferClientOutput<
  typeof client.admin.buildkart.settlementStatements.query
>;
type SettlementStatement = SettlementResponse["statements"][number];

const money = (minor: number, currencyCode: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currencyCode || "inr").toUpperCase(),
    maximumFractionDigits: 2,
  }).format(minor / 100);

export default function SettlementStatementsPage() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [loadedPeriod, setLoadedPeriod] = useState(period);
  const query = useQuery({
    queryKey: ["buildkart", "cod-settlement-statements", loadedPeriod],
    queryFn: () =>
      client.admin.buildkart.settlementStatements.query({
        period: loadedPeriod,
      }),
  });
  const statements = query.data?.statements ?? [];
  const currency = statements[0]?.currency ?? "INR";
  const totals = statements.reduce(
    (sum, statement) => ({
      orders: sum.orders + statement.order_count,
      goods: sum.goods + statement.goods_minor,
      commission: sum.commission + statement.commission_minor,
      gst: sum.gst + statement.gst_on_commission_minor,
      tcs: sum.tcs + statement.tcs_minor,
      due: sum.due + statement.amount_due_minor,
      carry: sum.carry + statement.carry_forward_minor,
    }),
    { orders: 0, goods: 0, commission: 0, gst: 0, tcs: 0, due: 0, carry: 0 },
  );

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Seller COD dues statements</Heading>
                <StatusBadge color="orange">Staging ledger</StatusBadge>
                <StatusBadge color="grey">No payout execution</StatusBadge>
              </div>
              <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
                Built from the seller dues ledger written when cash was collected.
                Each line is one COD order: goods value, the commission rate that
                applied, GST on commission, TCS and any COD fee. Amounts are due
                from the seller; Bazarbee never holds the goods money.
              </Text>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Statements
              </Text>
              <Text size="large" weight="plus">
                {statements.length}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                {totals.orders} collected order{totals.orders === 1 ? "" : "s"}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Goods value
              </Text>
              <Text size="large" weight="plus">
                {money(totals.goods, currency)}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                Commission base
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Commission
              </Text>
              <Text size="large" weight="plus">
                {money(totals.commission, currency)}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                GST {money(totals.gst, currency)} · TCS {money(totals.tcs, currency)}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Due this period
              </Text>
              <Text size="large" weight="plus">
                {money(totals.due, currency)}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                Carry-forward {money(totals.carry, currency)}
              </Text>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 px-6 py-4">
            <label className="flex flex-col gap-1">
              <Text size="xsmall">Period</Text>
              <Input
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                placeholder="2026-11"
              />
            </label>
            <Button
              size="small"
              onClick={() => setLoadedPeriod(period)}
              disabled={!/^\d{4}-\d{2}$/.test(period)}
            >
              Load
            </Button>
            <Text size="xsmall" className="pb-2 text-ui-fg-subtle">
              One row per seller per period. Open each statement for per-order lines.
            </Text>
          </div>
        </Container>

        <Container className="overflow-hidden p-0">
          {query.isPending ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              Loading statements…
            </Text>
          ) : query.isError ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-error">
              Could not load the COD dues statements.
            </Text>
          ) : statements.length === 0 ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              No COD dues were posted for {loadedPeriod}.
            </Text>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Statement</Table.HeaderCell>
                    <Table.HeaderCell>Seller</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Orders</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Goods</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Commission</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">GST on commission</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">TCS</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">COD fee</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Amount due</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Carry-forward</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {statements.map((statement: SettlementStatement) => (
                    <Table.Row
                      key={statement.id}
                      data-testid={`statement-${statement.statement_number}`}
                    >
                      <Table.Cell>
                        <Link to={`/settlement-statements/${statement.id}`}>
                          <Text
                            size="small"
                            weight="plus"
                            className="text-ui-fg-interactive"
                          >
                            {statement.statement_number}
                          </Text>
                        </Link>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          COD · {statement.period}
                          {statement.tcs_default_rate_applied
                            ? " · TCS at 18% default"
                            : ""}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small">{statement.seller_name}</Text>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {statement.order_count}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(statement.goods_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(statement.commission_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(
                          statement.gst_on_commission_minor,
                          statement.currency,
                        )}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(statement.tcs_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(statement.cod_fee_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <Text size="small" weight="plus">
                          {money(statement.amount_due_minor, statement.currency)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(
                          statement.carry_forward_minor,
                          statement.currency,
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </Container>
      </div>
    </SingleColumnPage>
  );
}
