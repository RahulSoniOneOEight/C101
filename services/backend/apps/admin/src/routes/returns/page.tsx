import { DocumentText } from "@medusajs/icons";
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
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../../lib/client";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Returns",
  icon: DocumentText,
  rank: 71,
};

type ReturnList = InferClientOutput<
  typeof client.admin.buildkart.returns.query
>;
type ReturnCase = ReturnList["items"][number];

const statusColor = (status: string) => {
  if (status === "approved" || status === "closed") return "green" as const;
  if (status === "rejected" || status === "cancelled") return "red" as const;
  if (status === "requested") return "orange" as const;
  return "blue" as const;
};

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function ReturnsPage() {
  const returns = useQuery({
    queryKey: ["buildkart", "staging-returns"],
    queryFn: () => client.admin.buildkart.returns.query(),
    refetchInterval: 15_000,
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const allReturns = useMemo(
    () => returns.data?.items ?? [],
    [returns.data?.items],
  );
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of allReturns) {
      counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
    }
    return counts;
  }, [allReturns]);
  const visibleReturns =
    statusFilter === "all"
      ? allReturns
      : allReturns.filter((record) => record.status === statusFilter);

  return (
    <SingleColumnPage>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">Returns</Heading>
              <StatusBadge color="orange">Simulated staging data</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Workflow evidence only. Approving or rejecting a return does not
              issue a refund, move money or move Tryton stock.
            </Text>
          </div>
          <StatusBadge color="grey">
            {returns.data?.items.length ?? 0} cases
          </StatusBadge>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <Button
            size="small"
            variant={statusFilter === "all" ? "primary" : "secondary"}
            onClick={() => setStatusFilter("all")}
          >
            All ({allReturns.length})
          </Button>
          {[...statusCounts.keys()].sort().map((status) => (
            <Button
              key={status}
              size="small"
              variant={statusFilter === status ? "primary" : "secondary"}
              onClick={() => setStatusFilter(status)}
            >
              {label(status)} ({statusCounts.get(status)})
            </Button>
          ))}
        </div>
        {returns.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading returns…
          </Text>
        ) : returns.isError || !returns.data ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load staging returns. Check the Experience API proxy.
          </Text>
        ) : visibleReturns.length === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            No return request in this status.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Case</Table.HeaderCell>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Reason / resolution</Table.HeaderCell>
                  <Table.HeaderCell>Quantity</Table.HeaderCell>
                  <Table.HeaderCell>Decision</Table.HeaderCell>
                  <Table.HeaderCell>Requested</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {visibleReturns.map((record: ReturnCase) => {
                  const requested = record.lines.reduce(
                    (total, line) => total + line.requestedQty,
                    0,
                  );
                  const approved = record.lines.reduce(
                    (total, line) => total + (line.approvedQty ?? 0),
                    0,
                  );
                  return (
                    <Table.Row key={record.id}>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {record.id}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {record.orderId}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {record.orderGroupId ?? "No order group"}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{record.userId}</Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={statusColor(record.status)}>
                          {label(record.status)}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {label(record.reasonCode)}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {label(record.resolution)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {requested} requested
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {record.status === "approved"
                            ? `${approved} approved`
                            : `${record.lines.length} line(s)`}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {record.decidedBy ?? "Awaiting operator"}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {record.decisionComment ?? "No decision note"}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        {new Date(record.requestedAt).toLocaleString("en-IN")}
                      </Table.Cell>
                      <Table.Cell>
                        <Button asChild size="small" variant="secondary">
                          <Link to={`/returns/${record.id}`}>Open</Link>
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  );
}
