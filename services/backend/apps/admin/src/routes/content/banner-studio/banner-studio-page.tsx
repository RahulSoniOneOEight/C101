import { ArchiveBox, ArrowUpTray, Eye, PencilSquare, SquareTwoStack } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  StatusBadge,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui";
import { ActionMenu, SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { client } from "../../../lib/client";
import { CONTENT_LOCALES, PAGE_SIZE, statusColor, statusLabel, type ContentDocument, type ContentLocale } from "../content-model";
import { PageTabs } from "../content-operations";
import {
  PLACEMENT_LABELS,
  audienceLabel,
  bannerKey,
  bannerTitle,
  displayEligibility,
  DISPLAY_COLORS,
  DISPLAY_LABELS,
  placementLabel,
  scheduleLabel,
} from "./banner-model";
import { BannerEditor } from "./banner-editor";

type StudioView = "all" | "modified" | "draft" | "published" | "scheduled";

const PLACEMENT_FILTER_OPTIONS = Object.entries(PLACEMENT_LABELS);

function BannerThumb({ document }: { document: ContentDocument }) {
  const [failed, setFailed] = useState(false);
  const source = typeof document.externalImageUrl === "string" ? document.externalImageUrl : "";
  const usable = /^https:\/\//i.test(source) && !failed;
  if (usable) {
    return (
      <img
        src={source}
        alt=""
        className="h-10 w-16 rounded border border-ui-border-base object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-10 w-16 items-center justify-center rounded border border-ui-border-base bg-ui-bg-subtle">
      <Text size="xsmall" className="text-ui-fg-subtle">No art</Text>
    </div>
  );
}

export function BannerStudioPage() {
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const [searchParams, setSearchParams] = useSearchParams();

  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const requestedView = searchParams.get("view");
  const view: StudioView = requestedView === "modified"
    || requestedView === "draft"
    || requestedView === "published"
    || requestedView === "scheduled"
    ? requestedView
    : "all";
  const search = searchParams.get("q") ?? "";
  const placementFilter = searchParams.get("placement") ?? "";
  const audienceFilter = searchParams.get("audience") ?? "";
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const editorParam = searchParams.get("editor");
  const editorDocumentId = editorParam && editorParam !== "new" ? editorParam : null;

  const queryKey = ["buildkart", "cms-content", "banner", locale];
  const contentQuery = useQuery({
    queryKey,
    queryFn: () => client.admin.buildkart.content.query({ kind: "banner", locale }),
  });
  const documents = contentQuery.data?.documents ?? [];

  const updateParams = (values: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => {
      if (!value || value === "all" || (key === "locale" && value === "en-IN")) next.delete(key);
      else next.set(key, value);
    });
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const openEditor = (documentId: string | "new") => {
    updateParams({ editor: documentId });
  };
  const closeEditor = () => {
    updateParams({ editor: null });
  };

  const now = useMemo(() => new Date(), []);
  const eligibilityOf = (document: ContentDocument) => displayEligibility(document, now);

  const counts = {
    all: documents.length,
    modified: documents.filter((item) => item.publicationStatus === "modified").length,
    draft: documents.filter((item) => item.publicationStatus === "draft").length,
    published: documents.filter((item) => item.publicationStatus === "published").length,
    scheduled: documents.filter((item) => item.publicationStatus !== "draft")
      .filter((item) => eligibilityOf(item) === "scheduled").length,
  };
  const totalPublishedOrChanged = documents.filter((item) => item.publicationStatus !== "draft").length;

  const term = search.trim().toLocaleLowerCase();
  const filtered = documents
    .filter((item) => {
      if (view === "all") return true;
      if (view === "scheduled") return item.publicationStatus !== "draft" && eligibilityOf(item) === "scheduled";
      return item.publicationStatus === view;
    })
    .filter((item) => (placementFilter ? item.placement === placementFilter : true))
    .filter((item) => (audienceFilter
      ? typeof item.audience === "string" && (item.audience === audienceFilter || item.audience === "both")
      : true))
    .filter((item) => {
      if (!term) return true;
      return [bannerTitle(item), bannerKey(item), item.documentId, placementLabel(item.placement),
        audienceLabel(item.audience), item.publishedAt ? String(item.publishedAt) : ""]
        .join(" ").toLocaleLowerCase().includes(term);
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const publicationMutation = useMutation({
    mutationFn: (input: { operation: "publish" | "unpublish"; documentId: string }) =>
      client.admin.buildkart.content.mutate({ kind: "banner", locale, ...input }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(input.operation === "publish" ? "Banner published" : "Banner unpublished");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The banner operation failed.");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (documentId: string) => client.admin.buildkart.content.mutate({
      kind: "banner",
      locale,
      operation: "duplicate-draft",
      documentId,
    }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Duplicated as a new draft. Nothing was published.");
      const created = result?.document?.documentId;
      if (typeof created === "string") openEditor(created);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The banner could not be duplicated.");
    },
  });

  const changePublication = async (document: ContentDocument, operation: "publish" | "unpublish") => {
    const label = bannerTitle(document);
    const confirmed = await prompt({
      title: operation === "publish" ? "Publish this banner?" : "Unpublish this banner?",
      description: operation === "publish"
        ? `${label} becomes eligible for delivery. Any start or end window still applies.`
        : `${label} is removed from live CMS delivery. The draft is kept.`,
      confirmText: operation === "publish" ? "Publish" : "Unpublish",
      cancelText: "Cancel",
      variant: operation === "publish" ? "confirmation" : "danger",
    });
    if (confirmed) {
      publicationMutation.mutate({ operation, documentId: document.documentId });
    }
  };

  const editingDocument = editorDocumentId
    ? documents.find((item) => item.documentId === editorDocumentId)
    : undefined;

  const tabRoute = (nextView: StudioView) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    next.delete("page");
    next.delete("editor");
    const query = next.toString();
    return `/merchandising/banners${query ? `?${query}` : ""}`;
  };

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Banner studio</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Create the moments your customers see. Editing here changes presentation only.
              </Text>
            </div>
            <Button
              size="small"
              onClick={() => openEditor("new")}
              disabled={contentQuery.isError}
              data-testid="create-banner"
            >
              Create banner
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
            {([
              ["Total banners", counts.all],
              ["Published or changed", totalPublishedOrChanged],
              ["Scheduled", counts.scheduled],
              ["Drafts", counts.draft],
            ] as Array<[string, number]>).map(([label, value]) => (
              <div key={label}>
                <Text size="xsmall" className="text-ui-fg-subtle">{label}</Text>
                <Text size="large" weight="plus">{contentQuery.isPending ? "—" : value}</Text>
              </div>
            ))}
          </div>
        </Container>

        <Container className="overflow-hidden p-0">
          <PageTabs
            label="Banner publication status"
            active={view}
            tabs={[
              { value: "all", label: "All", count: counts.all, to: tabRoute("all") },
              { value: "modified", label: "Needs review", count: counts.modified, to: tabRoute("modified") },
              { value: "draft", label: "Draft only", count: counts.draft, to: tabRoute("draft") },
              { value: "published", label: "Published", count: counts.published, to: tabRoute("published") },
              { value: "scheduled", label: "Scheduled", count: counts.scheduled, to: tabRoute("scheduled") },
            ]}
          />

          <div className="grid gap-3 border-b border-ui-border-base px-6 py-4 md:grid-cols-4">
            <div>
              <Label htmlFor="banner-search" size="xsmall">Search banners</Label>
              <Input
                id="banner-search"
                value={search}
                onChange={(event) => updateParams({ q: event.target.value }, true)}
                placeholder="Name, key, placement or document ID"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="banner-placement-filter" size="xsmall">Placement</Label>
              <Select
                value={placementFilter || "all"}
                onValueChange={(value) => updateParams({ placement: value === "all" ? null : value }, true)}
              >
                <Select.Trigger id="banner-placement-filter"><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All placements</Select.Item>
                  {PLACEMENT_FILTER_OPTIONS.map(([value, label]) => (
                    <Select.Item key={value} value={value}>{label}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div>
              <Label htmlFor="banner-audience-filter" size="xsmall">Audience</Label>
              <Select
                value={audienceFilter || "all"}
                onValueChange={(value) => updateParams({ audience: value === "all" ? null : value }, true)}
              >
                <Select.Trigger id="banner-audience-filter"><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All audiences</Select.Item>
                  <Select.Item value="b2c">B2C customers</Select.Item>
                  <Select.Item value="b2b">B2B buyers</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div>
              <Label htmlFor="banner-locale-filter" size="xsmall">Language</Label>
              <Select
                value={locale}
                onValueChange={(value) => updateParams({ locale: value, editor: null }, true)}
              >
                <Select.Trigger id="banner-locale-filter"><Select.Value /></Select.Trigger>
                <Select.Content>
                  {CONTENT_LOCALES.map((item) => (
                    <Select.Item key={item.value} value={item.value}>{item.label}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>

          {contentQuery.isPending ? (
            <Text size="small" className="px-6 py-10 text-ui-fg-subtle">Loading banners…</Text>
          ) : contentQuery.isError || !contentQuery.data ? (
            <div className="px-6 py-10">
              <Heading level="h3">Banners are unavailable</Heading>
              <Text size="small" className="mt-1 text-ui-fg-error">
                The private CMS editor API could not be reached or this account lacks permission.
              </Text>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10">
              <Heading level="h3">No matching banners</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                {documents.length === 0
                  ? "Create the first banner. It stays a draft until you publish it."
                  : "Change the search, filters or status tab to see more banners."}
              </Text>
              {documents.length === 0 ? (
                <Button size="small" className="mt-4" onClick={() => openEditor("new")}>
                  Create banner
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[64rem]">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Banner</Table.HeaderCell>
                      <Table.HeaderCell>Placement / audience</Table.HeaderCell>
                      <Table.HeaderCell>Editorial</Table.HeaderCell>
                      <Table.HeaderCell>Display</Table.HeaderCell>
                      <Table.HeaderCell>Schedule · IST</Table.HeaderCell>
                      <Table.HeaderCell>Updated</Table.HeaderCell>
                      <Table.HeaderCell className="sticky right-0 w-12 bg-ui-bg-base">
                        <span className="sr-only">Actions</span>
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {visible.map((document) => {
                      const eligibility = eligibilityOf(document);
                      return (
                        <Table.Row key={document.documentId}>
                          <Table.Cell>
                            <div className="flex items-center gap-3">
                              <BannerThumb document={document} />
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  className="block max-w-64 truncate text-left text-ui-fg-base hover:text-ui-fg-interactive"
                                  onClick={() => openEditor(document.documentId)}
                                >
                                  <Text size="small" weight="plus">{bannerTitle(document)}</Text>
                                </button>
                                <Text size="xsmall" className="truncate text-ui-fg-subtle">
                                  {bannerKey(document)}
                                </Text>
                                {document.publicationStatus === "modified" ? (
                                  <Text size="xsmall" className="text-ui-fg-muted">Unpublished changes</Text>
                                ) : null}
                              </div>
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small">{placementLabel(document.placement)}</Text>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              {audienceLabel(document.audience)}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <StatusBadge color={statusColor(document.publicationStatus)}>
                              {statusLabel(document.publicationStatus)}
                            </StatusBadge>
                          </Table.Cell>
                          <Table.Cell>
                            <StatusBadge color={DISPLAY_COLORS[eligibility]}>
                              {DISPLAY_LABELS[eligibility]}
                            </StatusBadge>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              {scheduleLabel(document)}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              {new Date(document.updatedAt).toLocaleString("en-IN")}
                            </Text>
                          </Table.Cell>
                          <Table.Cell className="sticky right-0 bg-ui-bg-base">
                            <ActionMenu
                              groups={[
                                {
                                  actions: [
                                    {
                                      label: "Preview",
                                      icon: <Eye />,
                                      onClick: () => openEditor(document.documentId),
                                    },
                                    {
                                      label: "Edit",
                                      icon: <PencilSquare />,
                                      onClick: () => openEditor(document.documentId),
                                    },
                                    {
                                      label: "Duplicate",
                                      icon: <SquareTwoStack />,
                                      onClick: () => duplicateMutation.mutate(document.documentId),
                                      disabled: duplicateMutation.isPending,
                                    },
                                  ],
                                },
                                {
                                  actions: document.publicationStatus === "published"
                                    ? [
                                        {
                                          label: "Unpublish",
                                          icon: <ArchiveBox />,
                                          onClick: () => { void changePublication(document, "unpublish"); },
                                          disabled: publicationMutation.isPending,
                                        },
                                      ]
                                    : [
                                        {
                                          label: "Publish",
                                          icon: <ArrowUpTray />,
                                          onClick: () => { void changePublication(document, "publish"); },
                                          disabled: publicationMutation.isPending,
                                        },
                                      ],
                                },
                              ]}
                            />
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table>
              </div>
              <div className="flex flex-col gap-3 border-t border-ui-border-base px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </Text>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={currentPage <= 1}
                    onClick={() => updateParams({ page: String(currentPage - 1) })}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={currentPage >= pageCount}
                    onClick={() => updateParams({ page: String(currentPage + 1) })}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Container>

        <Container className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Display eligibility is derived from publication and the stored schedule. It never claims a
            banner is being served. Placement membership and ordering stay in storefront layouts, and
            commerce data stays in Medusa.
          </Text>
        </Container>
      </div>

      {editorParam ? (
        <BannerEditor
          key={`${editorParam}:${locale}`}
          open
          onOpenChange={(next) => { if (!next) closeEditor(); }}
          locale={locale}
          document={editingDocument}
          creating={!editingDocument}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey });
          }}
        />
      ) : null}
    </SingleColumnPage>
  );
}
