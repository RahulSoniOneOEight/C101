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

export default function VendorReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["buildkart", "seller-return", id],
    queryFn: () => client.vendor.buildkart.returns.$id.query({ $id: id! }),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
  const record = query.data?.return;
  const availableStatuses = record?.allowedTransitions ?? [];
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [received, setReceived] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [dispositions, setDispositions] = useState<Record<string, string>>({});
  const [inspectionNote, setInspectionNote] = useState("");
  const [inspectionError, setInspectionError] = useState("");
  const selectedStatus = availableStatuses.includes(status)
    ? status
    : (availableStatuses[0] ?? "");

  const inspect = useMutation({
    mutationFn: () => {
      if (!record) throw new Error("Return case is not loaded.");
      if (!inspectionNote.trim())
        throw new Error("An inspection note is required.");
      const lines = record.lines.filter((line) => (line.approvedQty ?? 0) > 0);
      return client.vendor.buildkart.returns.$id.inspection.mutate({
        $id: id!,
        expected_version: record.version,
        note: inspectionNote.trim(),
        lines: lines.map((line) => ({
          line_key: line.lineKey,
          received_qty:
            received[line.lineKey] ?? line.approvedQty ?? line.requestedQty,
          condition: conditions[line.lineKey] ?? line.condition ?? "damaged",
          disposition:
            dispositions[line.lineKey] ?? line.disposition ?? "quarantine",
          note: inspectionNote.trim(),
        })),
      } as never);
    },
    onSuccess: async () => {
      setInspectionError("");
      setInspectionNote("");
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-return", id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-returns"],
      });
    },
    onError: (cause) => setInspectionError((cause as Error).message),
  });

  const update = useMutation({
    mutationFn: () => {
      if (!record) throw new Error("Return case is not loaded.");
      return client.vendor.buildkart.returns.$id.status.mutate({
        $id: id!,
        status: selectedStatus,
        expected_version: record.version,
        operation_key: crypto.randomUUID(),
        note: note.trim(),
      } as never);
    },
    onSuccess: async () => {
      setError("");
      setNote("");
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-return", id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "seller-returns"],
      });
    },
    onError: (cause) => setError((cause as Error).message),
  });

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1" className="break-all">
                  {record?.id ?? "Return case"}
                </Heading>
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
                  {["requested", "under_review"].includes(record.status)
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
              decision. Inspection records evidence only; Admin alone controls
              any simulated refund, and no stock movement occurs.
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
            <Heading level="h2">Manual return operation</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              After Admin approval, update only the reverse-logistics stages for
              your allocated lines. No refund or stock action is triggered.
            </Text>
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            {availableStatuses.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                {record?.status === "requested" ||
                record?.status === "under_review"
                  ? "Awaiting the Admin decision."
                  : "No operational transition is available from this stage."}
              </Text>
            ) : (
              <>
                <label
                  className="text-sm font-medium"
                  htmlFor="seller-return-status"
                >
                  Next stage
                </label>
                <select
                  id="seller-return-status"
                  className="h-8 max-w-xs rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                  value={selectedStatus}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {availableStatuses.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
                <label
                  className="text-sm font-medium"
                  htmlFor="seller-return-note"
                >
                  Operating reason
                </label>
                <textarea
                  id="seller-return-note"
                  className="min-h-20 max-w-xl rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="small"
                    isLoading={update.isPending}
                    disabled={!selectedStatus || !note.trim()}
                    onClick={() => {
                      if (
                        selectedStatus !== "cancelled" ||
                        window.confirm("Cancel this return workflow?")
                      ) {
                        update.mutate();
                      }
                    }}
                  >
                    Update return
                  </Button>
                  {error ? (
                    <Text
                      size="xsmall"
                      className="text-ui-fg-error"
                      role="alert"
                    >
                      {error}
                    </Text>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Inspection</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Record the received quantity, condition and disposition. This
              action does not move money or Tryton stock; it enables a simulated
              marketplace refund.
            </Text>
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            {!record ? (
              <Text size="small" className="text-ui-fg-subtle">
                Loading inspection…
              </Text>
            ) : ["requested", "under_review"].includes(record.status) ? (
              <Text size="small" className="text-ui-fg-subtle">
                Awaiting the Admin decision. Inspection opens after approval.
              </Text>
            ) : ["rejected", "cancelled"].includes(record.status) ? (
              <Text size="small" className="text-ui-fg-subtle">
                This return is {label(record.status)}. No inspection, refund or
                stock movement is created.
              </Text>
            ) : ["received", "inspection_pending"].includes(record.status) ? (
              <>
                {record.lines
                  .filter((line) => (line.approvedQty ?? 0) > 0)
                  .map((line) => {
                    const approved = line.approvedQty ?? line.requestedQty;
                    const quantity = received[line.lineKey] ?? approved;
                    return (
                      <div
                        key={line.id}
                        className="rounded-lg border border-ui-border-base p-3"
                      >
                        <Text size="small" weight="plus">
                          {line.sku} · {line.lineKey}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          Approved {approved} · requested {line.requestedQty}
                        </Text>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            Quantity received
                            <input
                              type="number"
                              min={0}
                              max={approved}
                              className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                              value={quantity}
                              onChange={(event) =>
                                setReceived((current) => ({
                                  ...current,
                                  [line.lineKey]: Math.max(
                                    0,
                                    Math.min(
                                      approved,
                                      Number(event.target.value),
                                    ),
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            Condition
                            <select
                              className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                              value={
                                conditions[line.lineKey] ??
                                line.condition ??
                                "damaged"
                              }
                              onChange={(event) =>
                                setConditions((current) => ({
                                  ...current,
                                  [line.lineKey]: event.target.value,
                                }))
                              }
                            >
                              <option value="sellable">Sellable</option>
                              <option value="damaged">Damaged</option>
                              <option value="incomplete">Incomplete</option>
                              <option value="wrong_item">Wrong item</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            Disposition evidence
                            <select
                              className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                              value={
                                dispositions[line.lineKey] ??
                                line.disposition ??
                                "quarantine"
                              }
                              onChange={(event) =>
                                setDispositions((current) => ({
                                  ...current,
                                  [line.lineKey]: event.target.value,
                                }))
                              }
                            >
                              <option value="restock">Restock intent</option>
                              <option value="repair">Repair intent</option>
                              <option value="quarantine">
                                Quarantine intent
                              </option>
                              <option value="dispose">Dispose intent</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Inspection note
                  <textarea
                    className="min-h-20 max-w-xl rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm"
                    value={inspectionNote}
                    onChange={(event) => setInspectionNote(event.target.value)}
                    placeholder="Describe the condition and handling decision…"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="small"
                    isLoading={inspect.isPending}
                    disabled={!inspectionNote.trim()}
                    onClick={() => inspect.mutate()}
                  >
                    Submit inspection
                  </Button>
                  {inspectionError ? (
                    <Text
                      size="xsmall"
                      className="text-ui-fg-error"
                      role="alert"
                    >
                      {inspectionError}
                    </Text>
                  ) : null}
                </div>
              </>
            ) : record.status === "approved" ? (
              <Text size="small" className="text-ui-fg-subtle">
                Mark the return <strong>Received</strong> in Manual return
                operation, then record the inspection here.
              </Text>
            ) : [
                "pickup_scheduled",
                "pickup_attempted",
                "in_return_transit",
              ].includes(record.status) ? (
              <Text size="small" className="text-ui-fg-subtle">
                Inspection opens after the reverse shipment is received at your
                location.
              </Text>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>SKU</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          Received
                        </Table.HeaderCell>
                        <Table.HeaderCell>Condition</Table.HeaderCell>
                        <Table.HeaderCell>
                          Disposition evidence
                        </Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {record.lines.map((line) => (
                        <Table.Row key={line.id}>
                          <Table.Cell>{line.sku}</Table.Cell>
                          <Table.Cell className="text-right">
                            {line.receivedQty ?? "—"}
                          </Table.Cell>
                          <Table.Cell>
                            {line.condition ? label(line.condition) : "—"}
                          </Table.Cell>
                          <Table.Cell>
                            {line.disposition ? label(line.disposition) : "—"}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
                <Text size="small" className="text-ui-fg-subtle">
                  Inspection recorded. Admin controls the refund simulation; the
                  Seller cannot create, change or complete it.
                </Text>
              </>
            )}
          </div>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Your return lines</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Only lines shipped by your seller account are shown.
            </Text>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>SKU</Table.HeaderCell>
                  <Table.HeaderCell>Line</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Delivered
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Requested
                  </Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {(record?.lines ?? []).map((line) => (
                  <Table.Row key={line.id}>
                    <Table.Cell>{line.sku}</Table.Cell>
                    <Table.Cell>{line.lineKey}</Table.Cell>
                    <Table.Cell className="text-right">
                      {line.deliveredQty}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {line.requestedQty}
                    </Table.Cell>
                    <Table.Cell>{label(line.reasonCode)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Audit trail</Heading>
          </div>
          <div className="overflow-x-auto">
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
          </div>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
