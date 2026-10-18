import { ArrowDownMini, ArrowUpMini, Plus, Trash } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
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
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { client } from "../../../../lib/client";
import type { ContentLocale } from "../../../content/content-model";
import {
  childTypesFor,
  emptySection,
  sectionTypeFor,
  SOURCE_LABELS,
  topLevelPlacements,
  validateStoredSections,
  type LayoutChannel,
  type StoredLayoutSection,
} from "../../../content/layout-section-model";

const LIST_ROUTE = "/merchandising/storefront-layouts";

function toLocalInput(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | undefined {
  return value.trim() ? new Date(`${value}:00Z`).toISOString() : undefined;
}

/** One editable section row: display properties, source, banner, schedule and visibility. */
function SectionFields({
  section,
  channel,
  onChange,
  collections,
  banners,
}: {
  section: StoredLayoutSection;
  channel: LayoutChannel;
  onChange: (patch: Partial<StoredLayoutSection>) => void;
  collections: Array<{ id: string; title: string; handle: string | null }>;
  banners: Array<{ contentKey: string; name: string; placement: string }>;
}) {
  const type = sectionTypeFor(section.placement);
  if (!type) return null;
  const needsCollection = type.source === "collection";

  return (
    <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
      <div className="flex flex-col gap-y-2">
        <Label htmlFor={`${section.placement}-title`} size="small" weight="plus">Display title</Label>
        <Input
          id={`${section.placement}-title`}
          value={section.title ?? ""}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label htmlFor={`${section.placement}-badge`} size="small" weight="plus">Badge</Label>
        <Input
          id={`${section.placement}-badge`}
          placeholder="Up to 60% OFF"
          value={section.badge ?? ""}
          onChange={(event) => onChange({ badge: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-y-2 md:col-span-2">
        <Label htmlFor={`${section.placement}-subtitle`} size="small" weight="plus">Subtitle</Label>
        <Textarea
          id={`${section.placement}-subtitle`}
          rows={2}
          value={section.subtitle ?? ""}
          onChange={(event) => onChange({ subtitle: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-y-2 md:col-span-2">
        <Label htmlFor={`${section.placement}-source`} size="small" weight="plus">Product source</Label>
        <Text size="xsmall" className="text-ui-fg-subtle">{SOURCE_LABELS[type.source]}</Text>
        {needsCollection ? (
          <Select
            value={section.collectionKey ?? ""}
            onValueChange={(value) => onChange({ collectionKey: value })}
          >
            <Select.Trigger id={`${section.placement}-source`}>
              <Select.Value placeholder="Choose a collection" />
            </Select.Trigger>
            <Select.Content>
              {collections.map((collection) => (
                <Select.Item key={collection.id} value={collection.id}>
                  {collection.title}
                  {collection.handle ? ` · /${collection.handle}` : ""}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            This section resolves its products from the source above; no collection is required.
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-y-2">
        <Label htmlFor={`${section.placement}-limit`} size="small" weight="plus">Products to show</Label>
        <Input
          id={`${section.placement}-limit`}
          type="number"
          value={section.limit ?? ""}
          onChange={(event) => onChange({
            limit: event.target.value ? Number.parseInt(event.target.value, 10) : undefined,
          })}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label htmlFor={`${section.placement}-seeall-label`} size="small" weight="plus">See All label</Label>
        <Input
          id={`${section.placement}-seeall-label`}
          value={section.seeAllLabel ?? ""}
          onChange={(event) => onChange({ seeAllLabel: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-y-2 md:col-span-2">
        <Label htmlFor={`${section.placement}-seeall-uri`} size="small" weight="plus">See All destination</Label>
        <Input
          id={`${section.placement}-seeall-uri`}
          placeholder="/browse?tag=Flash%20Deals"
          value={section.seeAllUri ?? ""}
          onChange={(event) => onChange({ seeAllUri: event.target.value })}
        />
      </div>

      {type.acceptsBanner ? (
        <div className="flex flex-col gap-y-2 md:col-span-2">
          <Label htmlFor={`${section.placement}-banner`} size="small" weight="plus">Banner</Label>
          <Select
            value={section.bannerReference ?? "none"}
            onValueChange={(value) => onChange({ bannerReference: value === "none" ? undefined : value })}
          >
            <Select.Trigger id={`${section.placement}-banner`}>
              <Select.Value placeholder="No banner" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">No banner</Select.Item>
              {banners.map((banner) => (
                <Select.Item key={banner.contentKey} value={banner.contentKey}>
                  {banner.name} · {banner.placement}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-y-2">
        <Label htmlFor={`${section.placement}-starts`} size="small" weight="plus">Starts at</Label>
        <Input
          id={`${section.placement}-starts`}
          type="datetime-local"
          value={toLocalInput(section.startsAt)}
          onChange={(event) => onChange({ startsAt: fromLocalInput(event.target.value) })}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label htmlFor={`${section.placement}-ends`} size="small" weight="plus">Ends at</Label>
        <Input
          id={`${section.placement}-ends`}
          type="datetime-local"
          value={toLocalInput(section.endsAt)}
          onChange={(event) => onChange({ endsAt: fromLocalInput(event.target.value) })}
        />
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Switch
          id={`${section.placement}-enabled`}
          checked={section.enabled !== false}
          onCheckedChange={(checked) => onChange({ enabled: checked })}
        />
        <Label htmlFor={`${section.placement}-enabled`} size="small">
          Show this section on the {channel.toUpperCase()} storefront
        </Label>
      </div>
    </div>
  );
}

export default function StorefrontLayoutEditorPage() {
  const { documentId = "" } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";

  const contentQuery = useQuery({
    queryKey: ["buildkart", "cms-content", "storefront-layout", locale],
    queryFn: () => client.admin.buildkart.content.query({ kind: "storefront-layout", locale }),
  });
  const collectionsQuery = useQuery({
    queryKey: ["buildkart", "commerce-collections"],
    queryFn: () => client.admin.collections.query(),
    staleTime: 5 * 60 * 1000,
  });
  const bannerQuery = useQuery({
    queryKey: ["buildkart", "cms-content", "banner", locale],
    queryFn: () => client.admin.buildkart.content.query({ kind: "banner", locale }),
    staleTime: 5 * 60 * 1000,
  });

  const document = contentQuery.data?.documents.find((item) => item.documentId === documentId);

  if (contentQuery.isPending) {
    return (
      <SingleColumnPage>
        <Container className="p-6">
          <Text size="small" className="text-ui-fg-subtle">Loading layout…</Text>
        </Container>
      </SingleColumnPage>
    );
  }

  if (!document) {
    return (
      <SingleColumnPage>
        <Container className="p-6">
          <Heading level="h1">Layout could not be opened</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            There is no {locale} layout with that identifier in the CMS.
          </Text>
          <Button asChild variant="secondary" size="small" className="mt-4">
            <Link to={LIST_ROUTE}>Back to storefront layouts</Link>
          </Button>
        </Container>
      </SingleColumnPage>
    );
  }

  const collections = (collectionsQuery.data?.collections ?? []).map((collection) => ({
    id: String(collection.id),
    title: String(collection.title ?? ""),
    handle: typeof collection.handle === "string" ? collection.handle : null,
  }));
  const banners = (bannerQuery.data?.documents ?? [])
    .filter((banner) => typeof banner.contentKey === "string" && banner.contentKey)
    .map((banner) => ({
      contentKey: String(banner.contentKey),
      name: String(banner.name ?? banner.title ?? banner.contentKey),
      placement: String(banner.placement ?? ""),
    }));
  const channel: LayoutChannel =
    document.channel === "b2b" ? "b2b" : "b2c";

  // Keyed by record and version so the editor remounts with fresh state after a save, rather than
  // resetting through an effect.
  return (
    <LayoutEditor
      key={`${documentId}:${String(document.updatedAt)}`}
      documentId={documentId}
      locale={locale}
      channel={channel}
      layoutKey={String(document.layoutKey ?? documentId)}
      publicationStatus={String(document.publicationStatus ?? "draft")}
      updatedAt={String(document.updatedAt ?? "")}
      initialHeroRotationMs={Number(document.heroRotationMs ?? 0)}
      initialSections={Array.isArray(document.sections)
        ? document.sections as StoredLayoutSection[]
        : []}
      collections={collections}
      banners={banners}
    />
  );
}

function LayoutEditor({
  documentId,
  locale,
  channel,
  layoutKey,
  publicationStatus,
  updatedAt,
  initialHeroRotationMs,
  initialSections,
  collections,
  banners,
}: {
  documentId: string;
  locale: ContentLocale;
  channel: LayoutChannel;
  layoutKey: string;
  publicationStatus: string;
  updatedAt: string;
  initialHeroRotationMs: number;
  initialSections: StoredLayoutSection[];
  collections: Array<{ id: string; title: string; handle: string | null }>;
  banners: Array<{ contentKey: string; name: string; placement: string }>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prompt = usePrompt();
  const queryKey = useMemo(
    () => ["buildkart", "cms-content", "storefront-layout", locale],
    [locale],
  );

  const [sections, setSections] = useState<StoredLayoutSection[]>(initialSections);
  const [heroRotationMs, setHeroRotationMs] = useState(initialHeroRotationMs);
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({ sections: initialSections, heroRotationMs: initialHeroRotationMs }));
  const [open, setOpen] = useState<string | null>(null);

  const validation = useMemo(
    () => validateStoredSections(sections, channel),
    [sections, channel],
  );
  const dirty = JSON.stringify({ sections, heroRotationMs }) !== baseline;

  const saveMutation = useMutation({
    mutationFn: (publish: boolean) => client.admin.buildkart.content.mutate({
      kind: "storefront-layout",
      locale,
      operation: "update-draft",
      documentId,
      data: { sections, heroRotationMs },
      expectedUpdatedAt: updatedAt,
    }).then(async (saved) => {
      if (!publish) return saved;
      return client.admin.buildkart.content.mutate({
        kind: "storefront-layout",
        locale,
        operation: "publish",
        documentId,
      });
    }),
    onSuccess: async (_result, publish) => {
      setBaseline(JSON.stringify({ sections, heroRotationMs }));
      toast.success(publish
        ? "Layout published. The storefront will read this configuration."
        : "Draft saved. The published layout is unchanged.");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The layout could not be saved.");
    },
  });

  const move = useCallback((index: number, delta: number) => {
    setSections((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const patch = useCallback((index: number, changes: Partial<StoredLayoutSection>) => {
    setSections((current) => current.map((section, position) =>
      position === index ? { ...section, ...changes } : section));
  }, []);

  const patchChild = useCallback(
    (index: number, childPlacement: string, changes: Partial<StoredLayoutSection>) => {
      setSections((current) => current.map((section, position) => {
        if (position !== index) return section;
        return {
          ...section,
          children: (section.children ?? []).map((child) =>
            child.placement === childPlacement ? { ...child, ...changes } : child),
        };
      }));
    },
    [],
  );

  const availableToAdd = topLevelPlacements(channel)
    .filter((type) => !sections.some((section) => section.placement === type.placement));

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                <Link to={LIST_ROUTE} className="hover:text-ui-fg-interactive">Storefront layouts</Link>
                {" / Section editor"}
              </Text>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Heading level="h1">{layoutKey}</Heading>
                <StatusBadge color={channel === "b2b" ? "purple" : "blue"}>
                  {channel.toUpperCase()}
                </StatusBadge>
                <StatusBadge color={publicationStatus === "published" ? "green" : "grey"}>
                  {publicationStatus === "published" ? "Published" : "Draft"}
                </StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Sections are ordered top to bottom and stay references: a section points at a
                collection, it never copies products.
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="small" onClick={() => { void navigate(LIST_ROUTE); }}>
                Back
              </Button>
              <Button
                variant="secondary"
                size="small"
                isLoading={saveMutation.isPending}
                disabled={!dirty || validation.errors.length > 0}
                onClick={() => saveMutation.mutate(false)}
              >
                Save draft
              </Button>
              <Button
                size="small"
                isLoading={saveMutation.isPending}
                disabled={validation.errors.length > 0}
                onClick={() => saveMutation.mutate(true)}
              >
                Save and publish
              </Button>
            </div>
          </div>
          <div className="px-6 py-3">
            <Text size="xsmall" className="text-ui-fg-subtle">
              {dirty ? "Unsaved changes" : "All changes saved to the draft"}
            </Text>
          </div>
        </Container>

        <Container className="px-6 py-4">
          <Heading level="h2">Hero carousel</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            How long each hero banner stays before advancing. 0 keeps the carousel still. The
            interval applies to this layout's channel only.
          </Text>
          <div className="mt-3 max-w-48">
            <Label htmlFor="hero-rotation" size="small">Rotation (ms)</Label>
            <Input
              id="hero-rotation"
              type="number"
              min={0}
              step={100}
              value={String(heroRotationMs)}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setHeroRotationMs(Number.isFinite(next) && next > 0 ? next : 0);
              }}
            />
          </div>
        </Container>

        {validation.errors.length > 0 ? (
          <Container className="border-ui-border-error px-6 py-4">
            <Heading level="h2">This layout cannot be published yet</Heading>
            <ul className="mt-2 list-disc pl-4">
              {validation.errors.map((error) => (
                <li key={error}><Text size="small" className="text-ui-fg-error">{error}</Text></li>
              ))}
            </ul>
          </Container>
        ) : null}

        {validation.warnings.length > 0 ? (
          <Container className="px-6 py-4">
            <Heading level="h2">Worth checking</Heading>
            <ul className="mt-2 list-disc pl-4">
              {validation.warnings.map((warning) => (
                <li key={warning}><Text size="small" className="text-ui-fg-muted">{warning}</Text></li>
              ))}
            </ul>
          </Container>
        ) : null}

        <div className="flex flex-col gap-3">
          {sections.map((section, index) => {
                const type = sectionTypeFor(section.placement);
                const isOpen = open === section.placement;
                return (
                  <Container key={section.placement} className="overflow-hidden p-0">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Button
                            size="small"
                            variant="transparent"
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                            aria-label={`Move ${section.placement} up`}
                          >
                            <ArrowUpMini />
                          </Button>
                          <Button
                            size="small"
                            variant="transparent"
                            disabled={index === sections.length - 1}
                            onClick={() => move(index, 1)}
                            aria-label={`Move ${section.placement} down`}
                          >
                            <ArrowDownMini />
                          </Button>
                          <Text size="xsmall" className="text-ui-fg-subtle">{index + 1}</Text>
                        </div>
                        <div className="min-w-0">
                          <Text size="small" weight="plus">{type?.label ?? section.placement}</Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {section.collectionKey
                              ? `Collection: ${collections.find((c) => c.id === section.collectionKey)?.title ?? section.collectionKey}`
                              : SOURCE_LABELS[type?.source ?? "collection"]}
                          </Text>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge color={section.enabled === false ? "grey" : "green"}>
                          {section.enabled === false ? "Hidden" : "Shown"}
                        </StatusBadge>
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => setOpen(isOpen ? null : section.placement)}
                        >
                          {isOpen ? "Close" : "Edit"}
                        </Button>
                        <Button
                          size="small"
                          variant="transparent"
                          aria-label={`Remove ${section.placement}`}
                          onClick={() => {
                            void prompt({
                              title: "Remove this section?",
                              description:
                                "The section is removed from this layout draft. Nothing in the collection itself changes.",
                              confirmText: "Remove",
                              cancelText: "Cancel",
                              variant: "danger",
                            }).then((confirmed) => {
                              if (confirmed) {
                                setSections((current) =>
                                  current.filter((_, position) => position !== index));
                              }
                            });
                          }}
                        >
                          <Trash />
                        </Button>
                      </div>
                    </div>
                    {isOpen ? (
                      <div className="border-t border-ui-border-base bg-ui-bg-subtle">
                        <SectionFields
                          section={section}
                          channel={channel}
                          onChange={(changes) => patch(index, changes)}
                          collections={collections}
                          banners={banners}
                        />
                        {childTypesFor(section.placement).length > 0 ? (
                          <div className="border-t border-ui-border-base px-6 py-5">
                            <Heading level="h3">Categories in this group</Heading>
                            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                              The storefront renders these as selectable tabs, in this order.
                            </Text>
                            <div className="mt-4 flex flex-col gap-6">
                              {childTypesFor(section.placement).map((child) => {
                                const configured = (section.children ?? [])
                                  .find((candidate) => candidate.placement === child.placement);
                                if (!configured) {
                                  return (
                                    <Text key={child.placement} size="small" className="text-ui-fg-error">
                                      {child.label} is missing from this group.
                                    </Text>
                                  );
                                }
                                return (
                                  <div key={child.placement} className="rounded-lg border border-ui-border-base bg-ui-bg-base">
                                    <div className="border-b border-ui-border-base px-4 py-2">
                                      <Text size="small" weight="plus">{child.label}</Text>
                                    </div>
                                    <SectionFields
                                      section={configured}
                                      channel={channel}
                                      onChange={(changes) =>
                                        patchChild(index, child.placement, changes)}
                                      collections={collections}
                                      banners={banners}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Container>
                );
              })}
          {sections.length === 0 ? (
            <div className="px-6 py-10">
              <Heading level="h3">No sections configured</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Add the {channel.toUpperCase()} sections this storefront should render, in order.
              </Text>
            </div>
          ) : null}
        </div>

        <Container className="px-6 py-4">
          <Heading level="h2">Add a section</Heading>
          <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
            Only placements that belong to the {channel.toUpperCase()} storefront are offered.
          </Text>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableToAdd.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                Every {channel.toUpperCase()} placement is already in this layout.
              </Text>
            ) : availableToAdd.map((type) => (
              <Button
                key={type.placement}
                size="small"
                variant="secondary"
                onClick={() => {
                  setSections((current) => [...current, emptySection(type.placement)]);
                  setOpen(type.placement);
                }}
              >
                <Plus />
                {type.label}
              </Button>
            ))}
          </div>
        </Container>

        <Container className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Section order here is the storefront order. It does not change the order of products inside
            a collection. Rejected sections and why they were rejected are validated by the same rules
            the storefront uses, so a published layout cannot contain a section that will not render.
            Seasonal, Best Deals and Schemes are configured inside Trade Offers & Deals.
          </Text>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
