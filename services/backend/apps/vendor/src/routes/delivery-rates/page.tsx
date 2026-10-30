import { TruckFast } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
  Textarea,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

declare const __BACKEND_URL__: string;

type DeliveryRate = {
  id: string;
  pincode: string;
  flat_fee_minor: number;
  active: boolean;
  updated_by: "admin" | "seller";
  updated_at: string;
};

export const config: RouteConfig = {
  label: "Delivery rates",
  icon: TruckFast,
  rank: 76,
};

const backend = __BACKEND_URL__.replace(/\/$/, "");

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backend}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? `Request failed (${response.status}).`);
  }
  return body;
}

export default function VendorDeliveryRatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draftPincode, setDraftPincode] = useState("");
  const [draftFee, setDraftFee] = useState("99");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = new URLSearchParams({ limit: "100" });
  if (search.trim()) query.set("q", search.trim());

  const rates = useQuery({
    queryKey: ["buildkart", "vendor-delivery-rates", search],
    queryFn: () =>
      fetchJson<{ delivery_rates: DeliveryRate[]; count: number }>(
        `/vendor/buildkart/delivery-rates?${query.toString()}`,
      ),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["buildkart", "vendor-delivery-rates"],
    });
  };

  const saveRate = useMutation({
    mutationFn: (input: { id: string; fee?: string; active?: boolean }) =>
      fetchJson(`/vendor/buildkart/delivery-rates/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(input.fee !== undefined ? { fee: input.fee } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        }),
      }),
    onSuccess: () => {
      setError(null);
      setNotice("Rate updated.");
      refresh();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteRate = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/vendor/buildkart/delivery-rates/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setError(null);
      setNotice("Rate deleted.");
      refresh();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const createRate = useMutation({
    mutationFn: () =>
      fetchJson("/vendor/buildkart/delivery-rates", {
        method: "POST",
        body: JSON.stringify({
          pincode: draftPincode.trim(),
          fee: draftFee.trim(),
        }),
      }),
    onSuccess: () => {
      setError(null);
      setNotice(`Rate saved for ${draftPincode.trim()}.`);
      setDraftPincode("");
      refresh();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const bulkImport = useMutation({
    mutationFn: () =>
      fetchJson<{
        created: number;
        updated: number;
        unchanged: number;
        errors: Array<{ line: number; message: string }>;
      }>("/vendor/buildkart/delivery-rates/bulk", {
        method: "POST",
        body: JSON.stringify({ csv: bulkText }),
      }),
    onSuccess: (result) => {
      setError(
        result.errors.length
          ? `${result.errors.length} line(s) skipped: ${result.errors
              .slice(0, 5)
              .map((line) => `#${line.line} ${line.message}`)
              .join("; ")}`
          : null,
      );
      setNotice(
        `Bulk import: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`,
      );
      setBulkText("");
      refresh();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  return (
    <SingleColumnPage>
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">Delivery rates</Heading>
              <StatusBadge color="orange">Your pincodes only</StatusBadge>
            </div>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              One flat delivery fee per pincode. If you have no row for a
              customer&apos;s pincode, that order is charged ₹99. Admin overrides
              are marked in the Updated by column.
            </Text>
          </div>
          <StatusBadge color="grey">{rates.data?.count ?? 0} rows</StatusBadge>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <div className="flex flex-col gap-1">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Pincode search
            </Text>
            <Input
              size="small"
              placeholder="302001"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setBulkOpen((open) => !open)}
          >
            {bulkOpen ? "Close bulk import" : "Bulk import"}
          </Button>
        </div>

        {bulkOpen ? (
          <div className="flex flex-col gap-2 px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Paste <code>pincode,fee</code> lines (comma, semicolon or tab). A
              header row is skipped; duplicates keep the last value.
            </Text>
            <Textarea
              rows={8}
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={"pincode,fee\n302001,29\n302002,49"}
            />
            <div>
              <Button
                size="small"
                onClick={() => bulkImport.mutate()}
                isLoading={bulkImport.isPending}
              >
                Import
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          <div className="flex flex-col gap-1">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Add / update pincode
            </Text>
            <Input
              size="small"
              placeholder="302001"
              value={draftPincode}
              onChange={(event) => setDraftPincode(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Fee (₹)
            </Text>
            <Input
              size="small"
              placeholder="99"
              value={draftFee}
              onChange={(event) => setDraftFee(event.target.value)}
            />
          </div>
          <Button
            size="small"
            onClick={() => createRate.mutate()}
            isLoading={createRate.isPending}
            disabled={!draftPincode.trim()}
          >
            Save rate
          </Button>
        </div>

        {error ? (
          <Text size="small" className="px-6 py-3 text-ui-fg-error">
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text size="small" className="px-6 py-3 text-ui-fg-subtle">
            {notice}
          </Text>
        ) : null}

        {rates.isPending ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            Loading delivery rates…
          </Text>
        ) : rates.isError || !rates.data ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-error">
            Could not load delivery rates.
          </Text>
        ) : rates.data.delivery_rates.length === 0 ? (
          <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
            You have no rate rows yet. Customers are charged the ₹99 default for
            every pincode.
          </Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Pincode</Table.HeaderCell>
                  <Table.HeaderCell>Fee</Table.HeaderCell>
                  <Table.HeaderCell>Active</Table.HeaderCell>
                  <Table.HeaderCell>Updated by</Table.HeaderCell>
                  <Table.HeaderCell>Updated</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rates.data.delivery_rates.map((rate) => (
                  <RateRow
                    key={rate.id}
                    rate={rate}
                    onSave={(fee, active) =>
                      saveRate.mutate({ id: rate.id, fee, active })
                    }
                    onDelete={() => deleteRate.mutate(rate.id)}
                  />
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </SingleColumnPage>
  );
}

function RateRow({
  rate,
  onSave,
  onDelete,
}: {
  rate: DeliveryRate;
  onSave: (fee: string, active: boolean) => void;
  onDelete: () => void;
}) {
  const [fee, setFee] = useState((rate.flat_fee_minor / 100).toFixed(2));
  const [active, setActive] = useState(rate.active);
  const dirty =
    fee !== (rate.flat_fee_minor / 100).toFixed(2) || active !== rate.active;

  return (
    <Table.Row>
      <Table.Cell>
        <Text size="small" weight="plus">
          {rate.pincode}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Input
          size="small"
          className="w-24"
          value={fee}
          onChange={(event) => setFee(event.target.value)}
        />
      </Table.Cell>
      <Table.Cell>
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
      </Table.Cell>
      <Table.Cell>
        <StatusBadge color={rate.updated_by === "admin" ? "blue" : "green"}>
          {rate.updated_by}
        </StatusBadge>
      </Table.Cell>
      <Table.Cell>
        {new Date(rate.updated_at).toLocaleString("en-IN")}
      </Table.Cell>
      <Table.Cell>
        <div className="flex gap-2">
          <Button
            size="small"
            variant="secondary"
            disabled={!dirty}
            onClick={() => onSave(fee, active)}
          >
            Save
          </Button>
          <Button size="small" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </Table.Cell>
    </Table.Row>
  );
}
