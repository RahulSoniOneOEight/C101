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

type RefundMoneyField =
  | "amount"
  | "itemSubtotal"
  | "tax"
  | "shipping"
  | "restockingFee"
  | "returnFreight";

const emptyRefundValues: Record<RefundMoneyField, string> = {
  amount: "",
  itemSubtotal: "",
  tax: "0",
  shipping: "0",
  restockingFee: "0",
  returnFreight: "0",
};

const moneyInputToMinor = (value: string): number | null => {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
};

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const query = useQuery({
    queryKey: ["buildkart", "staging-return", id],
    queryFn: () => client.admin.buildkart.returns.$id.query({ $id: id! }),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") => {
      const current = query.data?.return;
      if (!current) throw new Error("Return case is not loaded.");
      return decision === "approve"
        ? client.admin.buildkart.returns.$id.approve.mutate({
            $id: id!,
            expected_version: current.version,
            comment,
            approved_lines: current.lines.map((line) => ({
              line_key: line.lineKey,
              approved_qty: line.requestedQty,
            })),
          } as never)
        : client.admin.buildkart.returns.$id.reject.mutate({
            $id: id!,
            expected_version: current.version,
            comment,
          } as never);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-return", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-returns"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      });
    },
  });

  const [manualStatus, setManualStatus] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualError, setManualError] = useState("");
  const [inspectionReceived, setInspectionReceived] = useState<
    Record<string, number>
  >({});
  const [inspectionConditions, setInspectionConditions] = useState<
    Record<string, string>
  >({});
  const [inspectionDispositions, setInspectionDispositions] = useState<
    Record<string, string>
  >({});
  const [inspectionNote, setInspectionNote] = useState("");
  const [inspectionError, setInspectionError] = useState("");
  const [refundValues, setRefundValues] = useState(emptyRefundValues);
  const [refundMethod, setRefundMethod] = useState<
    "original_method_simulation" | "cod_bank_transfer_simulation"
  >("original_method_simulation");
  const [refundOperationKey] = useState(() => crypto.randomUUID());
  const [refundError, setRefundError] = useState("");

  const inspect = useMutation({
    mutationFn: () => {
      const current = query.data?.return;
      if (!current) throw new Error("Return case is not loaded.");
      if (!inspectionNote.trim())
        throw new Error("An inspection note is required.");
      const lines = current.lines.filter((line) => (line.approvedQty ?? 0) > 0);
      return client.admin.buildkart.returns.$id.inspection.mutate({
        $id: id!,
        expected_version: current.version,
        note: inspectionNote.trim(),
        lines: lines.map((line) => ({
          line_key: line.lineKey,
          received_qty:
            inspectionReceived[line.lineKey] ??
            line.approvedQty ??
            line.requestedQty,
          condition: inspectionConditions[line.lineKey] ?? "damaged",
          disposition: inspectionDispositions[line.lineKey] ?? "quarantine",
          note: inspectionNote.trim(),
        })),
      } as never);
    },
    onSuccess: async () => {
      setInspectionError("");
      setInspectionNote("");
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-return", id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-returns"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      });
    },
    onError: (cause) => setInspectionError((cause as Error).message),
  });

  const refundSimulation = useMutation({
    mutationFn: () => {
      const current = query.data?.return;
      if (!current) throw new Error("Return case is not loaded.");
      const amount = moneyInputToMinor(refundValues.amount);
      const itemSubtotal = moneyInputToMinor(refundValues.itemSubtotal);
      const tax = moneyInputToMinor(refundValues.tax);
      const shipping = moneyInputToMinor(refundValues.shipping);
      const restockingFee = moneyInputToMinor(refundValues.restockingFee);
      const returnFreight = moneyInputToMinor(refundValues.returnFreight);
      if (
        amount === null ||
        itemSubtotal === null ||
        tax === null ||
        shipping === null ||
        restockingFee === null ||
        returnFreight === null
      ) {
        throw new Error(
          "Enter every amount in rupees with no more than two decimals.",
        );
      }
      return client.admin.buildkart.returns.$id.refundSimulation.mutate({
        $id: id!,
        expected_version: current.version,
        operation_key: refundOperationKey,
        amount_minor: amount,
        currency_code: "INR",
        method: refundMethod,
        breakdown: {
          item_subtotal_minor: itemSubtotal,
          tax_minor: tax,
          shipping_minor: shipping,
          restocking_fee_minor: restockingFee,
          return_freight_minor: returnFreight,
        },
      } as never);
    },
    onSuccess: async () => {
      setRefundError("");
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-return", id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-returns"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      });
    },
    onError: (cause) => setRefundError((cause as Error).message),
  });
  const updateStatus = useMutation({
    mutationFn: (status: string) => {
      const current = query.data?.return;
      if (!current) throw new Error("Return case is not loaded.");
      return client.admin.buildkart.returns.$id.status.mutate({
        $id: id!,
        status,
        expected_version: current.version,
        operation_key: crypto.randomUUID(),
        note: manualNote.trim(),
      } as never);
    },
    onSuccess: async () => {
      setManualNote("");
      setManualError("");
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-return", id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-returns"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "staging-order-statuses"],
      });
    },
    onError: (error) => setManualError((error as Error).message),
  });

  const record = query.data?.return;
  const canDecide = ["requested", "under_review"].includes(
    record?.status ?? "",
  );
  const availableStatuses = (record?.allowedTransitions ?? []).filter(
    (status) => !["approved", "rejected"].includes(status),
  );
  const selectedStatus = availableStatuses.includes(manualStatus)
    ? manualStatus
    : (availableStatuses[0] ?? "");
  const refundAmountMinor = moneyInputToMinor(refundValues.amount);
  const refundItemSubtotalMinor = moneyInputToMinor(refundValues.itemSubtotal);
  const refundTaxMinor = moneyInputToMinor(refundValues.tax);
  const refundShippingMinor = moneyInputToMinor(refundValues.shipping);
  const refundRestockingFeeMinor = moneyInputToMinor(
    refundValues.restockingFee,
  );
  const refundReturnFreightMinor = moneyInputToMinor(
    refundValues.returnFreight,
  );
  const refundBreakdownComplete = [
    refundItemSubtotalMinor,
    refundTaxMinor,
    refundShippingMinor,
    refundRestockingFeeMinor,
    refundReturnFreightMinor,
  ].every((value) => value !== null);
  const refundCalculatedMinor = refundBreakdownComplete
    ? refundItemSubtotalMinor! +
      refundTaxMinor! +
      refundShippingMinor! -
      refundRestockingFeeMinor! -
      refundReturnFreightMinor!
    : null;
  const refundAmountsMatch =
    refundAmountMinor !== null &&
    refundAmountMinor > 0 &&
    refundAmountMinor === refundCalculatedMinor;

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
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>SKU</Table.HeaderCell>
                  <Table.HeaderCell>Line</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Ordered
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Delivered
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Requested
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    Approved
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
                      {line.orderedQty}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {line.deliveredQty}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {line.requestedQty}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {line.approvedQty ?? "—"}
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
            <Heading level="h2">Customer photos</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Private short-lived links. Evidence only: no money or stock effect.
            </Text>
          </div>
          <div className="flex flex-wrap gap-3 px-6 py-4">
            {(record?.evidence ?? []).length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No photos were attached to this request.
              </Text>
            ) : (
              (record?.evidence ?? []).map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-40 overflow-hidden rounded-lg border border-ui-border-base"
                >
                  <img
                    src={item.url}
                    alt="Return evidence"
                    className="h-28 w-full object-cover"
                  />
                  <span className="block px-2 py-1 text-xs text-ui-fg-subtle">
                    {Math.max(1, Math.round(item.sizeBytes / 1024))} KB ·{" "}
                    {item.contentType.replace("image/", "").toUpperCase()}
                  </span>
                </a>
              ))
            )}
          </div>
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
            <Heading level="h2">Manual return operation</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Advance only a valid operational stage. This action is versioned,
              audited and has no refund or stock effect.
            </Text>
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            {availableStatuses.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No operational transition is available from the current stage.
              </Text>
            ) : (
              <>
                <label
                  className="text-sm font-medium"
                  htmlFor="admin-return-status"
                >
                  Next stage
                </label>
                <select
                  id="admin-return-status"
                  className="h-8 max-w-xs rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                  value={selectedStatus}
                  onChange={(event) => setManualStatus(event.target.value)}
                >
                  {availableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
                <label
                  className="text-sm font-medium"
                  htmlFor="admin-return-note"
                >
                  Operating reason
                </label>
                <textarea
                  id="admin-return-note"
                  className="min-h-20 max-w-xl rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm"
                  value={manualNote}
                  onChange={(event) => setManualNote(event.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="small"
                    isLoading={updateStatus.isPending}
                    disabled={!selectedStatus || !manualNote.trim()}
                    onClick={() => {
                      if (
                        selectedStatus !== "cancelled" ||
                        window.confirm("Cancel this return workflow?")
                      ) {
                        updateStatus.mutate(selectedStatus);
                      }
                    }}
                  >
                    Update return
                  </Button>
                  {manualError ? (
                    <Text
                      size="xsmall"
                      className="text-ui-fg-error"
                      role="alert"
                    >
                      {manualError}
                    </Text>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </Container>

        <Container className="p-0">
          <div className="border-b border-ui-border-base px-6 py-4">
            <Heading level="h2">Inspection and refund simulation</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Inspection is evidence only. Disposition does not post Tryton
              stock, and the refund simulation does not call a PSP or alter
              Medusa payment state.
            </Text>
          </div>
          <div className="flex flex-col gap-4 px-6 py-5">
            {record &&
            ["received", "inspection_pending"].includes(record.status) ? (
              <div className="flex flex-col gap-3">
                <Text size="small" weight="plus">
                  Record inspection as Admin
                </Text>
                {record.lines
                  .filter((line) => (line.approvedQty ?? 0) > 0)
                  .map((line) => {
                    const approved = line.approvedQty ?? line.requestedQty;
                    const quantity =
                      inspectionReceived[line.lineKey] ?? approved;
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
                                setInspectionReceived((current) => ({
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
                                inspectionConditions[line.lineKey] ?? "damaged"
                              }
                              onChange={(event) =>
                                setInspectionConditions((current) => ({
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
                                inspectionDispositions[line.lineKey] ??
                                "quarantine"
                              }
                              onChange={(event) =>
                                setInspectionDispositions((current) => ({
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
                    placeholder="Describe the observed condition and intended handling…"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="small"
                    isLoading={inspect.isPending}
                    disabled={!inspectionNote.trim()}
                    onClick={() => inspect.mutate()}
                  >
                    Record inspection
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
              </div>
            ) : record?.lines.some((line) => line.condition) ? (
              <div className="overflow-x-auto">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>SKU</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        Received
                      </Table.HeaderCell>
                      <Table.HeaderCell>Condition</Table.HeaderCell>
                      <Table.HeaderCell>Disposition evidence</Table.HeaderCell>
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
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                Inspection opens after the approved return is received.
              </Text>
            )}

            <div className="border-t border-ui-border-base pt-4">
              {record?.refundSimulation ? (
                <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
                  <Text size="small" weight="plus">
                    {label(record.refundSimulation.status)} ·{" "}
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: record.refundSimulation.currencyCode,
                    }).format(record.refundSimulation.amountMinor / 100)}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Reference {record.refundSimulation.simulationReference} ·
                    money effect none · stock effect none.
                  </Text>
                </div>
              ) : record?.status === "inspection_complete" ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <Text size="small" weight="plus">
                      Record explicit simulated refund
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Enter the provisional amount and full policy breakdown.
                      This closes the case with simulated evidence only.
                    </Text>
                  </div>
                  <label className="flex max-w-sm flex-col gap-1 text-sm font-medium">
                    Simulation method
                    <select
                      className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                      value={refundMethod}
                      onChange={(event) =>
                        setRefundMethod(
                          event.target.value as typeof refundMethod,
                        )
                      }
                    >
                      <option value="original_method_simulation">
                        Original method simulation
                      </option>
                      <option value="cod_bank_transfer_simulation">
                        COD bank transfer simulation
                      </option>
                    </select>
                  </label>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {(
                      [
                        ["amount", "Provisional refund"],
                        ["itemSubtotal", "Item subtotal (+)"],
                        ["tax", "Tax (+)"],
                        ["shipping", "Shipping (+)"],
                        ["restockingFee", "Restocking fee (−)"],
                        ["returnFreight", "Return freight (−)"],
                      ] as const
                    ).map(([field, fieldLabel]) => (
                      <label
                        key={field}
                        className="flex flex-col gap-1 text-sm font-medium"
                      >
                        {fieldLabel} (₹)
                        <input
                          inputMode="decimal"
                          className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                          value={refundValues[field]}
                          onChange={(event) =>
                            setRefundValues((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </label>
                    ))}
                  </div>
                  <Text
                    size="xsmall"
                    className={
                      refundAmountsMatch
                        ? "text-ui-fg-subtle"
                        : "text-ui-fg-error"
                    }
                    role={
                      refundValues.amount && !refundAmountsMatch
                        ? "alert"
                        : undefined
                    }
                  >
                    Breakdown total:{" "}
                    {refundCalculatedMinor === null
                      ? "complete every field"
                      : new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                        }).format(refundCalculatedMinor / 100)}
                    {refundValues.amount && !refundAmountsMatch
                      ? " · must match the provisional refund"
                      : ""}
                  </Text>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="small"
                      isLoading={refundSimulation.isPending}
                      disabled={!refundAmountsMatch}
                      onClick={() => refundSimulation.mutate()}
                    >
                      Record refund simulation
                    </Button>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Creates a SIM reference; no PSP, payment, stock or
                      settlement mutation.
                    </Text>
                    {refundError ? (
                      <Text
                        size="xsmall"
                        className="text-ui-fg-error"
                        role="alert"
                      >
                        {refundError}
                      </Text>
                    ) : null}
                  </div>
                </div>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">
                  Refund simulation becomes available only after inspection is
                  complete.
                </Text>
              )}
            </div>
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
                    <Table.Cell className="align-top">
                      <details>
                        <summary className="cursor-pointer text-ui-fg-subtle">
                          View detail
                        </summary>
                        <pre
                          style={{
                            maxWidth: "26rem",
                            margin: "0.5rem 0 0",
                            fontSize: 11,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {JSON.stringify(event.detail, null, 2)}
                        </pre>
                      </details>
                    </Table.Cell>
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
