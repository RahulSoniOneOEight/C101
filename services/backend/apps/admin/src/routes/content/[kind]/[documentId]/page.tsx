import { Button, Container, Heading, Hint, Label, Select, StatusBadge, Text, toast, usePrompt } from "@medusajs/ui";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { client } from "../../../../lib/client";
import { ContentFieldInput } from "../../content-field-input";
import {
  CONTENT_LOCALES,
  contentDocumentRoute,
  contentKind,
  contentKindRoute,
  displayValue,
  initialForm,
  isContentKind,
  parseForm,
  statusColor,
  statusLabel,
  type ContentDocument,
  type ContentKind,
  type ContentLocale,
  type ContentResponse,
} from "../../content-model";
import { validateStoredSections, type LayoutChannel } from "../../layout-section-model";

/**
 * CHG-063 ? resolves a rule-based collection against the governed catalogue.
 *
 * Operators can otherwise publish a category rule that resolves nothing and
 * only discover it on the storefront. This preview uses the same catalogue
 * payload the app reads; it never invents products or prices.
 */
const EXPERIENCE_API_BASE = (
  (import.meta.env.VITE_EXPERIENCE_API_BASE_URL as string | undefined) ??
  "https://api-staging.pinakaplay.cloud"
).replace(/\/+$/, "");

type PreviewProduct = {
  id: string;
  title: string;
  thumbnail: string | null;
  category: string | null;
};

