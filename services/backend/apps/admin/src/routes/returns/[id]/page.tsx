import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const query = useQuery({
    queryKey: ["buildkart", "staging-return", id],
    queryFn: () => client.admin.buildkart.returns.$id.query({ $id: id! }),
    enabled: Boolean(id),
  });
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decision === "approve"
        ? client.admin.buildkart.returns.$id.approve.mutate({
            $id: id!,
            comment,
          } as never)
        : client.admin.buildkart.returns.$id.reject.mutate({
            $id: id!,
            comment,
          } as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-return", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-returns"],
      });
    },
  });

  const record = query.data?.return;
  const canDecide = record?.status === "requested";

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
                Order {record?.orderId ?? "—"} · Customer{" "}
                {record?.userId ?? "—"} · Resolution{" "}
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
              Could not load this staging return.
            </Text>
          ) : (
            <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-4">
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
                  Requested at
                </Text>
                <Text size="small" weight="plus">
                  {new Date(record.requestedAt).toLocaleString("en-IN")}
                </Text>
              </div>
              <div>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Money / stock effect
                </Text>
                <Text size="small" weight="plus">
                  None
                </Text>
              </div>
            </div>
          )}
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Order-line snapshot</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Quantities are frozen on the case when the request is created.
            </Text>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>SKU</Table.HeaderCell>
                <Table.HeaderCell>Line</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Ordered</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Delivered</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Requested</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Approved</Table.HeaderCell>
                <Table.HeaderCell>Reason</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(record?.lines ?? []).map((line) => (
                <Table.Row key={line.id}>
                  <Table.Cell>{line.sku}</Table.Cell>
                  <Table.Cell>{line.lineKey}</Table.Cell>
                  <Table.Cell className="text-right">{line.orderedQty}</Table.Cell>
                  <Table.Cell className="text-right">{line.deliveredQty}</Table.Cell>
                  <Table.Cell className="text-right">{line.requestedQty}</Table.Cell>
                  <Table.Cell className="text-right">
                    {line.approvedQty ?? "—"}
                  </Table.Cell>
                  <Table.Cell>{label(line.reasonCode)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Decision</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Approving records workflow evidence only. Refund execution and
              Tryton movement are disabled.
            </Text>
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            <textarea
              className="min-h-24 w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm outline-none focus:border-ui-border-interactive"
              placeholder="Decision comment (optional)"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={!canDecide}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="small"
                variant="primary"
                disabled={!canDecide}
                isLoading={decide.isPending}
                onClick={() => decide.mutate("approve")}
              >
                Approve return
              </Button>
              <Button
                size="small"
                variant="danger"
                disabled={!canDecide}
                isLoading={decide.isPending}
                onClick={() => decide.mutate("reject")}
              >
                Reject return
              </Button>
              {!canDecide ? (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  This case is no longer awaiting a decision.
                </Text>
              ) : null}
              {decide.isError ? (
                <Text size="xsmall" className="text-ui-fg-error">
                  Decision failed. Check the Experience API proxy.
                </Text>
              ) : null}
            </div>
          </div>
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
                <Table.HeaderCell>Detail</Table.HeaderCell>
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
                  <Table.Cell>
                    {JSON.stringify(event.detail)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
