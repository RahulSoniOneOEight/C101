import { CreditCard } from "@medusajs/icons";
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
import { useEffect, useState } from "react";

declare const __BACKEND_URL__: string;

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "COD",
  icon: CreditCard,
  rank: 65,
};

type Policy = {
  seller_id: string;
  enabled: boolean;
  pincodes: string[];
  blocked_category_ids: string[];
  max_order_minor: number | null;
  buyer_daily_cap_minor: number | null;
  seller_daily_cap_minor: number | null;
  cod_fee_minor: number;
  commission_bps: number;
};

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
};

type DuesEntry = {
  id: string;
  seller_id: string;
  period: string;
  kind: string;
  amount_minor: number;
  source_ref: string | null;
  note: string | null;
};

type Statement = {
  seller_id: string;
  total_due_minor: number;
  tcs_pending: boolean;
  tcs_default_rate_applied: boolean;
  entries: DuesEntry[];
};

const money = (minor: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);

const statusColor = (status: Collection["status"]) => {
  if (status === "collected") return "green" as const;
  if (status === "pending") return "orange" as const;
  return "red" as const;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${__BACKEND_URL__}${path}`, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
  return body;
}

export default function CodPage() {
  const [tab, setTab] = useState<"policies" | "collections" | "statements">("collections");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState<Policy | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPolicies = async () => {
    const data = await api<{ policies: Policy[] }>("/admin/buildkart/cod/policies");
    setPolicies(data.policies ?? []);
  };
  const loadCollections = async () => {
    const data = await api<{ collections: Collection[] }>("/admin/buildkart/cod/collections");
    setCollections(data.collections ?? []);
  };
  const loadStatements = async (nextPeriod = period) => {
    const data = await api<{ statements: Statement[] }>(
      `/admin/buildkart/cod/statements?period=${encodeURIComponent(nextPeriod)}`,
    );
    setStatements(data.statements ?? []);
  };

  useEffect(() => {
    setError("");
    Promise.all([loadPolicies(), loadCollections(), loadStatements()]).catch((caught) =>
      setError((caught as Error).message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (policy: Policy) => {
    setEditing(policy);
    setForm({
      enabled: policy.enabled ? "true" : "false",
      commission: String(policy.commission_bps / 100),
      pincodes: policy.pincodes.join(", "),
      blocked: policy.blocked_category_ids.join(", "),
      maxOrder: policy.max_order_minor ? String(policy.max_order_minor / 100) : "",
      buyerCap: policy.buyer_daily_cap_minor
        ? String(policy.buyer_daily_cap_minor / 100)
        : "",
      sellerCap: policy.seller_daily_cap_minor
        ? String(policy.seller_daily_cap_minor / 100)
        : "",
      fee: String(policy.cod_fee_minor / 100),
    });
    setNotice("");
  };

  const savePolicy = async () => {
    if (!editing) return;
    setError("");
    try {
      const minor = (value: string) => {
        if (!value.trim()) return null;
        const parsed = Math.round(Number(value) * 100);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      };
      await api("/admin/buildkart/cod/policies", {
        method: "POST",
        body: JSON.stringify({
          seller_id: editing.seller_id,
          enabled: form.enabled === "true",
          commission_bps: Math.round(Number(form.commission || "3") * 100),
          pincodes: form.pincodes
            .split(",")
            .map((value) => value.replace(/\D/g, ""))
            .filter(Boolean),
          blocked_category_ids: form.blocked
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          max_order_minor: minor(form.maxOrder),
          buyer_daily_cap_minor: minor(form.buyerCap),
          seller_daily_cap_minor: minor(form.sellerCap),
          cod_fee_minor: minor(form.fee) ?? 0,
        }),
      });
      setNotice(`Saved ${editing.seller_id}.`);
      setEditing(null);
      await loadPolicies();
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const exportCsv = () => {
    const rows = statements.flatMap((statement) =>
      statement.entries.map((entry) => ({
        seller_id: statement.seller_id,
        period: entry.period,
        kind: entry.kind,
        amount_minor: entry.amount_minor,
        source_ref: entry.source_ref ?? "",
        note: entry.note ?? "",
      })),
    );
    const header = ["seller_id", "period", "kind", "amount_minor", "source_ref", "note"];
    const csv = [
      header.join(","),
      ...rows.map((row) =>
        header.map((key) => `"${String(row[key as keyof typeof row]).replaceAll('"', '""')}"`).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `bazarbee-cod-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <div>
              <Heading level="h1">Cash on delivery</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Seller opt-in, cash collection, dues and TCS.
              </Text>
            </div>
            <div className="flex gap-2">
              <Button
                size="small"
                variant={tab === "collections" ? "primary" : "secondary"}
                onClick={() => setTab("collections")}
              >
                Collections ({collections.length})
              </Button>
              <Button
                size="small"
                variant={tab === "policies" ? "primary" : "secondary"}
                onClick={() => setTab("policies")}
              >
                Policies ({policies.length})
              </Button>
              <Button
                size="small"
                variant={tab === "statements" ? "primary" : "secondary"}
                onClick={() => setTab("statements")}
              >
                Dues
              </Button>
            </div>
          </div>
          {error ? (
            <Text size="small" className="px-6 pb-4 text-ui-fg-error">
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text size="small" className="px-6 pb-4 text-ui-fg-subtle">
              {notice}
            </Text>
          ) : null}
        </Container>

        {tab === "collections" ? (
          <Container className="p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order group</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Expected</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Collected</Table.HeaderCell>
                  <Table.HeaderCell>Collector</Table.HeaderCell>
                  <Table.HeaderCell>Proof</Table.HeaderCell>
                  <Table.HeaderCell>Recorded</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {collections.map((collection) => (
                  <Table.Row key={collection.id}>
                    <Table.Cell>
                      <Text size="small" weight="plus">
                        {collection.order_group_id}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={statusColor(collection.status)}>
                        {collection.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(collection.expected_minor, collection.currency)}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {money(collection.collected_minor, collection.currency)}
                    </Table.Cell>
                    <Table.Cell>{collection.collector_kind ?? "—"}</Table.Cell>
                    <Table.Cell>{collection.proof_ref ?? "—"}</Table.Cell>
                    <Table.Cell>
                      {collection.collected_at
                        ? new Date(collection.collected_at).toLocaleString("en-IN")
                        : "—"}
                    </Table.Cell>
                  </Table.Row>
                ))}
                {collections.length === 0 ? (
                  <Table.Row>
                    <Table.Cell>
                      <Text size="small" className="text-ui-fg-subtle">
                        No COD collections yet.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : null}
              </Table.Body>
            </Table>
          </Container>
        ) : null}

        {tab === "policies" ? (
          <Container className="p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Seller</Table.HeaderCell>
                  <Table.HeaderCell>Enabled</Table.HeaderCell>
                  <Table.HeaderCell>Commission</Table.HeaderCell>
                  <Table.HeaderCell>Per order cap</Table.HeaderCell>
                  <Table.HeaderCell>Pincodes</Table.HeaderCell>
                  <Table.HeaderCell />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {policies.map((policy) => (
                  <Table.Row key={policy.seller_id}>
                    <Table.Cell>{policy.seller_id}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={policy.enabled ? "green" : "grey"}>
                        {policy.enabled ? "On" : "Off"}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{(policy.commission_bps / 100).toFixed(2)}%</Table.Cell>
                    <Table.Cell>
                      {policy.max_order_minor
                        ? money(policy.max_order_minor)
                        : "Global cap"}
                    </Table.Cell>
                    <Table.Cell>
                      {policy.pincodes.length ? policy.pincodes.join(", ") : "All"}
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      <Button size="small" variant="secondary" onClick={() => startEdit(policy)}>
                        Edit
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
            {editing ? (
              <div className="grid grid-cols-1 gap-4 border-t border-ui-border-base px-6 py-5 md:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <Text size="xsmall">Enabled (true / false)</Text>
                  <Input
                    value={form.enabled}
                    onChange={(event) => setForm({ ...form, enabled: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Text size="xsmall">Commission %</Text>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.commission}
                    onChange={(event) => setForm({ ...form, commission: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Text size="xsmall">COD fee ₹</Text>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.fee}
                    onChange={(event) => setForm({ ...form, fee: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Text size="xsmall">Per-order cap ₹</Text>
                  <Input
                    type="number"
                    value={form.maxOrder}
                    onChange={(event) => setForm({ ...form, maxOrder: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Text size="xsmall">Buyer daily cap ₹</Text>
                  <Input
                    type="number"
                    value={form.buyerCap}
                    onChange={(event) => setForm({ ...form, buyerCap: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <Text size="xsmall">Seller daily cap ₹</Text>
                  <Input
                    type="number"
                    value={form.sellerCap}
                    onChange={(event) => setForm({ ...form, sellerCap: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <Text size="xsmall">Pincodes (comma separated, blank = all)</Text>
                  <Input
                    value={form.pincodes}
                    onChange={(event) => setForm({ ...form, pincodes: event.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-3">
                  <Text size="xsmall">Blocked category ids (comma separated)</Text>
                  <Input
                    value={form.blocked}
                    onChange={(event) => setForm({ ...form, blocked: event.target.value })}
                  />
                </label>
                <div className="flex gap-2 md:col-span-3">
                  <Button size="small" onClick={() => void savePolicy()}>
                    Save policy
                  </Button>
                  <Button size="small" variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </Container>
        ) : null}

        {tab === "statements" ? (
          <Container className="p-0">
            <div className="flex flex-wrap items-end gap-3 px-6 py-5">
              <label className="flex flex-col gap-1">
                <Text size="xsmall">Period</Text>
                <Input
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  placeholder="2026-11"
                />
              </label>
              <Button size="small" onClick={() => void loadStatements(period)}>
                Load
              </Button>
              <Button size="small" variant="secondary" onClick={exportCsv}>
                Export CSV
              </Button>
            </div>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Seller</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Commission</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">GST on commission</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">TCS</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Total due</Table.HeaderCell>
                  <Table.HeaderCell>TCS source</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {statements.map((statement) => {
                  const sum = (kind: string) =>
                    statement.entries
                      .filter((entry) => entry.kind === kind)
                      .reduce((total, entry) => total + entry.amount_minor, 0);
                  return (
                    <Table.Row key={statement.seller_id}>
                      <Table.Cell>{statement.seller_id}</Table.Cell>
                      <Table.Cell className="text-right">{money(sum("commission"))}</Table.Cell>
                      <Table.Cell className="text-right">
                        {money(sum("gst_on_commission"))}
                      </Table.Cell>
                      <Table.Cell className="text-right">{money(sum("tcs"))}</Table.Cell>
                      <Table.Cell className="text-right">
                        {money(statement.total_due_minor)}
                      </Table.Cell>
                      <Table.Cell>
                        {statement.tcs_pending
                          ? "Pending product rate"
                          : statement.tcs_default_rate_applied
                            ? "18% default"
                            : "Product rate"}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
                {statements.length === 0 ? (
                  <Table.Row>
                    <Table.Cell>
                      <Text size="small" className="text-ui-fg-subtle">
                        No dues for this period.
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ) : null}
              </Table.Body>
            </Table>
          </Container>
        ) : null}
      </div>
    </SingleColumnPage>
  );
}