function parseStringArray(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function CollectionRulePreview({
  categoryLabelsRaw,
  productIdsRaw,
  limitRaw,
}: {
  categoryLabelsRaw: string | undefined;
  productIdsRaw: string | undefined;
  limitRaw: string | undefined;
}) {
  const categoryLabels = parseStringArray(categoryLabelsRaw);
  const productIds = parseStringArray(productIdsRaw);
  const limit = Math.max(1, Number.parseInt(limitRaw ?? "", 10) || 20);
  const catalogue = useQuery({
    queryKey: ["buildkart", "catalogue-preview"],
    queryFn: async (): Promise<PreviewProduct[]> => {
      const response = await fetch(
        `${EXPERIENCE_API_BASE}/v1/products?limit=250&offset=0&catalogue_import=CHG-049`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(`The catalogue returned ${response.status}.`);
      }
      const body = await response.json() as {
        products?: Array<{
          id?: string;
          title?: string;
          thumbnail?: string | null;
          metadata?: { category_l1?: string } | null;
        }>;
      };
      return (body.products ?? []).flatMap((product) =>
        typeof product.id === "string" && typeof product.title === "string"
          ? [{
              id: product.id,
              title: product.title,
              thumbnail: product.thumbnail ?? null,
              category: product.metadata?.category_l1 ?? null,
            }]
          : []);
    },
    staleTime: 5 * 60 * 1000,
  });

  const products = catalogue.data ?? [];
  const labels = new Set(categoryLabels.map((label) => label.toLowerCase()));
  const explicit = productIds.length > 0;
  const matched = explicit
    ? productIds
        .map((id) => products.find((product) => product.id === id))
        .filter((product): product is PreviewProduct => Boolean(product))
    : products
        .filter((product) => product.category && labels.has(product.category.toLowerCase()))
        .slice(0, limit);
  const missingIds = explicit
    ? productIds.filter((id) => !products.some((product) => product.id === id))
    : [];

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Resolved products</Heading>
        <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
          What this collection will show on the storefront, resolved from the live staged catalogue.
          Explicit product references win; otherwise the category rule applies, capped at {limit}.
        </Text>
      </div>
      <div className="px-6 py-5">
        {catalogue.isPending ? (
          <Text size="small" className="text-ui-fg-subtle">Resolving?</Text>
        ) : catalogue.isError ? (
          <Text size="small" className="text-ui-fg-error">
            The catalogue could not be reached, so this rule cannot be previewed right now.
          </Text>
        ) : productIds.length === 0 && categoryLabels.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Add a category rule or explicit product references to preview this collection.
          </Text>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge color={matched.length === 0 ? "red" : "green"}>
                {matched.length} {matched.length === 1 ? "product" : "products"}
              </StatusBadge>
              {explicit ? (
                <Text size="xsmall" className="text-ui-fg-subtle">Explicit references</Text>
              ) : null}
              {!explicit && categoryLabels.length > 0 ? (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Rule: {categoryLabels.join(" + ")}
                </Text>
              ) : null}
            </div>
            {missingIds.length > 0 ? (
              <Text size="small" className="text-ui-fg-error">
                {missingIds.length} reference{missingIds.length === 1 ? "" : "s"} not found:{" "}
                {missingIds.slice(0, 3).join(", ")}
                {missingIds.length > 3 ? "?" : ""}
              </Text>
            ) : null}
            {matched.length === 0 ? (
              <Text size="small" className="text-ui-fg-error">
                This rule resolves no product. Check the category labels against the catalogue.
              </Text>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {matched.slice(0, 6).map((product) => (
                  <li key={product.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-ui-border-base p-2">
                    {product.thumbnail ? (
                      <img src={product.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-ui-bg-subtle" />
                    )}
                    <div className="min-w-0">
                      <Text size="small" weight="plus" className="truncate">{product.title}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">{product.category ?? "Uncategorised"}</Text>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {matched.length > 6 ? (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Showing the first 6 of {matched.length}.
              </Text>
            ) : null}
          </div>
        )}
      </div>
    </Container>
  );
}

function DraftEditor({
  kind,
  locale,
  content,
  document,
  creating,
}: {
  kind: ContentKind;
  locale: ContentLocale;
  content: ContentResponse;
  document?: ContentDocument;
  creating: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const documentId = document?.documentId;
  const kindConfig = contentKind(kind);
  const localeLabel = CONTENT_LOCALES.find((item) => item.value === locale)!.label;
  const queryKey = useMemo(
    () => ["buildkart", "cms-content", kind, locale],
    [kind, locale],
  );
  const startingValues = useMemo(
    () => initialForm(content.definition.fields, document),
    [content.definition.fields, document],
  );
  const [formValues, setFormValues] = useState<Record<string, string>>(startingValues);
  const [initialValues, setInitialValues] = useState<Record<string, string>>(startingValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null);
  const isDirty = JSON.stringify(formValues) !== JSON.stringify(initialValues);

  // A category editorial points at a commerce category by id. Operators should pick it from a list
  // rather than paste an id (and a name is rejected downstream anyway).
  const categoriesQuery = useQuery({
    queryKey: ["buildkart", "commerce-categories"],
    queryFn: () => client.admin.buildkart.categories.query(),
    enabled: kind === "category-editorial",
    staleTime: 5 * 60 * 1000,
  });
  const categoryOptions = categoriesQuery.data?.categories ?? [];

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => client.admin.buildkart.content.mutate({
      kind,
      locale,
      operation: creating ? "create-draft" : "update-draft",
      documentId: creating ? undefined : documentId,
      data,
    }),
    onSuccess: async (result) => {
      setInitialValues(formValues);
      setFormError(null);
      toast.success("Draft saved");
      await queryClient.invalidateQueries({ queryKey });
      if (creating && typeof result.document?.documentId === "string") {
        setCreatedDocumentId(result.document.documentId);
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Draft could not be saved.";
      setFormError(message);
      toast.error(message);
    },
  });

  const saveDraft = useCallback(() => {
    if (mutation.isPending) return;
    try {
      const data = parseForm(content.definition.fields, formValues);
      // The section editor blocks an invalid layout before saving; this raw JSON view is the advanced
      // and recovery path, so it has to apply the same rules. Without this an operator could store
      // sections that delivery silently drops, with no indication why the storefront ignored them.
      if (kind === "storefront-layout") {
        const channel: LayoutChannel = data.channel === "b2b" ? "b2b" : "b2c";
        const { errors } = validateStoredSections(data.sections, channel);
        if (errors.length > 0) {
          throw new Error(`Layout sections would not be served: ${errors.join(" ")}`);
        }
      }
      setFormError(null);
      mutation.mutate(data);
    } catch (error) {
      const message = (error as Error).message;
      setFormError(message);
      toast.error(message);
    }
  }, [content.definition.fields, formValues, mutation, kind]);

  useEffect(() => {
    if (!createdDocumentId || isDirty) return;
    navigate(contentDocumentRoute(kind, createdDocumentId, locale), { replace: true });
  }, [createdDocumentId, isDirty, kind, locale, navigate]);

  const blocker = useBlocker(isDirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    void prompt({
      title: "Discard unsaved draft changes?",
      description: "Your changes have not been saved to the CMS draft.",
      confirmText: "Discard changes",
      cancelText: "Continue editing",
      variant: "danger",
    }).then((confirmed) => {
      if (!active) return;
      if (confirmed) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker, prompt]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);  }, [isDirty]);

  useEffect(() => {
    const keyboardSave = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "s") return;
      event.preventDefault();
      saveDraft();
    };
    window.addEventListener("keydown", keyboardSave);
    return () => window.removeEventListener("keydown", keyboardSave);
  }, [saveDraft]);

  const routineFields = content.definition.fields.filter((field) => field.type !== "json");
  const structuredFields = content.definition.fields.filter(
    (field) => field.type === "json",
  );
  const libraryRoute = contentKindRoute(kind, locale);
  const title = creating
    ? `Create ${kindConfig.label.toLocaleLowerCase()} draft`
    : displayValue(document!, content.definition.titleField);

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <Text size="xsmall" className="text-ui-fg-subtle">
                <Link to={libraryRoute} className="hover:text-ui-fg-interactive">{kindConfig.label}</Link>
                {" / Draft editor"}
              </Text>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Heading level="h1">{title}</Heading>
                <StatusBadge color={creating ? "grey" : statusColor(document!.publicationStatus)}>
                  {creating ? "New draft" : statusLabel(document!.publicationStatus)}
                </StatusBadge>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                {mutation.isPending
                  ? "Saving draft…"
                  : isDirty
                    ? "Unsaved changes"
                    : "All changes saved to the draft. Nothing is published from this editor."}
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="small">
                <Link to={libraryRoute}>Back to {kindConfig.label.toLocaleLowerCase()}</Link>
              </Button>
              <Button
                size="small"
                onClick={saveDraft}
                isLoading={mutation.isPending}
                disabled={!creating && !isDirty}
                data-testid="content-save-draft"
              >
                Save draft
              </Button>
            </div>
          </div>
        </Container>

        {formError ? (
          <Container role="alert" className="border-ui-border-error px-6 py-4">
            <Heading level="h2">Draft could not be saved</Heading>
            <Hint variant="error" className="mt-1">{formError}</Hint>
          </Container>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-y-3">
            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">Content details</Heading>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Fields marked with an asterisk are required before the draft can be saved.
                </Text>
              </div>
              <div className="flex flex-col gap-y-5 px-6 py-5">
                {routineFields.map((field) =>
                  kind === "category-editorial" && field.name === "categoryId" ? (
                    <div key={field.name} className="flex flex-col gap-y-1">
                      <Label htmlFor="category-reference" size="small">
                        Commerce category
                      </Label>
                      <Select
                        value={formValues.categoryId || undefined}
                        onValueChange={(value) => {
                          setFormError(null);
                          setFormValues((current) => ({ ...current, categoryId: value }));
                        }}
                      >
                        <Select.Trigger id="category-reference">
                          <Select.Value placeholder="Choose a category" />
                        </Select.Trigger>
                        <Select.Content>
                          {categoryOptions.map((category) => (
                            <Select.Item key={category.id} value={category.id}>
                              {category.name}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {categoriesQuery.isError
                          ? "The category list could not be loaded. Reopen the editor to retry."
                          : "Stores the Medusa category id. Renaming the category does not change it."}
                      </Text>
                    </div>
                  ) : (
                    <ContentFieldInput
                      key={field.name}
                      field={field}
                      value={formValues[field.name] ?? ""}
                      onChange={(value) => {
                        setFormError(null);
                        setFormValues((current) => ({ ...current, [field.name]: value }));
                      }}
                    />
                  ),
                )}
              </div>
            </Container>

            {structuredFields.length > 0 ? (
              <Container className="divide-y p-0">
                <div className="px-6 py-4">
                  <Heading level="h2">Advanced structured content</Heading>
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    Expert staging control retained until a governed visual builder is approved.
                  </Text>
                </div>
                <div className="flex flex-col gap-y-5 px-6 py-5">
                  {structuredFields.map((field) => (
                    <ContentFieldInput
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
              </Container>
            ) : null}

            {kind === "curated-collection" ? (
              <CollectionRulePreview
                categoryLabelsRaw={formValues.categoryLabels}
                productIdsRaw={formValues.productIds}
                limitRaw={formValues.limit}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-y-3">
            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">Draft context</Heading>
              </div>
              <dl className="divide-y">
                <div className="px-6 py-4">
                  <dt><Text size="xsmall" className="text-ui-fg-subtle">Content type</Text></dt>
                  <dd><Text size="small" weight="plus">{kindConfig.label}</Text></dd>
                </div>
                <div className="px-6 py-4">
                  <dt><Text size="xsmall" className="text-ui-fg-subtle">Locale</Text></dt>
                  <dd><Text size="small" weight="plus">{localeLabel}</Text></dd>
                </div>
                <div className="px-6 py-4">
                  <dt><Text size="xsmall" className="text-ui-fg-subtle">Storefront delivery</Text></dt>
                  <dd className="mt-1">
                    <StatusBadge color={kindConfig.deliveryColor}>{kindConfig.delivery}</StatusBadge>
                  </dd>
                </div>
                {!creating ? (
                  <div className="px-6 py-4">
                    <dt><Text size="xsmall" className="text-ui-fg-subtle">Document ID</Text></dt>
                    <dd><Text size="xsmall" className="break-all">{documentId}</Text></dd>
                  </div>
                ) : null}
              </dl>
            </Container>

            <Container className="px-6 py-5">
              <Heading level="h2">Authoritative boundary</Heading>
              <Text size="small" className="mt-2 text-ui-fg-subtle">
                This editor changes presentation only. Product membership, category hierarchy,
                prices, inventory, promotions and campaigns stay in their native Medusa controls.
              </Text>
            </Container>

            <Container className="px-6 py-5">
              <Heading level="h2">Keyboard</Heading>
              <Text size="small" className="mt-2 text-ui-fg-subtle">
                Press Ctrl+S or Command+S to save the draft. Publishing remains a separate action
                from the content library until the governed review workflow is approved.
              </Text>
            </Container>
          </div>
        </div>
      </div>
    </SingleColumnPage>
  );
}

export default function ContentDocumentPage() {
  const { kind: kindParam, documentId: documentIdParam } = useParams<{
    kind: string;
    documentId: string;
  }>();
  const [searchParams] = useSearchParams();
  const routeKind = isContentKind(kindParam) ? kindParam : null;
  const kind = routeKind ?? "banner";
  const documentId = documentIdParam ?? "";
  const creating = documentId === "new";
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const queryKey = useMemo(
    () => ["buildkart", "cms-content", kind, locale],
    [kind, locale],
  );
  const contentQuery = useQuery({
    queryKey,
    queryFn: () => client.admin.buildkart.content.query({ kind, locale }),
    enabled: Boolean(routeKind && documentId),
  });
  const content = contentQuery.data as ContentResponse | undefined;
  const document = content?.documents.find(
    (candidate) => candidate.documentId === documentId,
  );
  const libraryRoute = contentKindRoute(kind, locale);

  if (!routeKind || !documentId) {
    return (
      <SingleColumnPage>
        <Container className="p-6">
          <Heading level="h1">Content route is invalid</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Open the content library and choose a governed content type.
          </Text>
          <Button asChild variant="secondary" size="small" className="mt-4">
            <Link to="/merchandising/banners">Back to banners</Link>
          </Button>
        </Container>
      </SingleColumnPage>
    );
  }

  if (contentQuery.isPending) {
    return (
      <SingleColumnPage>
        <Container className="p-6">
          <Text size="small" className="text-ui-fg-subtle">Loading draft editor…</Text>
        </Container>
      </SingleColumnPage>
    );
  }

  if (contentQuery.isError || !content || (!creating && !document)) {
    return (
      <SingleColumnPage>
        <Container className="p-6">
          <Heading level="h1">Draft could not be opened</Heading>
          <Text size="small" className="mt-1 text-ui-fg-error">
            The content service is unavailable, the document does not exist in this locale, or
            this account lacks permission.
          </Text>
          <Button asChild variant="secondary" size="small" className="mt-4">
            <Link to={libraryRoute}>Back to property page</Link>
          </Button>
        </Container>
      </SingleColumnPage>
    );
  }

  const editorKey = creating
    ? `${kind}:${locale}:new`
    : `${kind}:${locale}:${document!.documentId}:${document!.updatedAt}`;

  return (
    <DraftEditor
      key={editorKey}
      kind={kind}
      locale={locale}
      content={content}
      document={document}
      creating={creating}
    />
  );
}
