import { Tag } from "@medusajs/icons";
import {
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Select,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
  { kind: "storefront-layout", label: "Layouts", description: "Home composition and module order" },
  { kind: "banner", label: "Banners", description: "Campaign copy, actions and schedules" },
  { kind: "curated-collection", label: "Collections", description: "Editorial product references" },
  { kind: "category-editorial", label: "Categories", description: "Category headings and banners" },
  { kind: "product-editorial", label: "Products", description: "Product guidance and SEO copy" },
  { kind: "faq-article", label: "Help & articles", description: "FAQ, policy and onboarding content" },
] as const;

type ContentKind = (typeof CONTENT_KINDS)[number]["kind"];
type ContentResponse = InferClientOutput<typeof client.admin.buildkart.content.query>;
type ContentDocument = ContentResponse["documents"][number];
type ContentField = ContentResponse["definition"]["fields"][number];
type PublicationStatus = ContentDocument["publicationStatus"];

function statusColor(status: PublicationStatus): "green" | "orange" | "grey" {
  if (status === "published") return "green";
  if (status === "modified") return "orange";
  return "grey";
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
        if (Number.isNaN(parsed.getTime())) throw new Error(`${field.label} must contain a valid date and time.`);
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
  const testId = `content-field-${field.name}`;
  return (
    <div className="flex flex-col gap-y-2">
      <div>
        <Text size="small" weight="plus">
          {field.label}{field.required ? " *" : ""}
        </Text>
        {field.description ? (
          <Text size="xsmall" className="text-ui-fg-subtle">
            {field.description}
          </Text>
        ) : null}
      </div>
      {field.type === "enum" ? (
        <Select value={value} onValueChange={onChange}>
          <Select.Trigger data-testid={testId}>
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
          data-testid={testId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={field.type === "json" ? 10 : 5}
          placeholder={field.type === "json" ? "Enter valid JSON" : undefined}
        />
      ) : (
        <Input
          data-testid={testId}
          type={field.type === "datetime" ? "datetime-local" : field.type === "integer" ? "number" : "text"}
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
  const [editing, setEditing] = useState<ContentDocument | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const queryKey = useMemo(() => ["buildkart", "cms-content", kind, locale], [kind, locale]);
  const contentQuery = useQuery({
    queryKey,
    queryFn: () => client.admin.buildkart.content.query({ kind, locale }),
  });
  const content = contentQuery.data as ContentResponse | undefined;
  const documents = content?.documents ?? [];

  useEffect(() => {
    setShowEditor(false);
    setEditing(null);
    setFormValues({});
  }, [kind, locale]);

  const selectKind = (nextKind: ContentKind) => {
    setSearchParams({ kind: nextKind, locale });
  };

  const selectLocale = (nextLocale: "en-IN" | "hi-IN") => {
    setSearchParams({ kind, locale: nextLocale });
  };

  const mutation = useMutation({
    mutationFn: (input: {
      operation: "create-draft" | "update-draft" | "publish" | "unpublish";
      documentId?: string;
      data?: Record<string, unknown>;
    }) => client.admin.buildkart.content.mutate({ kind, locale, ...input }),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey });
      const verb = input.operation === "unpublish" ? "Unpublished" : input.operation === "publish" ? "Published" : "Draft saved";
      toast.success(verb);
      if (input.operation === "create-draft" || input.operation === "update-draft") setShowEditor(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Content operation failed."),
  });

  const openCreate = () => {
    if (!content) return;
    setEditing(null);
    setFormValues(initialForm(content.definition.fields));
    setShowEditor(true);
  };

  const openEdit = (document: ContentDocument) => {
    if (!content) return;
    setEditing(document);
    setFormValues(initialForm(content.definition.fields, document));
    setShowEditor(true);
  };

  const saveDraft = () => {
    if (!content) return;
    try {
      const data = parseForm(content.definition.fields, formValues);
      mutation.mutate({
        operation: editing ? "update-draft" : "create-draft",
        documentId: editing?.documentId,
        data,
      });
    } catch (error) {
      toast.error((error as Error).message);
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
        ? `${key} will become eligible for storefront delivery after validation and cache invalidation.`
        : `${key} will be removed from live CMS delivery. Governed fallback behavior still applies.`,
      confirmText: operation === "publish" ? "Publish" : "Unpublish",
      cancelText: "Cancel",
      variant: operation === "publish" ? "confirmation" : "danger",
    });
    if (confirmed) mutation.mutate({ operation, documentId: document.documentId });
  };

  const publishedCount = documents.filter((document) => document.publicationStatus === "published").length;
  const modifiedCount = documents.filter((document) => document.publicationStatus === "modified").length;
  const draftCount = documents.filter((document) => document.publicationStatus === "draft").length;

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
            <div className="flex max-w-3xl flex-col gap-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Content workspace</Heading>
                <StatusBadge color="blue">Strapi-backed</StatusBadge>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                Manage commerce and editorial operations from one console. Content remains in Strapi;
                products, price, inventory, sellers, orders and finance remain commerce-owned.
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="small">
                <Link to="/merchandising">Overview</Link>
              </Button>
              <Button asChild variant="secondary" size="small">
                <Link to="/merchandising-presets">Preset review</Link>
              </Button>
              <div className="w-36">
                <Select value={locale} onValueChange={(value) => selectLocale(value as "en-IN" | "hi-IN")}>
                  <Select.Trigger data-testid="content-locale-select">
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
          <div className="grid gap-2 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {CONTENT_KINDS.map((item) => (
              <Button
                key={item.kind}
                variant={kind === item.kind ? "primary" : "secondary"}
                className="h-auto justify-start px-4 py-3 text-left"
                onClick={() => selectKind(item.kind)}
                data-testid={`content-kind-${item.kind}`}
              >
                <span className="flex flex-col items-start">
                  <span>{item.label}</span>
                  <span className="text-xs font-normal opacity-75">{item.description}</span>
                </span>
              </Button>
            ))}
          </div>
        </Container>

        {content ? (
          <Container className="divide-y p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <Heading level="h2">{content.definition.label}</Heading>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {content.definition.description}
                </Text>
              </div>
              <Button size="small" onClick={openCreate} data-testid="content-create-draft">
                Create draft
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 px-6 py-4">
              <div><Text size="xsmall" className="text-ui-fg-subtle">Published</Text><Text size="large" weight="plus">{publishedCount}</Text></div>
              <div><Text size="xsmall" className="text-ui-fg-subtle">Modified drafts</Text><Text size="large" weight="plus">{modifiedCount}</Text></div>
              <div><Text size="xsmall" className="text-ui-fg-subtle">Unpublished drafts</Text><Text size="large" weight="plus">{draftCount}</Text></div>
            </div>
          </Container>
        ) : null}

        <Container className="overflow-hidden p-0">
          {contentQuery.isPending ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">Loading content…</Text>
          ) : contentQuery.isError || !content ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-error">The private CMS is unavailable or this account lacks content permission.</Text>
          ) : documents.length === 0 ? (
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">No {content.definition.label.toLowerCase()} exist for {locale}.</Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Title</Table.HeaderCell>
                  <Table.HeaderCell>Key</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Updated</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {documents.map((document) => (
                  <Table.Row key={document.documentId}>
                    <Table.Cell><Text size="small" weight="plus">{displayValue(document, content.definition.titleField)}</Text></Table.Cell>
                    <Table.Cell><Text size="small" className="text-ui-fg-subtle">{displayValue(document, content.definition.keyField)}</Text></Table.Cell>
                    <Table.Cell><StatusBadge color={statusColor(document.publicationStatus)}>{document.publicationStatus}</StatusBadge></Table.Cell>
                    <Table.Cell>{new Date(document.updatedAt).toLocaleString("en-IN")}</Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="small" onClick={() => openEdit(document)} data-testid={`content-edit-${document.documentId}`}>Edit</Button>
                        {document.publicationStatus === "published" ? (
                          <Button variant="secondary" size="small" onClick={() => changePublication(document, "unpublish")} isLoading={mutation.isPending} data-testid={`content-unpublish-${document.documentId}`}>Unpublish</Button>
                        ) : (
                          <Button size="small" onClick={() => changePublication(document, "publish")} isLoading={mutation.isPending} data-testid={`content-publish-${document.documentId}`}>Publish</Button>
                        )}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>

        <Drawer open={showEditor} onOpenChange={(open) => setShowEditor(open)}>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>{editing ? "Edit draft" : "Create draft"}</Drawer.Title>
              <Drawer.Description>
                Changes are saved as a draft. Publishing remains a separate confirmed action.
              </Drawer.Description>
            </Drawer.Header>
            <Drawer.Body>
              <div className="flex flex-col gap-y-5 py-2">
                {content?.definition.fields.map((field) => (
                  <FieldInput
                    key={field.name}
                    field={field}
                    value={formValues[field.name] ?? ""}
                    onChange={(value) => setFormValues((current) => ({ ...current, [field.name]: value }))}
                  />
                ))}
              </div>
            </Drawer.Body>
            <Drawer.Footer>
              <Drawer.Close asChild>
                <Button variant="secondary" size="small" data-testid="content-cancel-edit">Cancel</Button>
              </Drawer.Close>
              <Button onClick={saveDraft} isLoading={mutation.isPending} size="small" data-testid="content-save-draft">
                Save draft
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer>
      </div>
    </SingleColumnPage>
  );
}
