import { ChartBar } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useQuery } from "@tanstack/react-query";
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
    currency: currencyCode.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(minor / 100);

const statusColor = (status: SettlementStatement["status"]) => {
  if (status === "reviewed") return "green" as const;
  if (status === "held") return "red" as const;
  return "orange" as const;
};

export default function SettlementStatementsPage() {
  const query = useQuery({
    queryKey: ["buildkart", "staging-settlement-statements"],
    queryFn: () => client.admin.buildkart.settlementStatements.query({}),
  });
  const statements = query.data?.statements ?? [];

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Seller settlement statements</Heading>
                <StatusBadge color="orange">Simulated staging data</StatusBadge>
                <StatusBadge color="grey">No payout execution</StatusBadge>
              </div>
              <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
                Read-only examples for reviewing seller earnings and commission
                deductions. These records never initiate a provider transfer or
                post to production accounting.
              </Text>
            </div>
            <Button asChild variant="secondary" size="small">
              <Link to="/settings/commissions">Review commission policies</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-3">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Global commission
              </Text>
              <Text size="large" weight="plus">
                10%
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                Fallback for all other categories
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Building Materials
              </Text>
              <Text size="large" weight="plus">
                8%
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                Category override
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Power Tools
              </Text>
              <Text size="large" weight="plus">
                12%
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                Category override
              </Text>
            </div>
          </div>
          <div className="px-6 py-3">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Commission base: merchandise value excluding GST and shipping.
              Pilot presets only.
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
              Could not load the simulated settlement statements.
            </Text>
          ) : statements.length === 0 ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              No staging statements are seeded. Run configure:staging-finance
              after migrations.
            </Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Statement</Table.HeaderCell>
                  <Table.HeaderCell>Seller</Table.HeaderCell>
                  <Table.HeaderCell>Period</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Gross
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Refunds
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Commission
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Adjustments
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Payable
                  </Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {statements.map((statement) => (
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
                        {statement.lines.length} line
                        {statement.lines.length === 1 ? "" : "s"} · test only
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{statement.seller_name}</Table.Cell>
                    <Table.Cell>
                      {new Date(statement.period_start).toLocaleDateString(
                        "en-IN",
                      )}{" "}
                      –{" "}
                      {new Date(statement.period_end).toLocaleDateString(
                        "en-IN",
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(
                        statement.gross_amount_minor,
                        statement.currency_code,
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(
                        statement.refund_amount_minor,
                        statement.currency_code,
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(
                        statement.commission_amount_minor,
                        statement.currency_code,
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(
                        statement.adjustment_amount_minor,
                        statement.currency_code,
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Text size="small" weight="plus">
                        {money(
                          statement.payable_amount_minor,
                          statement.currency_code,
                        )}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={statusColor(statement.status)}>
                        {statement.status}
                      </StatusBadge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      </div>
    </SingleColumnPage>
  );
}
