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
import { Link, useSearchParams } from "react-router-dom";
import { client } from "../../../lib/client";
import {
  CONTENT_LOCALES,
  PAGE_SIZE,
  type ContentDocument,
  type ContentLocale,
} from "../content-model";
import {
  CATEGORY_DETAILS_ROUTE,
  LIFECYCLE_META,
  STUDIO_TABS,
  SUPPORTED_PLACEMENTS,
  bannerKey,
  bannerLifecycle,
  bannerTitle,
  hasUnpublishedChanges,
  isRenderedPlacement,
  isStudioTab,
  localeLabel,
  placementLabel,
  scheduleLabel,
  type BannerLifecycle,
} from "./banner-model";
import { BannerEditor } from "./banner-editor";

const PLACEMENT_FILTER_ALL = "all";

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
  const view: BannerLifecycle = isStudioTab(requestedView) ? requestedView : "live";
  const search = searchParams.get("q") ?? "";
  const placementFilter = searchParams.get("placement") ?? "";
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const editorParam = searchParams.get("editor");
  const editorDocumentId = editorParam && editorParam !== "new" ? editorParam : null;

  const queryKey = ["buildkart", "cms-content", "banner", locale];
  const contentQuery = useQuery({
    queryKey,
    queryFn: () => client.admin.buildkart.content.query({ kind: "banner", locale }),
  });
  const documents = useMemo(
    () => contentQuery.data?.documents ?? [],
    [contentQuery.data],
  );

  const updateParams = (values: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => {
      if (!value || value === "all" || (key === "locale" && value === "en-IN") || (key === "view" && value === "live")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const openEditor = (documentId: string) => updateParams({ editor: documentId });
  const closeEditor = () => updateParams({ editor: null });
  const filtersActive = Boolean(search || placementFilter);
  const clearFilters = () => updateParams({ q: null, placement: null }, true);

  const now = useMemo(() => new Date(), []);

  // Filter options are the supported placements plus any placement actually present in the data, so an
  // unrecognised value stays reachable instead of being hidden by the dropdown.
  const placementOptions = useMemo(() => {
    const options = new Map<string, string>(
      SUPPORTED_PLACEMENTS.map((item) => [item.value, item.label]),
    );
    documents.forEach((document) => {
      const key = typeof document.placement === "string" ? document.placement.trim() : "";
      if (key && !options.has(key)) options.set(key, key);
    });
    return [...options.entries()];
  }, [documents]);

  const counts: Record<BannerLifecycle, number> = {
    live: 0,
    draft: 0,
    scheduled: 0,
    expired: 0,
  };
  documents.forEach((document) => {
    counts[bannerLifecycle(document, now)] += 1;
  });

  const term = search.trim().toLocaleLowerCase();
  const filtered = documents
    .filter((document) => bannerLifecycle(document, now) === view)
    .filter((document) => (placementFilter ? document.placement === placementFilter : true))
    .filter((document) => {
      if (!term) return true;
      return [
        bannerTitle(document),
        bannerKey(document),
        document.documentId,
        placementLabel(document.placement),
        typeof document.categoryId === "string" ? document.categoryId : "",
      ].join(" ").toLocaleLowerCase().includes(term);
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

  const changePublication = async (
    document: ContentDocument,
    operation: "publish" | "unpublish",
  ) => {
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

  const tabRoute = (nextView: BannerLifecycle) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "live") next.delete("view");
    else next.set("view", nextView);
    next.delete("page");
    next.delete("editor");
    const query = next.toString();
    return `/merchandising/banners${query ? `?${query}` : ""}`;
  };

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Banner studio</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Create the moments your customers see. Editing here changes presentation only.
              </Text>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Text size="xsmall" className="hidden text-ui-fg-subtle sm:block">
                {contentQuery.isPending ? "" : `${documents.length} banners`}
              </Text>
              <Button
                size="small"
                onClick={() => openEditor("new")}
                disabled={contentQuery.isError}
                data-testid="create-banner"
              >
                Create banner
              </Button>
            </div>
          </div>

          <div className="border-t border-ui-border-base px-4 py-2">
            <div className="overflow-x-auto">
              <div className="flex min-w-max items-center gap-1" role="tablist" aria-label="Banner lifecycle">
                {STUDIO_TABS.map((tab) => (
                  <Button
                    key={tab.value}
                    asChild
                    variant={view === tab.value ? "secondary" : "transparent"}
                    size="small"
                  >
                    <Link to={tabRoute(tab.value)} role="tab" aria-selected={view === tab.value}>
                      {tab.label}
                      <span className="text-ui-fg-subtle" data-testid={`tab-count-${tab.value}`}>
                        {contentQuery.isPending ? "—" : counts[tab.value]}
                      </span>
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-ui-border-base px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-56 flex-1">
                <Label htmlFor="banner-search" className="sr-only">Search banners</Label>
                <Input
                  id="banner-search"
                  size="small"
                  value={search}
                  onChange={(event) => updateParams({ q: event.target.value }, true)}
                  placeholder="Search banners"
                  autoComplete="off"
                />
              </div>
              <div className="w-36">
                <Label htmlFor="banner-placement-filter" className="sr-only">Filter by placement</Label>
                <Select
                  size="small"
                  value={placementFilter || "all"}
                  onValueChange={(value) => updateParams({ placement: value === "all" ? null : value }, true)}
                >
                  <Select.Trigger id="banner-placement-filter">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value={PLACEMENT_FILTER_ALL}>All placements</Select.Item>
                    {placementOptions.map(([value, label]) => (
                      <Select.Item key={value} value={value}>{label}</Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div className="w-40">
                <Label htmlFor="banner-locale-filter" className="sr-only">Language</Label>
                <Select
                  size="small"
                  value={locale}
                  onValueChange={(value) => updateParams({ locale: value, editor: null }, true)}
                >
                  <Select.Trigger id="banner-locale-filter">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {CONTENT_LOCALES.map((item) => (
                      <Select.Item key={item.value} value={item.value}>{item.label}</Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              {filtersActive ? (
                <Button size="small" variant="transparent" onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {contentQuery.isPending ? (
            <Text size="small" className="border-t border-ui-border-base px-6 py-10 text-ui-fg-subtle">
              Loading banners…
            </Text>
          ) : contentQuery.isError || !contentQuery.data ? (
            <div className="border-t border-ui-border-base px-6 py-10">
              <Heading level="h3">Banners are unavailable</Heading>
              <Text size="small" className="mt-1 text-ui-fg-error">
                The private CMS editor API could not be reached or this account lacks permission.
              </Text>
            </div>
          ) : filtered.length === 0 ? (
            <div className="border-t border-ui-border-base px-6 py-10">
              <Heading level="h3">
                {documents.length === 0 ? "No banners yet" : `No ${STUDIO_TABS.find((tab) => tab.value === view)!.label.toLocaleLowerCase()} banners`}
              </Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                {documents.length === 0
                  ? "Create the first banner. It stays a draft until you publish it."
                  : filtersActive
                    ? "Clear the filters or switch tab to see more banners."
                    : "Nothing in this state right now."}
              </Text>
              <div className="mt-4 flex gap-2">
                {documents.length === 0 ? (
                  <Button size="small" onClick={() => openEditor("new")}>Create banner</Button>
                ) : filtersActive ? (
                  <Button size="small" variant="secondary" onClick={clearFilters}>Clear filters</Button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border-t border-ui-border-base">
                <Table className="min-w-[54rem]">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Banner</Table.HeaderCell>
                      <Table.HeaderCell>Placement / audience</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Schedule · IST</Table.HeaderCell>
                      <Table.HeaderCell>Updated</Table.HeaderCell>
                      <Table.HeaderCell className="sticky right-0 w-12 bg-ui-bg-base">
                        <span className="sr-only">Actions</span>
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {visible.map((document) => {
                      const lifecycle = bannerLifecycle(document, now);
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
                              </div>
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small">{placementLabel(document.placement)}</Text>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              {placementLabel(document.placement)}
                            </Text>
                            {isRenderedPlacement(document.placement) ? null : (
                              <Text size="xsmall" className="text-ui-fg-muted">
                                Not rendered by the app
                              </Text>
                            )}
                          </Table.Cell>
                          <Table.Cell>
                            <StatusBadge color={LIFECYCLE_META[lifecycle].color}>
                              {LIFECYCLE_META[lifecycle].label}
                            </StatusBadge>
                            {hasUnpublishedChanges(document) ? (
                              <Text size="xsmall" className="mt-1 block text-ui-fg-muted">
                                Changes not published
                              </Text>
                            ) : null}
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
              <div className="flex flex-col gap-3 border-t border-ui-border-base px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
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

        <Container className="px-6 py-3">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Status comes from one rule: publication plus the stored schedule. Draft is not published,
            Scheduled opens later, Live is open now, Historical means the end time has passed, and a
            published banner with newer edits is marked "Changes not published". Status never claims a
            banner is being served — audience and storefront-layout placement are separate. The list is
            loaded one language at a time, which is why Language sits with the filters.
          </Text>
          <Text size="xsmall" className="mt-2 text-ui-fg-subtle">
            The banner type sets the channel: B2C Home, B2C Campaign banner, B2C Category banner and
            B2B Category banner. Category banners are set here, one per category per channel; the
            category label, icon and text live under{" "}
            <Link to={CATEGORY_DETAILS_ROUTE} className="text-ui-fg-interactive hover:underline">
              Category details
            </Link>
            .
          </Text>
        </Container>
      </div>

      {editorParam && (editorParam === "new" || editingDocument) ? (
        <BannerEditor
          key={`${editorParam}:${locale}`}
          open
          onOpenChange={(next) => { if (!next) closeEditor(); }}
          locale={locale}
          document={editingDocument}
          creating={editorParam === "new"}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey });
          }}
        />
      ) : null}

      {editorParam && editorParam !== "new" && !editingDocument && !contentQuery.isPending ? (
        <Container className="mt-3 border-ui-border-error px-6 py-4">
          <Heading level="h2">That banner could not be opened</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            There is no {localeLabel(locale)} draft for this banner. It may exist in another language,
            or the link may be out of date. Opening it as a new banner would risk creating a duplicate,
            so it has been left closed.
          </Text>
          <Button size="small" variant="secondary" className="mt-3" onClick={closeEditor}>
            Back to banners
          </Button>
        </Container>
      ) : null}
    </SingleColumnPage>
  );
}
