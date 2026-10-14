import { ArchiveBox, ArrowUpTray, PencilSquare, Tag } from "@medusajs/icons";
import {
  Button,
  Container,
  Drawer,
  Heading,
  Hint,
  Input,
  Label,
  Select,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ActionMenu, SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { client } from "../../lib/client";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Editorial content",
  icon: Tag,
  rank: 1,
  nested: "/merchandising",
};

const CONTENT_KINDS = [
  {
    kind: "storefront-layout",
    label: "Home layouts",
    description: "Page composition and module order",
    delivery: "Partial",
    deliveryColor: "orange",
  },
  {
    kind: "banner",
    label: "Banners",
    description: "Hero and campaign presentation",
    delivery: "Live",
    deliveryColor: "green",
  },
  {
    kind: "category-editorial",
    label: "Category presentation",
    description: "Labels, icons and category imagery",
    delivery: "Live",
    deliveryColor: "green",
  },
  {
    kind: "product-editorial",
    label: "Product editorial",
    description: "Guidance, supporting copy and SEO",
    delivery: "Consumer pending",
    deliveryColor: "grey",
  },
  {
    kind: "curated-collection",
    label: "Curated collections",
    description: "Editorial collection references",
    delivery: "Partial",
    deliveryColor: "orange",
  },
  {
    kind: "faq-article",
    label: "Help & articles",
    description: "FAQ, policy and onboarding content",
    delivery: "Consumer pending",
    deliveryColor: "grey",
  },
] as const;

const PAGE_SIZE = 20;

type ContentKind = (typeof CONTENT_KINDS)[number]["kind"];
type ContentResponse = InferClientOutput<typeof client.admin.buildkart.content.query>;
type ContentDocument = ContentResponse["documents"][number];
type ContentField = ContentResponse["definition"]["fields"][number];
type PublicationStatus = ContentDocument["publicationStatus"];
type StatusFilter = PublicationStatus | "all";

function statusColor(status: PublicationStatus): "green" | "orange" | "grey" {
  if (status === "published") return "green";
  if (status === "modified") return "orange";
  return "grey";
}

function statusLabel(status: PublicationStatus): string {
  if (status === "modified") return "Changes not published";
  if (status === "draft") return "Draft";
  return "Published";
}

function displayValue(document: ContentDocument, field: string): string {
  const value = document[field];
  return typeof value === "string" && value.trim() ? value : "—";
}

function toFormValue(field: ContentField, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "json") return JSON.stringify(value, null, 2);
  if (field.type === "datetime") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
  }
  return String(value);
}

function initialForm(fields: ContentField[], document?: ContentDocument): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const existing = document?.[field.name];
      const fallback = field.type === "enum" ? field.options?.[0] ?? "" : "";
      return [field.name, toFormValue(field, existing ?? fallback)];
    }),
  );
}

