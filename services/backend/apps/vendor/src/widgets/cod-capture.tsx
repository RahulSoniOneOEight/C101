import { Button, Container, Heading, Input, StatusBadge, Text, Textarea } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";

type Collection = {
  id: string;
  order_group_id: string;
  status: "pending" | "collected" | "short" | "refused";
  expected_minor: number;
  collected_minor: number;
  currency: string;
  collector_kind: string | null;
  collected_at: string | null;
  proof_ref: string | null;
  reason: string | null;
  version: number;
};

type DuesEntry = {
  id: string;
  kind: string;
  amount_minor: number;
  note: string | null;
};

type Payload = {
  collection?: Collection;
  events?: Array<Record<string, unknown>>;
  dues?: DuesEntry[];
  message?: string;
};

declare const __BACKEND_URL__: string;

const money = (minor: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minor / 100);

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

export function CodCapture({ shipmentId }: { shipmentId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"collected" | "short" | "refused">("collected");
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${__BACKEND_URL__}/vendor/buildkart/shipments/${encodeURIComponent(shipmentId)}/cod`,
        { credentials: "include" },
      );
      const payload = (await response.json()) as Payload;
      if (!response.ok) {
        setError(payload.message ?? "Cash-on-delivery details are not available.");
        return;
      }
      setError("");
      setData(payload);
      if (payload.collection) {
        setAmount((payload.collection.expected_minor / 100).toFixed(2));
      }
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!data?.collection) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `${__BACKEND_URL__}/vendor/buildkart/shipments/${encodeURIComponent(shipmentId)}/cod`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status,
            amount_minor: Math.round(Number(amount) * 100),
            proof_ref: proof.trim() || undefined,
            reason: reason.trim() || undefined,
            expected_version: data.collection.version,
          }),
        },
      );
      const payload = (await response.json()) as Payload;
      if (!response.ok) {
        setError(payload.message ?? "Cash collection could not be saved.");
        return;
      }
      setError("");
      setNotice("Cash collection recorded.");
      setData(payload);
      setProof("");
      setReason("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data && !error) return null;
  if (error && !data) {
    return (
      <Container className="p-6">
        <Text size="small" className="text-ui-fg-subtle">
          {error}
        </Text>
      </Container>
    );
  }
  const collection = data?.collection;
  if (!collection) return null;
  const dues = data?.dues ?? [];
  const duesTotal = dues.reduce((total, entry) => total + entry.amount_minor, 0);
  const tcsPending = dues.some(
    (entry) => entry.kind === "tcs" && (entry.note ?? "").startsWith("pending"),
  );

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center gap-2 px-6 py-5">
        <Heading level="h2">Cash on delivery</Heading>
        <StatusBadge color={collection.status === "collected" ? "green" : collection.status === "pending" ? "orange" : "red"}>
          {label(collection.status)}
        </StatusBadge>
        <Text size="small" className="text-ui-fg-subtle">
          Expected {money(collection.expected_minor, collection.currency)}
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Text size="xsmall" className="text-ui-fg-subtle">Collected so far</Text>
          <Text size="small" weight="plus">{money(collection.collected_minor, collection.currency)}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">Proof</Text>
          <Text size="small">{collection.proof_ref ?? "—"}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">Collector</Text>
          <Text size="small">{collection.collector_kind ? label(collection.collector_kind) : "—"}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">Seller dues this period</Text>
          <Text size="small" weight="plus">{money(duesTotal)}</Text>
          {tcsPending ? (
            <Text size="xsmall" className="text-ui-fg-error">
              TCS pending: one or more products have no GST rate.
            </Text>
          ) : null}
        </div>
        {collection.status !== "refused" ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <Text size="xsmall" className="text-ui-fg-subtle">Result</Text>
              <select
                className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="collected">Collected in full</option>
                <option value="short">Short collection</option>
                <option value="refused">Refused at delivery</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <Text size="xsmall" className="text-ui-fg-subtle">Cash collected (₹)</Text>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <Text size="xsmall" className="text-ui-fg-subtle">Proof reference</Text>
              <Input
                value={proof}
                onChange={(event) => setProof(event.target.value)}
                placeholder="Receipt / photo reference"
              />
            </label>
            <label className="flex flex-col gap-1">
              <Text size="xsmall" className="text-ui-fg-subtle">Reason (short or refused)</Text>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Buyer paid less / refused delivery / …"
              />
            </label>
            {error ? (
              <Text size="xsmall" className="text-ui-fg-error">{error}</Text>
            ) : null}
            {notice ? (
              <Text size="xsmall" className="text-ui-fg-subtle">{notice}</Text>
            ) : null}
            <Button size="small" isLoading={busy} onClick={() => void save()}>
              Record cash collection
            </Button>
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            This delivery was refused. The order needs a seller credit note; no cash is due.
          </Text>
        )}
      </div>
    </Container>
  );
}
