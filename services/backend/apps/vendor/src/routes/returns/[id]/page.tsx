import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { client } from "../../../lib/client";

const statusColor = (status: string) => {
  if (status === "approved" || status === "closed") return "green" as const;
  if (status === "rejected" || status === "cancelled") return "red" as const;
  return "orange" as const;
};

const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function VendorReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["buildkart", "seller-return", id],
    queryFn: () => client.vendor.buildkart.returns.$id.query({ $id: id! }),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
  const record = query.data?.return;

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">{record?.id ?? "Return case"}</Heading>
                <StatusBadge color="orange">Simulated staging data</StatusBadge>
                {record ? (
                  <StatusBadge color={statusColor(record.status)}>
                    {label(record.status)}
                  </StatusBadge>
                ) : null}
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Order {record?.orderId ?? "—"} · Resolution{" "}
                {record ? label(record.resolution) : "—"}
              </Text>
            </div>
            <Button asChild variant="secondary" size="small">
              <Link to="/returns">Back to returns</Link>
            </Button>
          </div>
          {query.isPending ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              Loading return…
            </Text>
          ) : query.isError || !record ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-error">
              Could not load this return case.
            </Text>
          ) : (
            <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-3">
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Policy version
                </Text>
                <Text size="small" weight="plus">
                  {record.policyVersion}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Reason
                </Text>
                <Text size="small" weight="plus">
                  {label(record.reasonCode)}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Admin decision
                </Text>
                <Text size="small" weight="plus">
                  {record.status === "requested"
                    ? "Awaiting admin decision"
                    : label(record.status)}
                </Text>
              </div>
            </div>
          )}
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Decision you must follow</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Admin approves or rejects the return. The seller follows the
              decision; Phase 1 records evidence only, with no refund execution
              or stock movement.
            </Text>
          </div>
          <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-3">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Decided by
              </Text>
              <Text size="small" weight="plus">
                {record?.decidedBy ?? "Pending"}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Decided at
              </Text>
              <Text size="small" weight="plus">
                {record?.decidedAt
                  ? new Date(record.decidedAt).toLocaleString("en-IN")
                  : "Pending"}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Decision note
              </Text>
              <Text size="small" weight="plus">
                {record?.decisionComment ?? "—"}
              </Text>
            </div>
          </div>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Your return lines</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Only lines shipped by your seller account are shown.
            </Text>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>SKU</Table.HeaderCell>
                <Table.HeaderCell>Line</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Delivered</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Requested</Table.HeaderCell>
                <Table.HeaderCell>Reason</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(record?.lines ?? []).map((line) => (
                <Table.Row key={line.id}>
                  <Table.Cell>{line.sku}</Table.Cell>
                  <Table.Cell>{line.lineKey}</Table.Cell>
                  <Table.Cell className="text-right">{line.deliveredQty}</Table.Cell>
                  <Table.Cell className="text-right">{line.requestedQty}</Table.Cell>
                  <Table.Cell>{label(line.reasonCode)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Audit trail</Heading>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Occurred</Table.HeaderCell>
                <Table.HeaderCell>Event</Table.HeaderCell>
                <Table.HeaderCell>Actor</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(record?.events ?? []).map((event) => (
                <Table.Row key={event.id}>
                  <Table.Cell>
                    {new Date(event.occurredAt).toLocaleString("en-IN")}
                  </Table.Cell>
                  <Table.Cell>{label(event.eventType)}</Table.Cell>
                  <Table.Cell>{event.actorId ?? "system"}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
