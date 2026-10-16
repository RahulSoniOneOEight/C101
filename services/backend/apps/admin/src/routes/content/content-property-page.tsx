import { ArchiveBox, ArrowUpTray, PencilSquare } from "@medusajs/icons";
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
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { client } from "../../lib/client";
import { PageTabs } from "./content-operations";
import {
  CONTENT_LOCALES,
  PAGE_SIZE,
  contentDocumentRoute,
  contentKind,
  displayValue,
  statusColor,
  statusLabel,
  type ContentKind,
  type ContentLocale,
  type ContentResponse,
  type PublicationStatus,
} from "./content-model";
import type { ContentLibraryItem } from "./use-content-library";

type PropertyView = PublicationStatus | "all";
const PROPERTY_REFERENCE_TIME = Date.now();

function contextLabel(item: ContentLibraryItem): string {
  const contextFields = ["placement", "audience", "channel", "contentKind", "tag"];
  const values = contextFields
    .map((field) => item.document[field])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return values.length > 0 ? values.join(" · ") : "—";
}

function timingLabel(item: ContentLibraryItem): string {
  const startValue = item.document.startsAt ?? item.document.effectiveAt;
  const endValue = item.document.endsAt;
  const startsAt = typeof startValue === "string" ? new Date(startValue) : null;
  const endsAt = typeof endValue === "string" ? new Date(endValue) : null;
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > PROPERTY_REFERENCE_TIME) {
    return `Starts ${startsAt.toLocaleString("en-IN")}`;
  }
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() > PROPERTY_REFERENCE_TIME) {
    return `Ends ${endsAt.toLocaleString("en-IN")}`;
  }
  return "No upcoming schedule";
}

