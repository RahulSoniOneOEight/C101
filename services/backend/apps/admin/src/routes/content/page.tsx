import { ArchiveBox, ArrowUpTray, PencilSquare, Tag } from "@medusajs/icons";
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
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ActionMenu, SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { client } from "../../lib/client";
import {
  CONTENT_KINDS,
  CONTENT_LOCALES,
  PAGE_SIZE,
  contentDocumentRoute,
  displayValue,
  isContentKind,
  statusColor,
  statusLabel,
  type ContentKind,
  type ContentLocale,
  type StatusFilter,
} from "./content-model";
import { useContentLibrary, type ContentLibraryItem } from "./use-content-library";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Editorial content",
  icon: Tag,
  rank: 2,
  nested: "/merchandising",
};

export default function ContentPage() {
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newDocumentKind, setNewDocumentKind] = useState<ContentKind>("banner");

  const requestedKind = searchParams.get("kind") ?? undefined;
  const kind: ContentKind | "all" = isContentKind(requestedKind) ? requestedKind : "all";
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const requestedStatus = searchParams.get("status");
  const status: StatusFilter = requestedStatus === "published"
    || requestedStatus === "modified"
    || requestedStatus === "draft"
    ? requestedStatus
    : "all";
  const search = searchParams.get("q") ?? "";
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const {
    items: libraryItems,
    typeCounts,
    isPending,
    failedQueries,
    allUnavailable,
  } = useContentLibrary(locale);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return libraryItems
      .filter((item) => kind === "all" || item.kind === kind)
      .filter((item) => status === "all" || item.document.publicationStatus === status)
      .filter((item) => {
        if (!term) return true;
        const title = displayValue(item.document, item.response.definition.titleField).toLocaleLowerCase();
        const key = displayValue(item.document, item.response.definition.keyField).toLocaleLowerCase();
        return title.includes(term)
          || key.includes(term)
          || item.document.documentId.toLocaleLowerCase().includes(term)
          || item.kindLabel.toLocaleLowerCase().includes(term);
      })
      .sort(
        (left, right) => new Date(right.document.updatedAt).getTime()
          - new Date(left.document.updatedAt).getTime(),
      );
  }, [kind, libraryItems, search, status]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const updateParams = (values: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    });
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const mutation = useMutation({
    mutationFn: (input: {
      kind: ContentKind;
      operation: "publish" | "unpublish";
      documentId: string;
    }) => client.admin.buildkart.content.mutate({
      ...input,
      locale,
    }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: ["buildkart", "cms-content", input.kind, locale],
      });
      toast.success(input.operation === "publish" ? "Content published" : "Content unpublished");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Content operation failed.");
    },
  });

  const changePublication = async (
    item: ContentLibraryItem,
    operation: "publish" | "unpublish",
  ) => {
    const key = displayValue(item.document, item.response.definition.keyField);
    const confirmed = await prompt({
      title: operation === "publish" ? "Publish editorial changes?" : "Unpublish this content?",
      description: operation === "publish"
        ? `${key} will become eligible for storefront delivery after server validation and projection refresh.`
        : `${key} will be removed from live CMS delivery. Approved fallback behavior remains available.`,
      confirmText: operation === "publish" ? "Publish" : "Unpublish",
      cancelText: "Cancel",
      variant: operation === "publish" ? "confirmation" : "danger",
    });
    if (confirmed) {
      mutation.mutate({
        kind: item.kind,
        operation,
        documentId: item.document.documentId,
      });
    }
  };

  const publishedCount = libraryItems.filter(
    (item) => item.document.publicationStatus === "published",
  ).length;
  const modifiedCount = libraryItems.filter(
    (item) => item.document.publicationStatus === "modified",
  ).length;
  const draftCount = libraryItems.filter(
    (item) => item.document.publicationStatus === "draft",
  ).length;
  const createKind = kind === "all" ? newDocumentKind : kind;

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Editorial content</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Find, filter and edit storefront presentation from one library. Commerce-owned
                products, pricing, promotions and taxonomy remain in their native controls.
              </Text>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-48">
                <Label htmlFor="new-content-type" size="xsmall">New content type</Label>
                <Select
                  value={createKind}
                  onValueChange={(value) => setNewDocumentKind(value as ContentKind)}
                  disabled={kind !== "all"}
                >
                  <Select.Trigger id="new-content-type" aria-label="New content type">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {CONTENT_KINDS.map((item) => (
                      <Select.Item key={item.kind} value={item.kind}>{item.label}</Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <Button
                size="small"
                onClick={() => navigate(contentDocumentRoute(createKind, "new", locale))}
                disabled={allUnavailable}
                data-testid="content-create-draft"
              >
                Create draft
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Needs review</Text>
              <Text size="large" weight="plus">{isPending ? "—" : modifiedCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Draft only</Text>
              <Text size="large" weight="plus">{isPending ? "—" : draftCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Published</Text>
              <Text size="large" weight="plus">{isPending ? "—" : publishedCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Content service</Text>
              <div className="mt-1">
                <StatusBadge color={allUnavailable ? "red" : failedQueries ? "orange" : isPending ? "orange" : "green"}>
                  {allUnavailable ? "Unavailable" : failedQueries ? "Partially available" : isPending ? "Checking" : "Connected"}
                </StatusBadge>
              </div>
            </div>
          </div>
        </Container>

        <Container className="overflow-hidden p-0">
          <div className="overflow-x-auto border-b border-ui-border-base px-4 pt-3">
            <div className="flex min-w-max gap-1" role="tablist" aria-label="Content type">
              <Button
                variant={kind === "all" ? "secondary" : "transparent"}
                size="small"
                onClick={() => updateParams({ kind: null }, true)}
                role="tab"
                aria-selected={kind === "all"}
              >
                All <span className="text-ui-fg-subtle">{libraryItems.length}</span>
              </Button>
              {CONTENT_KINDS.map((item) => (
                <Button
                  key={item.kind}
                  variant={kind === item.kind ? "secondary" : "transparent"}
                  size="small"
                  onClick={() => updateParams({ kind: item.kind }, true)}
                  role="tab"
                  aria-selected={kind === item.kind}
                  data-testid={`content-kind-${item.kind}`}
                >
                  {item.label} <span className="text-ui-fg-subtle">{typeCounts[item.kind]}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 border-b border-ui-border-base px-6 py-4 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <div>
              <Label htmlFor="content-search" size="xsmall">Search content</Label>
              <Input
                id="content-search"
                value={search}
                onChange={(event) => updateParams({ q: event.target.value }, true)}
                placeholder="Search title, key, document ID or type"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="content-status-filter" size="xsmall">Publication status</Label>
              <Select value={status} onValueChange={(value) => updateParams({ status: value }, true)}>
                <Select.Trigger id="content-status-filter" aria-label="Publication status">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All statuses</Select.Item>
                  <Select.Item value="published">Published</Select.Item>
                  <Select.Item value="modified">Changes not published</Select.Item>
                  <Select.Item value="draft">Draft</Select.Item>
                </Select.Content>
              </Select>
            </div>
            <div>
              <Label htmlFor="content-locale-filter" size="xsmall">Locale</Label>
              <Select value={locale} onValueChange={(value) => updateParams({ locale: value }, true)}>
                <Select.Trigger id="content-locale-filter" aria-label="Content locale">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {CONTENT_LOCALES.map((item) => (
                    <Select.Item key={item.value} value={item.value}>{item.label}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>

          {isPending && libraryItems.length === 0 ? (
            <Text size="small" className="px-6 py-10 text-ui-fg-subtle">Loading content…</Text>
          ) : allUnavailable ? (
            <div className="px-6 py-10">
              <Heading level="h3">Content is unavailable</Heading>
              <Text size="small" className="mt-1 text-ui-fg-error">
                The private content service could not be reached or this account lacks permission.
              </Text>
            </div>
          ) : libraryItems.length === 0 ? (
            <div className="px-6 py-10">
              <Heading level="h3">No editorial content yet</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Create the first {locale} draft. Nothing becomes customer-facing until it is published.
              </Text>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-6 py-10">
              <Heading level="h3">No matching content</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Change the search, content type or publication-status filter to see more results.
              </Text>
              <Button
                variant="secondary"
                size="small"
                className="mt-4"
                onClick={() => updateParams({ q: null, status: null, kind: null }, true)}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[52rem]">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Title and key</Table.HeaderCell>
                      <Table.HeaderCell>Type</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Locale</Table.HeaderCell>
                      <Table.HeaderCell>Updated</Table.HeaderCell>
                      <Table.HeaderCell className="sticky right-0 w-12 bg-ui-bg-base">
                        <span className="sr-only">Actions</span>
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {visibleItems.map((item) => {
                      const route = contentDocumentRoute(item.kind, item.document.documentId, locale);
                      return (
                        <Table.Row key={`${item.kind}:${item.document.documentId}`}>
                          <Table.Cell>
                            <Link to={route} className="block max-w-72 hover:text-ui-fg-interactive">
                              <Text size="small" weight="plus">
                                {displayValue(item.document, item.response.definition.titleField)}
                              </Text>
                              <Text size="xsmall" className="truncate text-ui-fg-subtle">
                                {displayValue(item.document, item.response.definition.keyField)}
                              </Text>
                            </Link>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small">{item.kindLabel}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <StatusBadge color={statusColor(item.document.publicationStatus)}>
                              {statusLabel(item.document.publicationStatus)}
                            </StatusBadge>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small">{item.document.locale}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small" className="text-ui-fg-subtle">
                              {new Date(item.document.updatedAt).toLocaleString("en-IN")}
                            </Text>
                          </Table.Cell>
                          <Table.Cell className="sticky right-0 bg-ui-bg-base">
                            <ActionMenu
                              groups={[
                                {
                                  actions: [
                                    {
                                      label: "Edit draft",
                                      icon: <PencilSquare />,
                                      to: route,
                                    },
                                  ],
                                },
                                {
                                  actions: item.document.publicationStatus === "published"
                                    ? [
                                        {
                                          label: "Unpublish",
                                          icon: <ArchiveBox />,
                                          onClick: () => { void changePublication(item, "unpublish"); },
                                          disabled: mutation.isPending,
                                        },
                                      ]
                                    : [
                                        {
                                          label: "Publish",
                                          icon: <ArrowUpTray />,
                                          onClick: () => { void changePublication(item, "publish"); },
                                          disabled: mutation.isPending,
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
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
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
            Editorial presentation is managed here. Product membership, category hierarchy,
            prices, inventory, promotions and campaigns remain editable only in their native
            Medusa controls.
          </Text>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
