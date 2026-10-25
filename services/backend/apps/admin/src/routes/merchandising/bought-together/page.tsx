import { PlusMini } from "@medusajs/icons";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

declare const __BACKEND_URL__: string;

type Channel = "b2c" | "b2b" | "both";
type Status = "draft" | "active" | "paused" | "archived";
type Health = "ready" | "out_of_stock" | "unavailable";

type Candidate = {
  id: string;
  title: string;
  thumbnail?: string | null;
  sku_count: number;
  status: string;
  channel_ready: { b2c: boolean; b2b: boolean };
};

type PairProduct = Candidate & {
  status: "published" | "unavailable";
};

type Pair = {
  id: string;
  product_a_id: string;
  product_b_id: string;
  channel: Channel;
  status: Status;
  version: number;
  products: PairProduct[];
  health: Health;
  health_by_channel: { b2c: Health; b2b: Health };
  updated_by: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  actor_id: string;
  correlation_id?: string | null;
  created_at: string;
};

const backend = __BACKEND_URL__.replace(/\/$/, "");
const API = `${backend}/admin/buildkart/merchandising/bought-together`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    detail?: string;
    items?: T;
    pair?: T;
  };
  if (!response.ok) {
    throw new Error(body.detail ?? body.message ?? `Request failed (${response.status}).`);
  }
  return (body.items ?? body.pair ?? body) as T;
}

async function listPairs(filter: {
  status: string;
  channel: string;
}): Promise<Pair[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (filter.status !== "all") params.set("status", filter.status);
  if (filter.channel !== "all") params.set("channel", filter.channel);
  return request<Pair[]>(`${API}?${params.toString()}`);
}

async function listCandidates(query: string, channel: Channel): Promise<Candidate[]> {
  const params = new URLSearchParams({
    query,
    channel: channel === "both" ? "b2c" : channel,
  });
  return request<Candidate[]>(`${API}/candidates?${params.toString()}`);
}