export function ContentPropertyPage({ kind }: { kind: ContentKind }) {
  const config = contentKind(kind);
  const navigate = useNavigate();
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const requestedView = searchParams.get("view");
  const view: PropertyView = requestedView === "modified"
    || requestedView === "draft"
    || requestedView === "published"
    ? requestedView
    : "all";
  const search = searchParams.get("q") ?? "";
  // Channel only applies to category details, which now holds independent B2C and B2B sets.
  const channelFilter = kind === "category-editorial" ? searchParams.get("channel") ?? "" : "";
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const queryKey = ["buildkart", "cms-content", kind, locale];
  const contentQuery = useQuery({
    queryKey,
    queryFn: () => client.admin.buildkart.content.query({ kind, locale }),
  });
  const response = contentQuery.data as ContentResponse | undefined;
  const items: ContentLibraryItem[] = (response?.documents ?? []).map((document) => ({
    kind,
    kindLabel: config.label,
    response: response!,
    document,
  }));
  const counts = {
    all: items.length,
    modified: items.filter((item) => item.document.publicationStatus === "modified").length,
    draft: items.filter((item) => item.document.publicationStatus === "draft").length,
    published: items.filter((item) => item.document.publicationStatus === "published").length,
  };
  const term = search.trim().toLocaleLowerCase();
  const filteredItems = items
    .filter((item) => view === "all" || item.document.publicationStatus === view)
    .filter((item) => (channelFilter ? item.document.channel === channelFilter : true))
    .filter((item) => {
      if (!term) return true;
      return displayValue(item.document, item.response.definition.titleField).toLocaleLowerCase().includes(term)
        || displayValue(item.document, item.response.definition.keyField).toLocaleLowerCase().includes(term)
        || item.document.documentId.toLocaleLowerCase().includes(term)
        || contextLabel(item).toLocaleLowerCase().includes(term);
    })
    .sort((left, right) => new Date(right.document.updatedAt).getTime()
      - new Date(left.document.updatedAt).getTime());
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const updateParams = (values: Record<string, string | null>, resetPage = false) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => {
      if (!value || value === "all" || (key === "locale" && value === "en-IN")) next.delete(key);
      else next.set(key, value);
    });
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: true });
  };
  const tabRoute = (nextView: PropertyView) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    next.delete("page");
    const query = next.toString();
    return `${config.route}${query ? `?${query}` : ""}`;
  };

  const mutation = useMutation({
    mutationFn: (input: {
      operation: "publish" | "unpublish";
      documentId: string;
    }) => client.admin.buildkart.content.mutate({
      kind,
      locale,
      ...input,
    }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
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
      title: operation === "publish" ? `Publish ${config.singularLabel}?` : `Unpublish ${config.singularLabel}?`,
      description: operation === "publish"
        ? `${key} will become eligible for storefront delivery after server validation and projection refresh.`
        : `${key} will be removed from live CMS delivery. Approved fallback behavior remains available.`,
      confirmText: operation === "publish" ? "Publish" : "Unpublish",
      cancelText: "Cancel",
      variant: operation === "publish" ? "confirmation" : "danger",
    });
    if (confirmed) {
      mutation.mutate({ operation, documentId: item.document.documentId });
    }
  };

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">{config.label}</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
                <StatusBadge color={config.deliveryColor}>{config.delivery}</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">{config.description}.</Text>
            </div>
            <Button
              size="small"
              onClick={() => navigate(contentDocumentRoute(kind, "new", locale))}
              disabled={contentQuery.isError}
              data-testid={`new-${kind}`}
            >
              New {config.singularLabel}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">All records</Text>
              <Text size="large" weight="plus">{contentQuery.isPending ? "—" : counts.all}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Needs review</Text>
              <Text size="large" weight="plus">{contentQuery.isPending ? "—" : counts.modified}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Draft only</Text>
              <Text size="large" weight="plus">{contentQuery.isPending ? "—" : counts.draft}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Published</Text>
              <Text size="large" weight="plus">{contentQuery.isPending ? "—" : counts.published}</Text>
            </div>
          </div>
        </Container>

        <Container className="overflow-hidden p-0">
          <PageTabs
            label={`${config.label} publication status`}
            active={view}
            tabs={[
              { value: "all", label: "All", count: counts.all, to: tabRoute("all") },
              { value: "modified", label: "Needs review", count: counts.modified, to: tabRoute("modified") },
              { value: "draft", label: "Draft only", count: counts.draft, to: tabRoute("draft") },
              { value: "published", label: "Published", count: counts.published, to: tabRoute("published") },
            ]}
          />
          <div className={`grid gap-3 border-b border-ui-border-base px-6 py-4 ${kind === "category-editorial" ? "md:grid-cols-[minmax(0,1fr)_12rem_10rem]" : "md:grid-cols-[minmax(0,1fr)_12rem]"}`}>
            <div>
              <Label htmlFor={`${kind}-search`} size="xsmall">Search {config.label.toLocaleLowerCase()}</Label>
              <Input
                id={`${kind}-search`}
                value={search}
                onChange={(event) => updateParams({ q: event.target.value }, true)}
                placeholder="Search title, key, context or document ID"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor={`${kind}-locale`} size="xsmall">Locale</Label>
              <Select value={locale} onValueChange={(value) => updateParams({ locale: value }, true)}>
                <Select.Trigger id={`${kind}-locale`} aria-label={`${config.label} locale`}>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {CONTENT_LOCALES.map((item) => (
                    <Select.Item key={item.value} value={item.value}>{item.label}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            {kind === "category-editorial" ? (
              <div>
                <Label htmlFor={`${kind}-channel`} size="xsmall">Channel</Label>
                <Select
                  value={channelFilter || "all"}
                  onValueChange={(value) => updateParams({ channel: value === "all" ? null : value }, true)}
                >
                  <Select.Trigger id={`${kind}-channel`} aria-label="Category details channel">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="all">B2C and B2B</Select.Item>
                    <Select.Item value="b2c">B2C only</Select.Item>
                    <Select.Item value="b2b">B2B only</Select.Item>
                  </Select.Content>
                </Select>
              </div>
            ) : null}
          </div>

          {contentQuery.isPending ? (
            <Text size="small" className="px-6 py-10 text-ui-fg-subtle">Loading {config.label.toLocaleLowerCase()}…</Text>
          ) : contentQuery.isError || !response ? (
            <div className="px-6 py-10">
              <Heading level="h3">{config.label} are unavailable</Heading>
              <Text size="small" className="mt-1 text-ui-fg-error">
                The private CMS editor API could not be reached or this account lacks permission.
              </Text>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-6 py-10">
              <Heading level="h3">No matching {config.label.toLocaleLowerCase()}</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                {items.length === 0
                  ? `Create the first ${config.singularLabel}. It remains a draft until explicitly published.`
                  : "Change the search or publication-status tab to see more results."}
              </Text>
              {items.length === 0 ? (
                <Button
                  size="small"
                  className="mt-4"
                  onClick={() => navigate(contentDocumentRoute(kind, "new", locale))}
                >
                  New {config.singularLabel}
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[52rem]">
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Title and key</Table.HeaderCell>
                      <Table.HeaderCell>Context</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Timing</Table.HeaderCell>
                      <Table.HeaderCell>Updated</Table.HeaderCell>
                      <Table.HeaderCell className="sticky right-0 w-12 bg-ui-bg-base">
                        <span className="sr-only">Actions</span>
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {visibleItems.map((item) => {
                      const editorRoute = contentDocumentRoute(kind, item.document.documentId, locale);
                      return (
                        <Table.Row key={item.document.documentId}>
                          <Table.Cell>
                            <Link to={editorRoute} className="block max-w-72 hover:text-ui-fg-interactive">
                              <Text size="small" weight="plus">
                                {displayValue(item.document, item.response.definition.titleField)}
                              </Text>
                              <Text size="xsmall" className="truncate text-ui-fg-subtle">
                                {displayValue(item.document, item.response.definition.keyField)}
                              </Text>
                            </Link>
                          </Table.Cell>
                          <Table.Cell><Text size="small">{contextLabel(item)}</Text></Table.Cell>
                          <Table.Cell>
                            <StatusBadge color={statusColor(item.document.publicationStatus)}>
                              {statusLabel(item.document.publicationStatus)}
                            </StatusBadge>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="xsmall" className="text-ui-fg-subtle">{timingLabel(item)}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              {new Date(item.document.updatedAt).toLocaleString("en-IN")}
                            </Text>
                          </Table.Cell>
                          <Table.Cell className="sticky right-0 bg-ui-bg-base">
                            <ActionMenu
                              groups={[
                                {
                                  actions: [
                                    { label: "Edit", icon: <PencilSquare />, to: editorRoute },
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
            This page changes editorial presentation only. Product membership, category hierarchy,
            prices, inventory, promotions and campaigns remain in their native Medusa controls.
          </Text>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
