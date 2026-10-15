import { Button, Container, Heading, Hint, StatusBadge, Text, toast, usePrompt } from "@medusajs/ui";
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
      setFormError(null);
      mutation.mutate(data);
    } catch (error) {
      const message = (error as Error).message;
      setFormError(message);
      toast.error(message);
    }
  }, [content.definition.fields, formValues, mutation]);

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
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isDirty]);

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
    (field) => field.type === "json"
      && !(kind === "curated-collection" && field.name === "productIds"),
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
                {routineFields.map((field) => (
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