async function createPair(input: {
  product_a_id: string;
  product_b_id: string;
  channel: Channel;
  status: Status;
}): Promise<void> {
  await request(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

async function patchPair(
  pair: Pair,
  patch: Partial<Pick<Pair, "status" | "channel">> & {
    product_a_id?: string;
    product_b_id?: string;
  },
): Promise<void> {
  await request(`${API}/${encodeURIComponent(pair.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expected_version: pair.version, ...patch }),
  });
}

async function readAudit(pairId: string): Promise<AuditRow[]> {
  return request<AuditRow[]>(`${API}/${encodeURIComponent(pairId)}/audit`);
}

const healthColor = (health: Health) =>
  health === "ready" ? "green" : health === "out_of_stock" ? "orange" : "red";

const statusColor = (status: Status) =>
  status === "active" ? "green" : status === "paused" ? "orange" : "grey";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Bought together",
  rank: 4,
  nested: "/merchandising",
};

export default function BoughtTogetherPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Pair | null>(null);
  const [productA, setProductA] = useState("");
  const [productB, setProductB] = useState("");
  const [channel, setChannel] = useState<Channel>("b2c");
  const [status, setStatus] = useState<Status>("draft");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateRefresh, setCandidateRefresh] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditFor, setAuditFor] = useState<string | null>(null);

  const pairs = useQuery({
    queryKey: ["buildkart", "bought-together", statusFilter, channelFilter],
    queryFn: () => listPairs({ status: statusFilter, channel: channelFilter }),
  });

  const candidates = useQuery({
    queryKey: ["buildkart", "bought-together", "candidates", candidateQuery, channel, candidateRefresh],
    queryFn: () => listCandidates(candidateQuery, channel),
  });

  const openCreate = () => {
    setEditing(null);
    setProductA("");
    setProductB("");
    setChannel("b2c");
    setStatus("draft");
    setEditorOpen(true);
    setError("");
    setAudit(null);
  };

  const openEdit = (pair: Pair) => {
    setEditing(pair);
    setProductA(pair.product_a_id);
    setProductB(pair.product_b_id);
    setChannel(pair.channel);
    setStatus(pair.status);
    setEditorOpen(true);
    setError("");
    setAudit(null);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (!productA || !productB) throw new Error("Select two products.");
      if (productA === productB) throw new Error("A product cannot be paired with itself.");
      if (editing) {
        await patchPair(editing, {
          product_a_id: productA,
          product_b_id: productB,
          channel,
          status,
        });
      } else {
        await createPair({
          product_a_id: productA,
          product_b_id: productB,
          channel,
          status,
        });
      }
      setEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["buildkart", "bought-together"] });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const transition = async (pair: Pair, next: Status) => {
    setError("");
    try {
      if (next === "archived" && !window.confirm("Archive this pair? Archived pairs cannot be restored.")) {
        return;
      }
      await patchPair(pair, { status: next });
      await queryClient.invalidateQueries({ queryKey: ["buildkart", "bought-together"] });
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const showAudit = async (pair: Pair) => {
    setError("");
    try {
      setAudit(await readAudit(pair.id));
      setAuditFor(pair.id);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const productLabel = (id: string) =>
    candidates.data?.find((candidate) => candidate.id === id)?.title ??
    pairs.data?.find((pair) => pair.products.some((product) => product.id === id))?.products.find((product) => product.id === id)?.title ??
    id;

  return (
    <SingleColumnPage>
      <Container className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div>
            <Heading>Bought together</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Pair two products. Each product page shows the other above Related products.
            </Text>
          </div>
          <Button size="small" onClick={openCreate}>
            <PlusMini /> New pair
          </Button>
        </div>
      </Container>

      {error ? (
        <Container className="border-ui-border-error bg-ui-bg-error">
          <Text size="small" className="text-ui-fg-error">{error}</Text>
        </Container>
      ) : null}

      {editorOpen ? (
        <Container className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Heading level="h2">{editing ? "Edit pair" : "New pair"}</Heading>
            <Button size="small" variant="transparent" onClick={() => setEditorOpen(false)}>
              Close
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">Product A</span>
              <select
                className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
                value={productA}
                onChange={(event) => setProductA(event.target.value)}
              >
                <option value="">Select product A</option>
                {(candidates.data ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title} · {candidate.sku_count} SKU{candidate.sku_count === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">Product B</span>
              <select
                className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
                value={productB}
                onChange={(event) => setProductB(event.target.value)}
              >
                <option value="">Select product B</option>
                {(candidates.data ?? [])
                  .filter((candidate) => candidate.id !== productA)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title} · {candidate.sku_count} SKU{candidate.sku_count === 1 ? "" : "s"}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">Channel</span>
              <select
                className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
              >
                <option value="b2c">B2C</option>
                <option value="b2b">B2B</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">Status</span>
              <select
                className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ui-fg-subtle">Find products</span>
              <div className="flex gap-2">
                <Input
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  placeholder="Title or SKU"
                />
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setCandidateRefresh((value) => value + 1)}
                >
                  Search
                </Button>
              </div>
            </label>
          </div>
          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <Text size="small" className="text-ui-fg-subtle">Preview</Text>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm">
                {productA ? productLabel(productA) : "Product A"}
              </div>
              <Text>+</Text>
              <div className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm">
                {productB ? productLabel(productB) : "Product B"}
              </div>
            </div>
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              A ↔ B. Both product pages show the other product; channel prices are composed at read time.
            </Text>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="small" variant="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="small" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save pair"}
            </Button>
          </div>
        </Container>
      ) : null}

      <Container className="p-0">
        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <select
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <select
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
          >
            <option value="all">All channels</option>
            <option value="b2c">B2C</option>
            <option value="b2b">B2B</option>
            <option value="both">Both</option>
          </select>
          <Text size="small" className="text-ui-fg-subtle">
            {pairs.data?.length ?? 0} pair{(pairs.data?.length ?? 0) === 1 ? "" : "s"}
          </Text>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Pair</Table.HeaderCell>
              <Table.HeaderCell>Channel</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Health</Table.HeaderCell>
              <Table.HeaderCell>Updated</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(pairs.data ?? []).map((pair) => (
              <Table.Row key={pair.id}>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    {pair.products.map((product) => (
                      <div key={product.id} className="flex items-center gap-2">
                        {product.thumbnail ? (
                          <img src={product.thumbnail} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : null}
                        <Text size="small">{product.title}</Text>
                      </div>
                    ))}
                  </div>
                </Table.Cell>
                <Table.Cell>{pair.channel === "both" ? "B2C + B2B" : pair.channel.toUpperCase()}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={statusColor(pair.status)}>{pair.status}</StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={healthColor(pair.health)}>{pair.health.replaceAll("_", " ")}</StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-subtle">
                    {pair.updated_by} · {new Date(pair.updated_at).toLocaleDateString()}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Button size="small" variant="transparent" onClick={() => openEdit(pair)}>
                      Edit
                    </Button>
                    {pair.status === "active" ? (
                      <Button size="small" variant="transparent" onClick={() => transition(pair, "paused")}>
                        Pause
                      </Button>
                    ) : pair.status !== "archived" ? (
                      <Button size="small" variant="transparent" onClick={() => transition(pair, "active")}>
                        Activate
                      </Button>
                    ) : null}
                    {pair.status !== "archived" ? (
                      <Button size="small" variant="transparent" onClick={() => transition(pair, "archived")}>
                        Archive
                      </Button>
                    ) : null}
                    <Button size="small" variant="transparent" onClick={() => showAudit(pair)}>
                      Audit
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {pairs.data?.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              No pairs yet. Pair two products to show them together on both product pages.
            </Text>
          </div>
        ) : null}
      </Container>

      {audit && auditFor ? (
        <Container className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Heading level="h2">Audit</Heading>
            <Button size="small" variant="transparent" onClick={() => setAudit(null)}>
              Close
            </Button>
          </div>
          {audit.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">No audit entries.</Text>
          ) : (
            audit.map((row) => (
              <div key={row.id} className="rounded-md border border-ui-border-base px-3 py-2 text-sm">
                <Text size="small">{row.action} · {row.actor_id}</Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {new Date(row.created_at).toLocaleString()} {row.correlation_id ? `· ${row.correlation_id}` : ""}
                </Text>
              </div>
            ))
          )}
        </Container>
      ) : null}
    </SingleColumnPage>
  );
}
