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
type StatementLine = SettlementStatement["lines"][number];

const money = (minor: number, currencyCode: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currencyCode || "inr").toUpperCase(),
    maximumFractionDigits: 2,
  }).format(minor / 100);

const sourceBadge = (line: StatementLine) => {
  if (line.commission_source === "override") {
    return <StatusBadge color="purple">Per-order override</StatusBadge>;
  }
  return <StatusBadge color="grey">Seller policy</StatusBadge>;
};

export default function SettlementStatementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["buildkart", "cod-settlement-statement", id],
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
                  {statement?.statement_number ?? "COD dues statement"}
                </Heading>
                <StatusBadge color="orange">Staging ledger</StatusBadge>
                <StatusBadge color="grey">No payout execution</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Seller receivables from cash-on-delivery orders. Each line is one
                order; commission uses a per-order override when present, otherwise
                the seller policy rate.
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
              Could not load this COD dues statement.
            </Text>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-4">
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Seller
                  </Text>
                  <Text size="small" weight="plus">
                    {statement.seller_name}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {statement.order_count} order
                    {statement.order_count === 1 ? "" : "s"} · {statement.period}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Goods value
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.goods_minor, statement.currency)}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Commission base
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Amount due
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.amount_due_minor, statement.currency)}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Commission + GST + TCS + fee
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Total outstanding
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.total_outstanding_minor, statement.currency)}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Includes {money(statement.carry_forward_minor, statement.currency)}{" "}
                    carry-forward
                  </Text>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-5">
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Commission
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.commission_minor, statement.currency)}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    GST on commission
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.gst_on_commission_minor, statement.currency)}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    TCS
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.tcs_minor, statement.currency)}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {statement.tcs_default_rate_applied
                      ? "18% default GST rate"
                      : "Product GST rate"}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    COD fee
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.cod_fee_minor, statement.currency)}
                  </Text>
                </div>
                <div>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Adjustments
                  </Text>
                  <Text size="small" weight="plus">
                    {money(statement.adjustments_minor, statement.currency)}
                  </Text>
                </div>
              </div>
            </>
          )}
        </Container>

        {statement ? (
          <Container className="overflow-hidden p-0">
            <div className="border-b border-ui-border-base px-6 py-4">
              <Heading level="h2">Statement lines</Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                One row per order. Invoice reference and GST in goods come from the
                seller's tax invoice once it is linked; they are never estimated
                here.
              </Text>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Order</Table.HeaderCell>
                    <Table.HeaderCell>Invoice</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Goods</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Rate</Table.HeaderCell>
                    <Table.HeaderCell>Source</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Commission</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">GST</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">TCS</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">COD fee</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Adjustment</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Amount due</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {statement.lines.map((line: StatementLine) => (
                    <Table.Row key={line.order_group_id}>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {line.order_group_id}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{line.invoice_ref ?? "—"}</Table.Cell>
                      <Table.Cell className="text-right">
                        {money(line.goods_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {(line.commission_bps / 100).toFixed(2)}%
                      </Table.Cell>
                      <Table.Cell>{sourceBadge(line)}</Table.Cell>
                      <Table.Cell className="text-right">
                        {money(line.commission_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(
                          line.gst_on_commission_minor,
                          statement.currency,
                        )}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(line.tcs_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(line.cod_fee_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {money(line.adjustments_minor, statement.currency)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <Text size="small" weight="plus">
                          {money(line.amount_due_minor, statement.currency)}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </Container>
        ) : null}
      </div>
    </SingleColumnPage>
  );
}
