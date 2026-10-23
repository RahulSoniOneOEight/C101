import { CheckCircle, XCircle } from "@medusajs/icons";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

declare const __BACKEND_URL__: string;

type InventoryRequest = {
  id: string;
  sku: string;
  offer_id: string | null;
  product_id: string | null;
  seller_id: string | null;
  quantity_delta: number;
  reason: string;
  status: "requested" | "approved" | "rejected";
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

export const config: RouteConfig = {
  label: "Inventory requests",
  icon: CheckCircle,
  rank: 74,
};

const backend = __BACKEND_URL__.replace(/\/$/, "");

async function fetchRequests(): Promise<InventoryRequest[]> {
  const response = await fetch(
    `${backend}/admin/buildkart/inventory/requests?limit=200`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(`Inventory requests failed (${response.status}).`);
  }
  const body = (await response.json()) as { items?: InventoryRequest[] };
  return body.items ?? [];
}

async function decide(
  id: string,
  action: "approve" | "reject",
  note: string,
): Promise<void> {
  const response = await fetch(
    `${backend}/admin/buildkart/inventory/requests/${id}/${action}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() || null }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(body.message ?? `Decision failed (${response.status}).`);
  }
}

const statusColor = (status: InventoryRequest["status"]) =>
  status === "approved" ? "green" : status === "rejected" ? "red" : "orange";

export default function InventoryRequestsPage() {
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ["buildkart", "inventory-requests"],
    queryFn: fetchRequests,
    refetchInterval: 15_000,
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const decision = useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: "approve" | "reject";
      note: string;
    }) => decide(id, action, note),
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "inventory-requests"],
      });
    },
    onError: (err) => setError((err as Error).message),
  });

  return (
    <SingleColumnPage>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">Inventory requests</Heading>
              <StatusBadge color="orange">Staging data</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Seller and admin requests for stock adjustments. Approval records a
              decision only; Tryton stock remains unchanged until an ERP operator
              posts the movement.
            </Text>
          </div>
          <StatusBadge color="grey">
            {requests.data?.length ?? 0} requests
          </StatusBadge>
        </div>

        {error ? (
          <Text size="small" className="px-6 py-4 text-ui-fg-error">
            {error}
          </Text>
        ) : null}

        {requests.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading inventory requests…
          </Text>
        ) : requests.isError ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load inventory requests.
          </Text>
        ) : (requests.data?.length ?? 0) === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            No inventory requests recorded yet.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>When</Table.HeaderCell>
                  <Table.HeaderCell>Seller</Table.HeaderCell>
                  <Table.HeaderCell>SKU</Table.HeaderCell>
                  <Table.HeaderCell>Qty</Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Requested by</Table.HeaderCell>
                  <Table.HeaderCell>Decision</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {requests.data?.map((request) => (
                  <Table.Row key={request.id}>
                    <Table.Cell>
                      <Text size="small">
                        {new Date(request.requested_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {request.seller_id ?? "—"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">{request.sku}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">
                        {request.quantity_delta > 0 ? "+" : ""}
                        {request.quantity_delta}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">{request.reason}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={statusColor(request.status)}>
                        {request.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small">{request.requested_by}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {request.status === "requested" ? (
                        <div className="flex min-w-[240px] flex-col gap-2">
                          <Input
                            placeholder="Decision note (optional)"
                            value={notes[request.id] ?? ""}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              size="small"
                              variant="secondary"
                              isLoading={
                                decision.isPending &&
                                decision.variables?.id === request.id &&
                                decision.variables?.action === "approve"
                              }
                              onClick={() =>
                                decision.mutate({
                                  id: request.id,
                                  action: "approve",
                                  note: notes[request.id] ?? "",
                                })
                              }
                            >
                              <CheckCircle /> Approve
                            </Button>
                            <Button
                              size="small"
                              variant="danger"
                              isLoading={
                                decision.isPending &&
                                decision.variables?.id === request.id &&
                                decision.variables?.action === "reject"
                              }
                              onClick={() =>
                                decision.mutate({
                                  id: request.id,
                                  action: "reject",
                                  note: notes[request.id] ?? "",
                                })
                              }
                            >
                              <XCircle /> Reject
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Text size="small">
                            {request.decision_note ?? "—"}
                          </Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {request.decided_by ?? "—"}
                            {request.decided_at
                              ? ` · ${new Date(
                                  request.decided_at,
                                ).toLocaleDateString("en-IN")}`
                              : ""}
                          </Text>
                        </div>
                      )}
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
