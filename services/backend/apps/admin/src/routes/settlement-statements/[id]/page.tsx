import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { client } from "../../../lib/client";

type StatementResponse = InferClientOutput<
  typeof client.admin.buildkart.settlementStatements.$id.query
>;
type SettlementStatement = StatementResponse["statement"];

const money = (minor: number, currencyCode: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(minor / 100);

const statusColor = (status: SettlementStatement["status"]) => {
  if (status === "reviewed") return "green" as const;
  if (status === "held") return "red" as const;
  return "orange" as const;
};

export default function SettlementStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["buildkart", "staging-settlement-statement", id],
    queryFn: () =>
      client.admin.buildkart.settlementStatements.$id.query({ $id: id! }),
    enabled: Boolean(id),
  });
  const statement = query.data?.statement;

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">
                  {statement?.statement_number ?? "Settlement statement"}
                </Heading>
                <StatusBadge color="orange">Simulated staging data</StatusBadge>
                {statement ? (
                  <StatusBadge color={statusColor(statement.status)}>
                    {statement.status}
                  </StatusBadge>
                ) : null}
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Read-only seller earnings projection. Payout execution and
                Tryton posting are disabled.
              </Text>
            </div>
            <Button asChild variant="secondary" size="small">
              <Link to="/settlement-statements">Back to statements</Link>
            </Button>
          </div>

          {query.isPending ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              Loading statement…
            </Text>
          ) : query.isError || !statement ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-error">
              Could not load this simulated settlement statement.
            </Text>
          ) : (
            <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-4">
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Seller
                </Text>
                <Text size="small" weight="plus">
                  {statement.seller_name}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Statement period
                </Text>
                <Text size="small" weight="plus">
                  {new Date(statement.period_start).toLocaleDateString("en-IN")}{" "}
                  – {new Date(statement.period_end).toLocaleDateString("en-IN")}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Commission
                </Text>
                <Text size="small" weight="plus">
                  {money(
                    statement.commission_amount_minor,
                    statement.currency_code,
                  )}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Payable projection
                </Text>
                <Text size="small" weight="plus">
                  {money(
                    statement.payable_amount_minor,
                    statement.currency_code,
                  )}
                </Text>
              </div>
            </div>
          )}
        </Container>

        {statement ? (
          <Container className="overflow-hidden p-0">
            <div className="border-b border-ui-border-base px-6 py-4">
              <Heading level="h2">Statement lines</Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                Commission is calculated on merchandise value after refunds,
                excluding GST and shipping.
              </Text>
            </div>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Category</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Gross
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Refund
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Rate
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Commission
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Adjustment
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Payable
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {statement.lines.map((line) => (
                  <Table.Row key={line.orderReference}>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {line.orderReference}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{line.categoryName}</Table.Cell>
                    <Table.Cell className="text-right">
                      {money(line.grossAmountMinor, statement.currency_code)}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(line.refundAmountMinor, statement.currency_code)}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {line.commissionRatePercent}%
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(
                        line.commissionAmountMinor,
                        statement.currency_code,
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(
                        line.adjustmentAmountMinor,
                        statement.currency_code,
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Text size="small" weight="plus">
                        {money(
                          line.payableAmountMinor,
                          statement.currency_code,
                        )}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </Container>
        ) : null}
      </div>
    </SingleColumnPage>
  );
}
