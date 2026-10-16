import {
  Button,
  Container,
  FocusModal,
  Heading,
  Hint,
  Input,
  Label,
  Select,
  StatusBadge,
  Switch,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { client } from "../../../lib/client";
import {
  CONTENT_LOCALES,
  statusColor,
  statusLabel,
  type ContentDocument,
  type ContentLocale,
  type ContentResponse,
} from "../content-model";
import {
  CTA_TARGET_LABELS,
  CTA_TARGET_TYPES,
  EMPTY_BANNER_FORM,
  IST_TIMEZONE,
  PREVIEW_DEVICES,
  SUPPORTED_PLACEMENTS,
  THEME_LABELS,
  audienceLabel,
  bannerTitle,
  formFromDocument,
  isRecognisedPlacement,
  localeLabel,
  placementLabel,
  serializeBannerForm,
  validateBannerForm,
  type BannerForm,
  type PreviewDevice,
} from "./banner-model";
import { BannerPreview } from "./banner-preview";

function placementOptions(current: string) {
  if (!current || SUPPORTED_PLACEMENTS.some((option) => option.value === current)) {
    return SUPPORTED_PLACEMENTS;
  }
  return [...SUPPORTED_PLACEMENTS, { value: current, label: `${placementLabel(current)} (not rendered)` }];
}

function Field({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-y-2">
      <div>
        <Label htmlFor={id} size="small" weight="plus">{label}</Label>
        {description ? (
          <Text size="xsmall" className="text-ui-fg-subtle">{description}</Text>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function BannerEditor({
  open,
  onOpenChange,
  locale,
  document,
  creating,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: ContentLocale;
  response?: ContentResponse;
  document?: ContentDocument;
  creating: boolean;
  onSaved: () => Promise<unknown> | void;
}) {
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const alternateLocale: ContentLocale = locale === "en-IN" ? "hi-IN" : "en-IN";
  const documentId = document?.documentId;

  const [activeLocale, setActiveLocale] = useState<ContentLocale>(locale);
  const [form, setForm] = useState<BannerForm>(
    () => (document ? formFromDocument(document) : EMPTY_BANNER_FORM),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(
    document ? formFromDocument(document) : EMPTY_BANNER_FORM,
  ));
  const [errors, setErrors] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>("app");
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const alternateQuery = useQuery({
    queryKey: ["buildkart", "cms-content", "banner", alternateLocale],
    queryFn: () => client.admin.buildkart.content.query({ kind: "banner", locale: alternateLocale }),
    enabled: open && Boolean(documentId),
  });
  const alternateDocument = useMemo(
    () => alternateQuery.data?.documents.find((item) => item.documentId === documentId),
    [alternateQuery.data, documentId],
  );

  // The page remounts this editor per record (`key`), so initial state is enough: no reset effect.

  const dirty = JSON.stringify(form) !== baseline;
  const editingTranslation = activeLocale !== locale;
  const targetDocument = editingTranslation ? alternateDocument : document;
  const targetIsCreate = editingTranslation ? !alternateDocument : creating;
  const canPublish = Boolean(documentId) || !targetIsCreate;

  const update = useCallback((patch: Partial<BannerForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors([]);
    setConflict(false);
  }, []);

  const previewData = useMemo(() => serializeBannerForm(form), [form]);

  const preview = useMutation({
    mutationFn: (input: { locale: ContentLocale; data: Record<string, unknown> }) =>
      client.admin.buildkart.content.preview.mutate({
        kind: "banner",
        locale: input.locale,
        data: input.data,
      }),
  });
  const { mutate: runPreview, reset: resetPreview } = preview;

  useEffect(() => {
    if (!open || !previewEnabled) return;
    const timer = setTimeout(() => {
      runPreview({ locale: activeLocale, data: previewData });
    }, 350);
    return () => clearTimeout(timer);
  }, [open, previewEnabled, activeLocale, previewData, runPreview]);

  useEffect(() => {
    if (!open) resetPreview();
  }, [open, resetPreview]);

  const persistDraft = useCallback(async () => {
    const data = serializeBannerForm(form);
    if (targetIsCreate && !editingTranslation) {
      return client.admin.buildkart.content.mutate({
        kind: "banner",
        locale: activeLocale,
        operation: "create-draft",
        data,
      });
    }
    return client.admin.buildkart.content.mutate({
      kind: "banner",
      locale: activeLocale,
      operation: "update-draft",
      documentId,
      data,
      expectedUpdatedAt: targetDocument?.updatedAt,
    });
  }, [activeLocale, documentId, editingTranslation, form, targetDocument, targetIsCreate]);

  const describeError = useCallback((error: unknown, fallback: string) => {
    // Medusa rewrites a CONFLICT message to a generic string, so the status (not the text) is the
    // reliable signal. The message check stays as a secondary guard for direct CMS responses.
    const status = (error as { status?: number } | null)?.status;
    const message = error instanceof Error ? error.message : fallback;
    if (status === 409 || /changed after you opened it/i.test(message)) {
      setConflict(true);
      return null;
    }
    setErrors([message]);
    return message;
  }, []);

  const saveMutation = useMutation({
    mutationFn: persistDraft,
    onSuccess: async (result) => {
      setBaseline(JSON.stringify(form));
      setErrors([]);
      setConflict(false);
      toast.success("Draft saved. The published banner is unchanged.");
      await queryClient.invalidateQueries({ queryKey: ["buildkart", "cms-content", "banner"] });
      await onSaved();
      if (creating && typeof result?.document?.documentId === "string") {
        onOpenChange(false);
      }
    },
    onError: (error) => {
      const message = describeError(error, "The draft could not be saved.");
      if (message) toast.error(message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const saved = await persistDraft();
      const savedId = typeof saved?.document?.documentId === "string"
        ? saved.document.documentId
        : documentId;
      if (!savedId) throw new Error("Save the draft before publishing.");
      return client.admin.buildkart.content.mutate({
        kind: "banner",
        locale: activeLocale,
        operation: "publish",
        documentId: savedId,
      });
    },
    onSuccess: async () => {
      setReviewOpen(false);
      setBaseline(JSON.stringify(form));
      toast.success("Banner published. Delivery follows the schedule and the projection refresh.");
      await queryClient.invalidateQueries({ queryKey: ["buildkart", "cms-content", "banner"] });
      await onSaved();
      onOpenChange(false);
    },
    onError: (error) => {
      const message = describeError(error, "The banner could not be published.");
      setReviewOpen(false);
      if (message) toast.error(message);
    },
  });

  const requestSave = useCallback(() => {
    const problems = validateBannerForm(form, { requireContent: false });
    if (problems.length > 0) {
      setErrors(problems);
      toast.error(problems[0]);
      return;
    }
    saveMutation.mutate();
  }, [form, saveMutation]);

  const requestPublish = useCallback(() => {
    const problems = validateBannerForm(form, { requireContent: true });
    if (problems.length > 0) {
      setErrors(problems);
      toast.error(problems[0]);
      return;
    }
    setReviewOpen(true);
  }, [form]);

  const attemptClose = useCallback(async (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    const confirmed = await prompt({
      title: "Discard unsaved changes?",
      description: "These edits have not been written to the CMS draft.",
      confirmText: "Discard changes",
      cancelText: "Continue editing",
      variant: "danger",
    });
    if (confirmed) onOpenChange(false);
  }, [dirty, onOpenChange, prompt]);

  const switchLocale = useCallback((next: ContentLocale) => {
    if (next === activeLocale) return;
    setActiveLocale(next);
    const source = next === locale ? document : alternateDocument;
    if (source) {
      const initial = formFromDocument(source);
      setForm(initial);
      setBaseline(JSON.stringify(initial));
    } else {
      setBaseline(JSON.stringify(form));
      toast.info(`No ${localeLabel(next)} draft yet. Saving will create one.`);
    }
    setErrors([]);
    setConflict(false);
  }, [activeLocale, alternateDocument, document, form, locale]);

  const busy = publishMutation.isPending || saveMutation.isPending;

  return (
    <>
      <FocusModal open={open} onOpenChange={(next) => { void attemptClose(next); }}>
        <FocusModal.Content className="max-w-[80rem]">
          <FocusModal.Header>
            <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
              <div>
                <FocusModal.Title>
                  {targetIsCreate ? "Create banner" : `Edit ${bannerTitle((targetDocument ?? document) as ContentDocument)}`}
                </FocusModal.Title>
                <FocusModal.Description className="text-ui-fg-subtle">
                  Editorial presentation only. Product membership, offers, prices and promotions stay in
                  their native Medusa controls.
                </FocusModal.Description>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge color="orange">Staging</StatusBadge>
                {targetDocument ? (
                  <StatusBadge color={statusColor(targetDocument.publicationStatus)}>
                    {statusLabel(targetDocument.publicationStatus)}
                  </StatusBadge>
                ) : (
                  <StatusBadge color="grey">New draft</StatusBadge>
                )}
              </div>
            </div>
          </FocusModal.Header>

          <FocusModal.Body className="overflow-y-auto px-6 py-6">
            {errors.length > 0 ? (
              <Container className="mb-4 border-ui-border-error px-6 py-4">
                <Heading level="h2">This banner needs attention</Heading>
                <ul className="mt-2 list-disc pl-4">
                  {errors.map((error) => (
                    <li key={error}><Text size="small" className="text-ui-fg-error">{error}</Text></li>
                  ))}
                </ul>
              </Container>
            ) : null}

            {conflict ? (
              <Container className="mb-4 px-6 py-4">
                <Heading level="h2">Someone else changed this banner</Heading>
                <Text size="small" className="mt-1 text-ui-fg-subtle">
                  The stored draft is newer than the copy in this editor, so the save was stopped
                  instead of overwriting their work.
                </Text>
                <Button
                  size="small"
                  variant="secondary"
                  className="mt-3"
                  onClick={async () => {
                    await queryClient.invalidateQueries({ queryKey: ["buildkart", "cms-content", "banner"] });
                    await onSaved();
                    onOpenChange(false);
                  }}
                >
                  Close and reload
                </Button>
              </Container>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="flex min-w-0 flex-col gap-6">
                <section className="flex flex-col gap-y-5">
                  <div>
                    <Heading level="h2">01 · Details and placement</Heading>
                    <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                      Routine details first. Technical identifiers live under advanced settings.
                    </Text>
                  </div>
                  <Field
                    id="banner-name"
                    label="Internal name"
                    description="How operators find this banner. Never shown to customers."
                  >
                    <Input
                      id="banner-name"
                      value={form.name}
                      maxLength={80}
                      onChange={(event) => update({ name: event.target.value })}
                      data-testid="banner-name"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      id="banner-placement"
                      label="Placement"
                      description={isRecognisedPlacement(form.placement)
                        ? "Where the home screen renders this banner. Membership and ordering stay in storefront layouts."
                        : "This placement is not rendered by the app. Choose a supported slot so the banner can appear."}
                    >
                      <Select value={form.placement} onValueChange={(value) => update({ placement: value })}>
                        <Select.Trigger id="banner-placement"><Select.Value /></Select.Trigger>
                        <Select.Content>
                          {placementOptions(form.placement).map((option) => (
                            <Select.Item key={option.value} value={option.value}>{option.label}</Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Field>
                    <Field id="banner-audience" label="Audience">
                      <Select value={form.audience} onValueChange={(value) => update({ audience: value })}>
                        <Select.Trigger id="banner-audience"><Select.Value /></Select.Trigger>
                        <Select.Content>
                          <Select.Item value="both">B2B + B2C</Select.Item>
                          <Select.Item value="b2c">B2C customers</Select.Item>
                          <Select.Item value="b2b">B2B buyers</Select.Item>
                        </Select.Content>
                      </Select>
                    </Field>
                    <Field id="banner-language" label="Language" description="Each language is a separate CMS record.">
                      <Select value={activeLocale} onValueChange={(value) => switchLocale(value as ContentLocale)}>
                        <Select.Trigger id="banner-language"><Select.Value /></Select.Trigger>
                        <Select.Content>
                          {CONTENT_LOCALES.map((item) => (
                            <Select.Item key={item.value} value={item.value}>{item.label}</Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Field>
                    <Field
                      id="banner-channel"
                      label="Channel"
                      description="Not stored per banner today. Channel comes from the storefront layout."
                    >
                      <Input id="banner-channel" value="Governed by storefront layout" disabled readOnly />
                    </Field>
                  </div>
                </section>

                <section className="flex flex-col gap-y-5">
                  <div>
                    <Heading level="h2">02 · Creative and copy</Heading>
                    <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                      Media upload, crop and focal point are not enabled yet. Reference an approved
                      https creative instead.
                    </Text>
                  </div>
                  <Field
                    id="banner-image"
                    label="Creative reference (https)"
                    description="Approved staging creative. Media-library upload and crop are deferred."
                  >
                    <Input
                      id="banner-image"
                      type="url"
                      placeholder="https://…"
                      value={form.externalImageUrl}
                      onChange={(event) => update({ externalImageUrl: event.target.value })}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="banner-theme" label="Colour theme" description="Allowlisted design-system key.">
                      <Select value={form.themeKey} onValueChange={(value) => update({ themeKey: value })}>
                        <Select.Trigger id="banner-theme"><Select.Value /></Select.Trigger>
                        <Select.Content>
                          {Object.entries(THEME_LABELS).map(([value, label]) => (
                            <Select.Item key={value} value={value}>{label}</Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Field>
                    <Field id="banner-crop" label="Image crop" description="Not supported yet.">
                      <Input id="banner-crop" value="Fixed by the customer app" disabled readOnly />
                    </Field>
                  </div>
                  <Field id="banner-heading" label="Heading" description="Customer-facing. Use a line break for a two-line hero.">
                    <Textarea
                      id="banner-heading"
                      rows={2}
                      maxLength={120}
                      value={form.title}
                      onChange={(event) => update({ title: event.target.value })}
                      data-testid="banner-heading"
                    />
                  </Field>
                  <Field id="banner-subtitle" label="Supporting text">
                    <Textarea
                      id="banner-subtitle"
                      rows={2}
                      maxLength={160}
                      value={form.subtitle}
                      onChange={(event) => update({ subtitle: event.target.value })}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="banner-cta-label" label="Button label">
                      <Input
                        id="banner-cta-label"
                        maxLength={25}
                        value={form.ctaLabel}
                        onChange={(event) => update({ ctaLabel: event.target.value })}
                      />
                    </Field>
                    <Field id="banner-alt" label="Image alternative text" description="Required before publishing.">
                      <Input
                        id="banner-alt"
                        value={form.imageAltText}
                        onChange={(event) => update({ imageAltText: event.target.value })}
                        data-testid="banner-alt"
                      />
                    </Field>
                  </div>
                </section>

                <section className="flex flex-col gap-y-5">
                  <div>
                    <Heading level="h2">03 · Destination</Heading>
                    <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                      Editorial references only. Searchable commerce pickers are not available yet, so
                      enter the governed reference directly.
                    </Text>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="banner-dest-type" label="Destination type">
                      <Select value={form.ctaTargetType} onValueChange={(value) => update({ ctaTargetType: value })}>
                        <Select.Trigger id="banner-dest-type"><Select.Value /></Select.Trigger>
                        <Select.Content>
                          {CTA_TARGET_TYPES.map((value) => (
                            <Select.Item key={value} value={value}>{CTA_TARGET_LABELS[value]}</Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Field>
                    <Field
                      id="banner-dest-target"
                      label={form.ctaTargetType === "url" ? "External URL" : "Reference"}
                      description={form.ctaTargetType === "route"
                        ? "Must start with '/', for example /browse?tag=Flash%20Deals."
                        : form.ctaTargetType === "url"
                          ? "Must be an https URL."
                          : "Enter the governed commerce reference id."}
                    >
                      <Input
                        id="banner-dest-target"
                        value={form.ctaTargetId}
                        onChange={(event) => update({ ctaTargetId: event.target.value })}
                      />
                    </Field>
                  </div>
                </section>

                <section className="flex flex-col gap-y-5">
                  <div>
                    <Heading level="h2">04 · Schedule</Heading>
                    <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                      All times are {IST_TIMEZONE} (IST). Publishing now makes the banner eligible from
                      the chosen start time.
                    </Text>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      id="banner-start-mode"
                      checked={form.startMode === "later"}
                      onCheckedChange={(checked) => update({ startMode: checked ? "later" : "now" })}
                    />
                    <Label htmlFor="banner-start-mode" size="small">
                      Schedule a future start instead of starting immediately
                    </Label>
                  </div>
                  {form.startMode === "later" ? (
                    <Field id="banner-starts-at" label="Starts at (IST)">
                      <Input
                        id="banner-starts-at"
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(event) => update({ startsAt: event.target.value })}
                      />
                    </Field>
                  ) : null}
                  <Field id="banner-ends-at" label="Ends at (IST) — optional">
                    <Input
                      id="banner-ends-at"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => update({ endsAt: event.target.value })}
                    />
                  </Field>
                </section>

                <section className="flex flex-col gap-y-5">
                  <div>
                    <Heading level="h2">Advanced settings</Heading>
                    <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                      Technical identifiers and recovery fields. Segment targeting is not delivered yet.
                    </Text>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="banner-key" label="Technical key" description="Stable key referenced by storefront layouts.">
                      <Input
                        id="banner-key"
                        value={form.contentKey}
                        onChange={(event) => update({ contentKey: event.target.value })}
                        data-testid="banner-key"
                      />
                    </Field>
                    <Field id="banner-priority" label="Priority" description="Ordering within a placement.">
                      <Input
                        id="banner-priority"
                        type="number"
                        value={form.priority}
                        onChange={(event) => update({ priority: event.target.value })}
                      />
                    </Field>
                  </div>
                  <Field
                    id="banner-segments"
                    label="Segments (JSON)"
                    description="Stored but not delivered. Targeting needs a privacy and fallback decision."
                  >
                    <Textarea
                      id="banner-segments"
                      rows={3}
                      placeholder="Leave empty — targeting is not delivered"
                      value={form.segments}
                      onChange={(event) => update({ segments: event.target.value })}
                    />
                  </Field>
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <Container className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                    <div className="flex gap-1">
                      {PREVIEW_DEVICES.map((item) => (
                        <Button
                          key={item.value}
                          size="small"
                          variant={device === item.value ? "secondary" : "transparent"}
                          onClick={() => setDevice(item.value)}
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="banner-preview-enabled"
                        checked={previewEnabled}
                        onCheckedChange={setPreviewEnabled}
                      />
                      <Label htmlFor="banner-preview-enabled" size="xsmall">Live preview</Label>
                    </div>
                  </div>
                  {previewEnabled ? (
                    <BannerPreview
                      locale={activeLocale}
                      device={device}
                      preview={preview.data}
                      isPending={preview.isPending}
                      isError={preview.isError}
                      errorMessage={preview.error instanceof Error ? preview.error.message : undefined}
                    />
                  ) : (
                    <Text size="small" className="text-ui-fg-subtle">
                      Preview paused. Turn it back on to check the banner against the delivery rules.
                    </Text>
                  )}
                </Container>

                <Container className="px-4 py-3">
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {targetDocument
                      ? `Editing the ${localeLabel(activeLocale)} draft. Saving never changes the published banner.`
                      : `No ${localeLabel(activeLocale)} draft yet. Saving creates one from these values.`}
                  </Text>
                </Container>
              </div>
            </div>
          </FocusModal.Body>

          <FocusModal.Footer>
            <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {conflict
                  ? "Save blocked until the latest draft is reloaded"
                  : dirty
                    ? "Unsaved changes"
                    : "All changes saved to the draft"}
              </Text>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="small" onClick={() => { void attemptClose(false); }}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={requestSave}
                  isLoading={saveMutation.isPending}
                  disabled={conflict}
                  data-testid="banner-save-draft"
                >
                  Save draft
                </Button>
                <Button
                  size="small"
                  onClick={requestPublish}
                  disabled={conflict || !canPublish || busy}
                  data-testid="banner-review-publish"
                >
                  {form.startMode === "later" ? "Review & schedule" : "Review & publish"}
                </Button>
              </div>
            </div>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>

      <FocusModal open={reviewOpen} onOpenChange={setReviewOpen}>
        <FocusModal.Content className="max-w-lg">
          <FocusModal.Header>
            <FocusModal.Title>
              {form.startMode === "later" ? "Schedule this banner?" : "Publish this banner?"}
            </FocusModal.Title>
          </FocusModal.Header>
          <FocusModal.Body className="px-6 py-6">
            <dl className="divide-y">
              {([
                ["Banner", form.name || form.title || form.contentKey],
                ["Environment", "Staging"],
                ["Placement", placementLabel(form.placement)],
                ["Audience", audienceLabel(form.audience)],
                ["Language", localeLabel(activeLocale)],
                ["Schedule", form.startMode === "later"
                  ? `Starts ${form.startsAt.replace("T", " ")} IST${form.endsAt ? ` · Ends ${form.endsAt.replace("T", " ")} IST` : ""}`
                  : `Immediately${form.endsAt ? ` · Ends ${form.endsAt.replace("T", " ")} IST` : ""}`],
              ] as Array<[string, string]>).map(([term, value]) => (
                <div key={term} className="flex items-start justify-between gap-4 py-3">
                  <dt><Text size="xsmall" className="text-ui-fg-subtle">{term}</Text></dt>
                  <dd><Text size="small" weight="plus" className="text-right">{value}</Text></dd>
                </div>
              ))}
            </dl>
            <Hint className="mt-4">
              Publishing makes the banner eligible for delivery. The start and end window is enforced by
              the server, so it applies even when no browser is open.
            </Hint>
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="secondary" size="small" onClick={() => setReviewOpen(false)}>Back</Button>
              <Button
                size="small"
                onClick={() => publishMutation.mutate()}
                isLoading={busy}
                data-testid="banner-confirm-publish"
              >
                {form.startMode === "later" ? "Confirm schedule" : "Confirm publication"}
              </Button>
            </div>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>
    </>
  );
}
