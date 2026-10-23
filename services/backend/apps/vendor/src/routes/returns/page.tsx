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
import { Link } from "react-router-dom";
import { client } from "../../lib/client";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Returns",
  icon: DocumentText,
  rank: 61,
};

type ReturnList = InferClientOutput<
  typeof client.vendor.buildkart.returns.query
>;
type ReturnCase = ReturnList["items"][number];

const statusColor = (status: string) => {
  if (status === "approved" || status === "closed") return "green" as const;
  if (status === "rejected" || status === "cancelled") return "red" as const;
  return "orange" as const;
};

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function VendorReturnsPage() {
  const returns = useQuery({
    queryKey: ["buildkart", "seller-returns"],
    queryFn: () => client.vendor.buildkart.returns.query(),
    refetchInterval: 15_000,
  });

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
              Return cases for your shipments. Operator review remains the
              decision authority in Phase 1; this view shows the current status.
            </Text>
          </div>
          <StatusBadge color="grey">
            {returns.data?.items.length ?? 0} cases
          </StatusBadge>
        </div>
        {returns.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading returns…
          </Text>
        ) : returns.isError || !returns.data ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load your return cases.
          </Text>
        ) : returns.data.items.length === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            No return case for your shipments.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Case</Table.HeaderCell>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Resolution</Table.HeaderCell>
                  <Table.HeaderCell>Requested</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {returns.data.items.map((record: ReturnCase) => (
                  <Table.Row key={record.id}>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {record.id}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{record.orderId}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={statusColor(record.status)}>
                        {label(record.status)}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{label(record.resolution)}</Table.Cell>
                    <Table.Cell>
                      {new Date(record.requestedAt).toLocaleString("en-IN")}
                    </Table.Cell>
                    <Table.Cell>
                      <Button asChild size="small" variant="secondary">
                        <Link to={`/returns/${record.id}`}>Open</Link>
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  );
}
