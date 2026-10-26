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

type SkuOffer = {
  offer_id: string | null;
  in_stock: boolean | null;
  evaluated: boolean;
  visible: boolean | null;
};

type SkuOption = {
  variant_id: string;
  variant_title: string;
  sku: string;
  offer_id: string | null;
  in_stock: boolean | null;
  channels: { b2c: SkuOffer; b2b: SkuOffer };
  active_pairs: {
    b2c: { pair_id: string; paired_variant_id: string | null; paired_product_id: string } | null;
    b2b: { pair_id: string; paired_variant_id: string | null; paired_product_id: string } | null;
  };
};

type Candidate = {
  id: string;
  title: string;
  thumbnail?: string | null;
  sku_count: number;
  status: string;
  channel_ready: { b2c: boolean | null; b2b: boolean | null };
  matching_skus: SkuOption[];
};

type PairProduct = {
  id: string;
  title: string;
  thumbnail?: string | null;
  sku_count: number;
  variant_id: string | null;
  variant_title: string | null;
  sku: string | null;
  status: "published" | "unavailable";
  channel_ready: { b2c: boolean; b2b: boolean };
  variant_channel_ready: { b2c: boolean | null; b2b: boolean | null };
};

type Pair = {
  id: string;
  product_a_id: string;
  product_b_id: string;
  variant_a_id: string | null;
  variant_b_id: string | null;
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

type Selection = {
  productId: string;
  variantId: string;
  title: string;
  sku: string;
  thumbnail?: string | null;
  channelReady: { b2c: boolean | null; b2b: boolean | null };
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

async function listPairs(): Promise<Pair[]> {
  return request<Pair[]>(`${API}?limit=100`);
}

async function listCandidates(query: string, channel: Channel): Promise<Candidate[]> {
  const params = new URLSearchParams({ query, channel });
  return request<Candidate[]>(`${API}/candidates?${params.toString()}`);
}

async function createPair(input: {
  product_a_id: string;
  product_b_id: string;
  variant_a_id: string;
  variant_b_id: string;
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
    variant_a_id?: string;
    variant_b_id?: string;
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

const titleCase = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

function Thumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        aria-label={alt}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ui-bg-subtle text-[9px] text-ui-fg-muted"
      >
        N/A
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-8 w-8 shrink-0 rounded object-cover"
      onError={() => setFailed(true)}
    />
  );
}

function readiness(value: boolean | null) {
  return value === false ? "⚠" : value === true ? "✓" : "–";
}

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
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [pairQuery, setPairQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Pair | null>(null);
  const [selectedA, setSelectedA] = useState<Selection | null>(null);
  const [selectedB, setSelectedB] = useState<Selection | null>(null);
  const [activeSlot, setActiveSlot] = useState<"a" | "b">("a");
  const [channel, setChannel] = useState<Channel>("b2c");
  const [status, setStatus] = useState<Status>("draft");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateRefresh, setCandidateRefresh] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditFor, setAuditFor] = useState<string | null>(null);

  const pairs = useQuery({
    queryKey: ["buildkart", "bought-together", "all"],
    queryFn: listPairs,
  });

  const candidates = useQuery({
    queryKey: [
      "buildkart",
      "bought-together",
      "candidates",
      candidateQuery,
      channel,
      candidateRefresh,
    ],
    queryFn: () => listCandidates(candidateQuery, channel),
    enabled: editorOpen,
  });

  const openCreate = () => {
    setEditing(null);
    setSelectedA(null);
    setSelectedB(null);
    setActiveSlot("a");
    setChannel("b2c");
    setStatus("draft");
    setEditorOpen(true);
    setError("");
    setAudit(null);
    setCandidateQuery("");
  };

  const openEdit = (pair: Pair) => {
    setEditing(pair);
    const [a, b] = pair.products;
    setSelectedA(
      a
        ? {
            productId: a.id,
            variantId: a.variant_id ?? "",
            title: a.title,
            sku: a.sku ?? "",
            thumbnail: a.thumbnail,
            channelReady: a.variant_channel_ready,
          }
        : null,
    );
    setSelectedB(
      b
        ? {
            productId: b.id,
            variantId: b.variant_id ?? "",
            title: b.title,
            sku: b.sku ?? "",
            thumbnail: b.thumbnail,
            channelReady: b.variant_channel_ready,
          }
        : null,
    );
    setActiveSlot("a");
    setChannel(pair.channel);
    setStatus(pair.status);
    setEditorOpen(true);
    setError("");
    setAudit(null);
  };

  const selectSku = (candidate: Candidate, sku: SkuOption) => {
    const selection: Selection = {
      productId: candidate.id,
      variantId: sku.variant_id,
      title: candidate.title,
      sku: sku.sku,
      thumbnail: candidate.thumbnail,
      channelReady: {
        b2c: sku.channels.b2c.visible !== false && sku.channels.b2c.in_stock !== false,
        b2b: sku.channels.b2b.visible !== false && sku.channels.b2b.in_stock !== false,
      },
    };
    if (activeSlot === "a") {
      setSelectedA(selection);
      setActiveSlot("b");
    } else {
      setSelectedB(selection);
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (!selectedA || !selectedB) throw new Error("Select two SKUs.");
      if (!selectedA.variantId || !selectedB.variantId) {
        throw new Error("Both selections must be a SKU.");
      }
      if (selectedA.productId === selectedB.productId) {
        throw new Error("A product cannot be paired with itself.");
      }
      if (selectedA.variantId === selectedB.variantId) {
        throw new Error("A SKU cannot be paired with itself.");
      }
      if (editing) {
        await patchPair(editing, {
          product_a_id: selectedA.productId,
          product_b_id: selectedB.productId,
          variant_a_id: selectedA.variantId,
          variant_b_id: selectedB.variantId,
          channel,
          status,
        });
      } else {
        await createPair({
          product_a_id: selectedA.productId,
          product_b_id: selectedB.productId,
          variant_a_id: selectedA.variantId,
          variant_b_id: selectedB.variantId,
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
      if (
        next === "archived" &&
        !window.confirm("Archive this pair? Archived pairs cannot be restored.")
      ) {
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

  const allPairs = pairs.data ?? [];
  const counters = {
    active: allPairs.filter((pair) => pair.status === "active").length,
    paused: allPairs.filter((pair) => pair.status === "paused").length,
    attention: allPairs.filter((pair) => pair.health !== "ready").length,
    draft: allPairs.filter((pair) => pair.status === "draft").length,
  };

  const normalizedPairQuery = pairQuery.trim().toLowerCase();
  const visiblePairs = allPairs.filter((pair) => {
    if (statusFilter !== "all" && pair.status !== statusFilter) return false;
    if (channelFilter !== "all") {
      const matches =
        pair.channel === channelFilter ||
        (pair.channel === "both" && (channelFilter === "b2c" || channelFilter === "b2b"));
      if (!matches) return false;
    }
    if (attentionOnly && pair.health === "ready") return false;
    if (!normalizedPairQuery) return true;
    return pair.products.some(
      (product) =>
        product.title.toLowerCase().includes(normalizedPairQuery) ||
        (product.sku ?? "").toLowerCase().includes(normalizedPairQuery),
    );
  });

  const counterButton = (
    label: string,
    value: number,
    onClick: () => void,
    active: boolean,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left ${
        active ? "border-ui-border-interactive bg-ui-bg-highlight" : "border-ui-border-base bg-ui-bg-base"
      }`}
    >
      <Text size="xsmall" className="text-ui-fg-subtle">{label}</Text>
      <Text size="small" weight="plus">{value}</Text>
    </button>
  );

  return (
    <SingleColumnPage>
      <Container className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div>
            <Heading>Bought together</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Pick two SKUs. Each SKU&apos;s product page shows the other above Related products.
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

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(["a", "b"] as const).map((slot) => {
              const selection = slot === "a" ? selectedA : selectedB;
              return (
                <div
                  key={slot}
                  className={`rounded-lg border p-3 ${
                    activeSlot === slot ? "border-ui-border-interactive" : "border-ui-border-base"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Text size="small" weight="plus">SKU {slot.toUpperCase()}</Text>
                    <Button
                      size="small"
                      variant={activeSlot === slot ? "primary" : "secondary"}
                      onClick={() => setActiveSlot(slot)}
                    >
                      {selection ? "Replace" : "Pick"}
                    </Button>
                  </div>
                  {selection ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Thumb src={selection.thumbnail} alt={selection.title} />
                      <div className="min-w-0">
                        <Text size="small" className="truncate">{selection.title}</Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {selection.sku} · B2C {readiness(selection.channelReady.b2c)} · B2B{" "}
                          {readiness(selection.channelReady.b2b)}
                        </Text>
                      </div>
                      <Button
                        size="small"
                        variant="transparent"
                        onClick={() => (slot === "a" ? setSelectedA(null) : setSelectedB(null))}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
                      Search below and select a SKU.
                    </Text>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <Text size="small" weight="plus">
              Search SKUs {activeSlot === "a" ? "for A" : "for B"}
            </Text>
            <div className="flex gap-2">
              <Input
                value={candidateQuery}
                onChange={(event) => setCandidateQuery(event.target.value)}
                placeholder="SKU, product title or brand"
              />
              <Button
                size="small"
                variant="secondary"
                onClick={() => setCandidateRefresh((value) => value + 1)}
              >
                Search
              </Button>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-ui-border-base">
              {(candidates.data ?? []).length === 0 ? (
                <div className="px-3 py-2">
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {candidates.isFetching ? "Searching…" : "No published SKUs match."}
                  </Text>
                </div>
              ) : (
                (candidates.data ?? []).map((candidate) => (
                  <div key={candidate.id} className="border-b border-ui-border-base px-3 py-2 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <Thumb src={candidate.thumbnail} alt={candidate.title} />
                      <Text size="small" weight="plus" className="truncate">{candidate.title}</Text>
                    </div>
                    <div className="mt-1 flex flex-col gap-1">
                      {candidate.matching_skus.map((sku) => {
                        const existing =
                          channel === "b2c"
                            ? sku.active_pairs.b2c
                            : channel === "b2b"
                              ? sku.active_pairs.b2b
                              : null;
                        const alreadySelected =
                          sku.variant_id === selectedA?.variantId ||
                          sku.variant_id === selectedB?.variantId;
                        return (
                          <div
                            key={sku.variant_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 hover:bg-ui-bg-subtle"
                          >
                            <div className="min-w-0">
                              <Text size="xsmall" className="truncate">
                                {sku.sku || sku.variant_title || sku.variant_id}
                              </Text>
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                B2C {readiness(sku.channels.b2c.visible !== false && sku.channels.b2c.in_stock !== false)} ·
                                B2B {readiness(sku.channels.b2b.visible !== false && sku.channels.b2b.in_stock !== false)}
                                {existing ? " · already paired" : ""}
                              </Text>
                            </div>
                            <Button
                              size="small"
                              variant="secondary"
                              disabled={alreadySelected || Boolean(existing)}
                              onClick={() => selectSku(candidate, sku)}
                            >
                              {existing ? "Paired" : "Select"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
          </div>

          <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <Text size="small" className="text-ui-fg-subtle">Preview</Text>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm">
                {selectedA ? `${selectedA.title} · ${selectedA.sku}` : "SKU A"}
              </div>
              <Text>+</Text>
              <div className="rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm">
                {selectedB ? `${selectedB.title} · ${selectedB.sku}` : "SKU B"}
              </div>
            </div>
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              The pair is reciprocal and appears only on the two selected SKUs.
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
        <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
          {counterButton("Active", counters.active, () => {
            setStatusFilter("active");
            setAttentionOnly(false);
          }, statusFilter === "active" && !attentionOnly)}
          {counterButton("Paused", counters.paused, () => {
            setStatusFilter("paused");
            setAttentionOnly(false);
          }, statusFilter === "paused" && !attentionOnly)}
          {counterButton("Needs attention", counters.attention, () => {
            setStatusFilter("all");
            setAttentionOnly(true);
          }, attentionOnly)}
          {counterButton("Draft", counters.draft, () => {
            setStatusFilter("draft");
            setAttentionOnly(false);
          }, statusFilter === "draft" && !attentionOnly)}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-3">
          <Input
            value={pairQuery}
            onChange={(event) => setPairQuery(event.target.value)}
            placeholder="Search SKU or product"
            className="w-56"
          />
          <select
            className="h-8 rounded-md border border-ui-border-base bg-ui-bg-field px-3 text-sm"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setAttentionOnly(false);
            }}
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
            {visiblePairs.length} pair{visiblePairs.length === 1 ? "" : "s"}
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
            {visiblePairs.map((pair) => {
              const showB2bWarning =
                (pair.channel === "b2b" || pair.channel === "both") &&
                pair.products.some((product) => product.variant_channel_ready.b2b === false);
              return (
                <Table.Row key={pair.id}>
                  <Table.Cell>
                    <div className="flex flex-wrap items-center gap-3">
                      {pair.products.map((product, index) => (
                        <div key={`${product.id}-${index}`} className="flex items-center gap-2">
                          {index > 0 ? <Text size="small" className="text-ui-fg-muted">+</Text> : null}
                          <Thumb src={product.thumbnail} alt={product.title} />
                          <div className="min-w-0">
                            <Text size="small" className="truncate">{product.title}</Text>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              {product.sku ?? `${product.sku_count} SKUs`}
                            </Text>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    {pair.channel === "both" ? "B2C + B2B" : pair.channel.toUpperCase()}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={statusColor(pair.status)}>
                      {titleCase(pair.status)}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge color={healthColor(pair.health)}>
                        {titleCase(pair.health)}
                      </StatusBadge>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        B2C {titleCase(pair.health_by_channel.b2c)}
                        {showB2bWarning ? " · B2B ⚠ no trade price" : ` · B2B ${titleCase(pair.health_by_channel.b2b)}`}
                      </Text>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="small" className="text-ui-fg-subtle">
                      {pair.updated_by} · {formatDate(pair.updated_at)}
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
                      {pair.products[0] ? (
                        <a
                          className="self-center px-1 text-sm text-ui-fg-interactive hover:underline"
                          href={`/products/${pair.products[0].id}`}
                        >
                          Preview
                        </a>
                      ) : null}
                    </div>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>

        {visiblePairs.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              No pairs yet. Pick two SKUs to show them together on both product pages.
            </Text>
          </div>
        ) : null}

        <div className="px-6 py-3">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Ready = both SKUs published and channel-eligible. Needs attention = out of stock or
            unavailable. A B2B pair also needs a trade price.
          </Text>
        </div>
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