function parseForm(fields: ContentField[], values: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = values[field.name]?.trim() ?? "";
      if (!raw) return [field.name, null];
      if (field.type === "integer") {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) throw new Error(`${field.label} must be a whole number.`);
        return [field.name, parsed];
      }
      if (field.type === "json") {
        try {
          return [field.name, JSON.parse(raw) as unknown];
        } catch {
          throw new Error(`${field.label} must contain valid JSON.`);
        }
      }
      if (field.type === "datetime") {
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error(`${field.label} must contain a valid date and time.`);
        }
        return [field.name, parsed.toISOString()];
      }
      return [field.name, raw];
    }),
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ContentField;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = `content-field-${field.name}`;
  const descriptionId = field.description ? `${inputId}-description` : undefined;

  return (
    <div className="flex flex-col gap-y-2">
      <div>
        <Label htmlFor={inputId} size="small" weight="plus">
          {field.label}{field.required ? " *" : ""}
        </Label>
        {field.description ? (
          <Text id={descriptionId} size="xsmall" className="text-ui-fg-subtle">
            {field.description}
          </Text>
        ) : null}
      </div>
      {field.type === "enum" ? (
        <Select value={value} onValueChange={onChange}>
          <Select.Trigger id={inputId} aria-describedby={descriptionId} data-testid={inputId}>
            <Select.Value placeholder={`Select ${field.label.toLowerCase()}`} />
          </Select.Trigger>
          <Select.Content>
            {(field.options ?? []).map((option) => (
              <Select.Item key={option} value={option}>
                {option}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      ) : field.type === "text" || field.type === "richtext" || field.type === "json" ? (
        <Textarea
          id={inputId}
          aria-describedby={descriptionId}
          data-testid={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={field.type === "json" ? 10 : 5}
          placeholder={field.type === "json" ? "Enter valid structured JSON" : undefined}
        />
      ) : (
        <Input
          id={inputId}
          aria-describedby={descriptionId}
          data-testid={inputId}
          type={
            field.type === "datetime"
              ? "datetime-local"
              : field.type === "integer"
                ? "number"
                : field.type === "url"
                  ? "url"
                  : "text"
          }
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export default function ContentPage() {
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedKind = searchParams.get("kind");
  const kind = CONTENT_KINDS.some((item) => item.kind === requestedKind)
    ? requestedKind as ContentKind
    : "storefront-layout";
  const locale: "en-IN" | "hi-IN" = searchParams.get("locale") === "hi-IN"
    ? "hi-IN"
    : "en-IN";
  const requestedStatus = searchParams.get("status");
  const status: StatusFilter = requestedStatus === "published"
    || requestedStatus === "modified"
    || requestedStatus === "draft"
    ? requestedStatus
    : "all";
  const search = searchParams.get("q") ?? "";
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [editing, setEditing] = useState<ContentDocument | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const queryKey = useMemo(() => ["buildkart", "cms-content", kind, locale], [kind, locale]);
  const contentQuery = useQuery({
    queryKey,
    queryFn: () => client.admin.buildkart.content.query({ kind, locale }),
  });
  const content = contentQuery.data as ContentResponse | undefined;
  const documents = useMemo(() => content?.documents ?? [], [content]);
  const selectedKind = CONTENT_KINDS.find((item) => item.kind === kind)!;

  const updateParams = (values: Record<string, string | null>, resetPage = false) => {
    if (Object.hasOwn(values, "kind") || Object.hasOwn(values, "locale")) {
      setShowEditor(false);
      setEditing(null);
      setFormValues({});
      setInitialValues({});
      setFormError(null);
    }
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    });
    if (resetPage) next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return documents
      .filter((document) => status === "all" || document.publicationStatus === status)
      .filter((document) => {
        if (!term || !content) return true;
        const title = displayValue(document, content.definition.titleField).toLocaleLowerCase();
        const key = displayValue(document, content.definition.keyField).toLocaleLowerCase();
        return title.includes(term) || key.includes(term) || document.documentId.toLocaleLowerCase().includes(term);
      })
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [content, documents, search, status]);

  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleDocuments = filteredDocuments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const mutation = useMutation({
    mutationFn: (input: {
      operation: "create-draft" | "update-draft" | "publish" | "unpublish";
      documentId?: string;
      data?: Record<string, unknown>;
    }) => client.admin.buildkart.content.mutate({ kind, locale, ...input }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      const verb = input.operation === "unpublish"
        ? "Content unpublished"
        : input.operation === "publish"
          ? "Content published"
          : "Draft saved";
      toast.success(verb);
      if (input.operation === "create-draft" || input.operation === "update-draft") {
        setShowEditor(false);
        setEditing(null);
        setFormValues({});
        setInitialValues({});
        setFormError(null);
      }
    },
    onError: (error, input) => {
      const message = error instanceof Error ? error.message : "Content operation failed.";
      toast.error(message);
      if (input.operation === "create-draft" || input.operation === "update-draft") {
        setFormError(message);
      }
    },
  });

  const openEditor = (document?: ContentDocument) => {
    if (!content) return;
    const values = initialForm(content.definition.fields, document);
    setEditing(document ?? null);
    setFormValues(values);
    setInitialValues(values);
    setFormError(null);
    setShowEditor(true);
  };

  const isDirty = showEditor
    && JSON.stringify(formValues) !== JSON.stringify(initialValues);

  const requestCloseEditor = async () => {
    if (!isDirty) {
      setShowEditor(false);
      return;
    }
    const confirmed = await prompt({
      title: "Discard unsaved draft changes?",
      description: "Your changes have not been saved to the CMS draft.",
      confirmText: "Discard changes",
      cancelText: "Continue editing",
      variant: "danger",
    });
    if (confirmed) {
      setShowEditor(false);
      setFormError(null);
    }
  };

  const saveDraft = () => {
    if (!content) return;
    try {
      const data = parseForm(content.definition.fields, formValues);
      setFormError(null);
      mutation.mutate({
        operation: editing ? "update-draft" : "create-draft",
        documentId: editing?.documentId,
        data,
      });
    } catch (error) {
      const message = (error as Error).message;
      setFormError(message);
      toast.error(message);
    }
  };

  const changePublication = async (
    document: ContentDocument,
    operation: "publish" | "unpublish",
  ) => {
    const key = displayValue(document, content?.definition.keyField ?? "documentId");
    const confirmed = await prompt({
      title: operation === "publish" ? "Publish editorial changes?" : "Unpublish this content?",
      description: operation === "publish"
        ? `${key} will become eligible for storefront delivery after server validation and projection refresh.`
        : `${key} will be removed from live CMS delivery. Approved fallback behavior remains available.`,
      confirmText: operation === "publish" ? "Publish" : "Unpublish",
      cancelText: "Cancel",
      variant: operation === "publish" ? "confirmation" : "danger",
    });
    if (confirmed) mutation.mutate({ operation, documentId: document.documentId });
  };

  const publishedCount = documents.filter((document) => document.publicationStatus === "published").length;
  const modifiedCount = documents.filter((document) => document.publicationStatus === "modified").length;
  const draftCount = documents.filter((document) => document.publicationStatus === "draft").length;
  const routineFields = content?.definition.fields.filter((field) => field.type !== "json") ?? [];
  const structuredFields = content?.definition.fields.filter((field) => field.type === "json") ?? [];

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Editorial content</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
                <StatusBadge color="blue">Private CMS</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                One authoritative editor for storefront presentation. Commerce-owned products,
                prices, inventory, promotions and taxonomy stay in their native Medusa controls.
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="small">
                <Link to="/merchandising">Overview</Link>
              </Button>
              <div className="w-40">
                <Select
                  value={locale}
                  onValueChange={(value) => updateParams({ locale: value }, true)}
                >
                  <Select.Trigger aria-label="Content locale" data-testid="content-locale-select">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="en-IN">English (India)</Select.Item>
                    <Select.Item value="hi-IN">Hindi (India)</Select.Item>
                  </Select.Content>
                </Select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 px-6 py-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Published</Text>
              <Text size="large" weight="plus">{publishedCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Needs review</Text>
              <Text size="large" weight="plus">{modifiedCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Draft only</Text>
              <Text size="large" weight="plus">{draftCount}</Text>
            </div>
          </div>
        </Container>

        <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Container className="h-fit divide-y p-0">
            <div className="px-5 py-4">
              <Heading level="h2">Content types</Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                Choose the customer-facing property you want to manage.
              </Text>
            </div>
            <div className="flex flex-col gap-1 p-2">
              {CONTENT_KINDS.map((item) => (
                <Button
                  key={item.kind}
                  variant={kind === item.kind ? "secondary" : "transparent"}
                  className="h-auto w-full justify-start px-3 py-3 text-left"
                  onClick={() => updateParams({ kind: item.kind }, true)}
                  data-testid={`content-kind-${item.kind}`}
                >
                  <span className="flex w-full flex-col items-start gap-1">
                    <span className="flex w-full items-center justify-between gap-2">
                      <span>{item.label}</span>
                      <StatusBadge color={item.deliveryColor}>{item.delivery}</StatusBadge>
                    </span>
                    <span className="text-xs font-normal text-ui-fg-subtle">{item.description}</span>
                  </span>
                </Button>
              ))}
            </div>
            <div className="px-5 py-4">
              <Text size="xsmall" className="text-ui-fg-subtle">
                Strapi stores approved editorial fields privately. Operators do not need a separate CMS login.
              </Text>
            </div>
          </Container>

          <Container className="overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b border-ui-border-base px-6 py-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Heading level="h2">{content?.definition.label ?? selectedKind.label}</Heading>
                  <StatusBadge color={selectedKind.deliveryColor}>{selectedKind.delivery}</StatusBadge>
                </div>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  {content?.definition.description ?? selectedKind.description}
                </Text>
              </div>
              <Button
                size="small"
                onClick={() => openEditor()}
                disabled={!content}
                data-testid="content-create-draft"
              >
                Create draft
              </Button>
            </div>

            <div className="grid gap-3 border-b border-ui-border-base px-6 py-4 md:grid-cols-[minmax(0,1fr)_12rem]">
              <div>
                <Label htmlFor="content-search" size="xsmall">Search this content type</Label>
                <Input
                  id="content-search"
                  value={search}
                  onChange={(event) => updateParams({ q: event.target.value }, true)}
                  placeholder="Search by title, key or document ID"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="content-status-filter" size="xsmall">Publication status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => updateParams({ status: value }, true)}
                >
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
            </div>

            {contentQuery.isPending ? (
              <Text size="small" className="px-6 py-10 text-ui-fg-subtle">Loading content…</Text>
            ) : contentQuery.isError || !content ? (
              <div className="px-6 py-10">
                <Heading level="h3">Content is unavailable</Heading>
                <Text size="small" className="mt-1 text-ui-fg-error">
                  The private CMS could not be reached or this account lacks content permission.
                </Text>
              </div>
            ) : documents.length === 0 ? (
              <div className="px-6 py-10">
                <Heading level="h3">No {content.definition.label.toLowerCase()} yet</Heading>
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  Create the first {locale} draft. Nothing becomes customer-facing until it is published.
                </Text>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="px-6 py-10">
                <Heading level="h3">No matching content</Heading>
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  Change the search or publication-status filter to see more results.
                </Text>
                <Button
                  variant="secondary"
                  size="small"
                  className="mt-4"
                  onClick={() => updateParams({ q: null, status: null }, true)}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>Title</Table.HeaderCell>
                        <Table.HeaderCell>Key</Table.HeaderCell>
                        <Table.HeaderCell>Status</Table.HeaderCell>
                        <Table.HeaderCell>Updated</Table.HeaderCell>
                        <Table.HeaderCell className="w-12"><span className="sr-only">Actions</span></Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {visibleDocuments.map((document) => (
                        <Table.Row key={document.documentId}>
                          <Table.Cell>
                            <Text size="small" weight="plus">
                              {displayValue(document, content.definition.titleField)}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small" className="text-ui-fg-subtle">
                              {displayValue(document, content.definition.keyField)}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <StatusBadge color={statusColor(document.publicationStatus)}>
                              {statusLabel(document.publicationStatus)}
                            </StatusBadge>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small" className="text-ui-fg-subtle">
                              {new Date(document.updatedAt).toLocaleString("en-IN")}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <ActionMenu
                              groups={[
                                {
                                  actions: [
                                    {
                                      label: "Edit draft",
                                      icon: <PencilSquare />,
                                      onClick: () => openEditor(document),
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
                                          disabled: mutation.isPending,
                                        },
                                      ]
                                    : [
                                        {
                                          label: "Publish",
                                          icon: <ArrowUpTray />,
                                          onClick: () => { void changePublication(document, "publish"); },
                                          disabled: mutation.isPending,
                                        },
                                      ],
                                },
                              ]}
                            />
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
                <div className="flex flex-col gap-3 border-t border-ui-border-base px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredDocuments.length)} of {filteredDocuments.length}
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
        </div>

        <Drawer
          open={showEditor}
          onOpenChange={(open) => {
            if (open) setShowEditor(true);
            else void requestCloseEditor();
          }}
        >
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>{editing ? "Edit draft" : "Create draft"}</Drawer.Title>
              <Drawer.Description>
                {selectedKind.label} · {locale}. Saving updates only the CMS draft; publishing is a separate action.
              </Drawer.Description>
            </Drawer.Header>
            <Drawer.Body>
              <div className="flex flex-col gap-y-6 py-2">
                {formError ? (
                  <div role="alert" className="rounded-md border border-ui-border-error bg-ui-bg-base px-4 py-3">
                    <Text size="small" weight="plus" className="text-ui-fg-error">Draft could not be saved</Text>
                    <Hint variant="error" className="mt-1">{formError}</Hint>
                  </div>
                ) : null}

                <div className="flex flex-col gap-y-5">
                  {routineFields.map((field) => (
                    <FieldInput
                      key={field.name}
                      field={field}
                      value={formValues[field.name] ?? ""}
                      onChange={(value) => {
                        setFormError(null);
                        setFormValues((current) => ({ ...current, [field.name]: value }));
                      }}
                    />
                  ))}
                </div>

                {structuredFields.length > 0 ? (
                  <div className="flex flex-col gap-y-5 border-t border-ui-border-base pt-5">
                    <div>
                      <Heading level="h3">Advanced structured content</Heading>
                      <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                        Temporary expert control until the governed visual module builder is available.
                      </Text>
                    </div>
                    {structuredFields.map((field) => (
                      <FieldInput
                        key={field.name}
                        field={field}
                        value={formValues[field.name] ?? ""}
                        onChange={(value) => {
                          setFormError(null);
                          setFormValues((current) => ({ ...current, [field.name]: value }));
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </Drawer.Body>
            <Drawer.Footer>
              <Button
                variant="secondary"
                size="small"
                onClick={() => { void requestCloseEditor(); }}
                data-testid="content-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={saveDraft}
                isLoading={mutation.isPending}
                size="small"
                data-testid="content-save-draft"
              >
                Save draft
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer>
      </div>
    </SingleColumnPage>
  );
}
