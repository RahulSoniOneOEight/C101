import { type FormEvent, useState } from "react";
import { Button, Container, Heading, Input, Select, Text, Textarea, toast } from "@medusajs/ui";
import { TwoColumnPage } from "@mercurjs/dashboard-shared";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../components/operations/page-header";
import { useCreateCmsContent } from "../../../../hooks/api/buildkart";

interface BannerFormState {
  contentKey: string;
  audience: "b2c" | "b2b" | "both";
  placement: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaTargetType: "route" | "product" | "category" | "collection" | "url";
  ctaTargetId: string;
  imageAltText: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  reason: string;
}

const initial: BannerFormState = {
  contentKey: "",
  audience: "both",
  placement: "home.hero",
  title: "",
  subtitle: "",
  ctaLabel: "",
  ctaTargetType: "route",
  ctaTargetId: "",
  imageAltText: "",
  startsAt: "",
  endsAt: "",
  priority: "0",
  reason: "",
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <Text size="small" weight="plus">{label}</Text>
      <div className="mt-1">{children}</div>
      {hint ? <Text size="xsmall" className="mt-1 text-ui-fg-subtle">{hint}</Text> : null}
    </div>
  );
}

export default function NewBannerPage() {
  const [form, setForm] = useState(initial);
  const createContent = useCreateCmsContent();
  const navigate = useNavigate();
  const update = <K extends keyof BannerFormState>(key: K, current: BannerFormState[K]) => setForm((value) => ({ ...value, [key]: current }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.contentKey.trim() || !form.title.trim() || !form.imageAltText.trim() || form.reason.trim().length < 3) {
      toast.error("Complete the key, title, alt text and operator reason.");
      return;
    }
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) {
      toast.error("End time must be after the start time.");
      return;
    }
    try {
      await createContent.mutateAsync({
        type: "banners",
        reason: form.reason.trim(),
        data: {
          contentKey: form.contentKey.trim(),
          audience: form.audience,
          placement: form.placement,
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || null,
          ctaLabel: form.ctaLabel.trim() || null,
          ctaTargetType: form.ctaTargetType,
          ctaTargetId: form.ctaTargetId.trim() || null,
          imageAltText: form.imageAltText.trim(),
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
          timezone: "Asia/Kolkata",
          priority: Number(form.priority || 0),
        },
      });
      toast.success("Banner draft created");
      navigate("/merchandising");
    } catch (error) {
      toast.error("Unable to create banner", { description: (error as Error).message });
    }
  };

  return (
    <TwoColumnPage>
      <TwoColumnPage.Main>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-y-3">
          <Container className="divide-y p-0">
            <PageHeader title="Create banner" description="Create a draft first. Review and publication are separate actions." />
            <div className="grid grid-cols-1 gap-5 px-6 py-5 md:grid-cols-2">
              <Field label="Content key" hint="Stable identifier; use lowercase words separated by hyphens."><Input value={form.contentKey} onChange={(event) => update("contentKey", event.target.value)} placeholder="diwali-trade-hero" data-testid="banner-content-key" /></Field>
              <Field label="Audience"><Select value={form.audience} onValueChange={(value) => update("audience", value as BannerFormState["audience"])}><Select.Trigger data-testid="banner-audience"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="both">B2C and B2B</Select.Item><Select.Item value="b2c">B2C only</Select.Item><Select.Item value="b2b">B2B only</Select.Item></Select.Content></Select></Field>
              <Field label="Placement"><Select value={form.placement} onValueChange={(value) => update("placement", value)}><Select.Trigger data-testid="banner-placement"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="home.hero">Home hero</Select.Item><Select.Item value="home.secondary">Home secondary</Select.Item><Select.Item value="b2b.trade-hero">B2B trade hero</Select.Item><Select.Item value="category.hero">Category hero</Select.Item></Select.Content></Select></Field>
              <Field label="Priority"><Input type="number" min="0" max="1000" value={form.priority} onChange={(event) => update("priority", event.target.value)} data-testid="banner-priority" /></Field>
              <div className="md:col-span-2"><Field label="Title"><Input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Build better this festive season" data-testid="banner-title" /></Field></div>
              <div className="md:col-span-2"><Field label="Subtitle"><Textarea value={form.subtitle} onChange={(event) => update("subtitle", event.target.value)} placeholder="Verified sellers, dependable tools and trade pricing." data-testid="banner-subtitle" /></Field></div>
              <Field label="CTA label"><Input value={form.ctaLabel} onChange={(event) => update("ctaLabel", event.target.value)} placeholder="Shop now" data-testid="banner-cta-label" /></Field>
              <Field label="CTA target type"><Select value={form.ctaTargetType} onValueChange={(value) => update("ctaTargetType", value as BannerFormState["ctaTargetType"])}><Select.Trigger data-testid="banner-cta-type"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="route">App route</Select.Item><Select.Item value="product">Product</Select.Item><Select.Item value="category">Category</Select.Item><Select.Item value="collection">Collection</Select.Item><Select.Item value="url">Approved URL</Select.Item></Select.Content></Select></Field>
              <div className="md:col-span-2"><Field label="CTA target" hint="Use a stable route or canonical product/category/collection identifier."><Input value={form.ctaTargetId} onChange={(event) => update("ctaTargetId", event.target.value)} placeholder="/products" data-testid="banner-cta-target" /></Field></div>
              <div className="md:col-span-2"><Field label="Image alt text" hint="Required even when creative upload is completed later in the Strapi media library."><Input value={form.imageAltText} onChange={(event) => update("imageAltText", event.target.value)} placeholder="Builder selecting tools from BuildKart" data-testid="banner-alt-text" /></Field></div>
              <Field label="Starts at"><Input type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} data-testid="banner-start" /></Field>
              <Field label="Ends at"><Input type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} data-testid="banner-end" /></Field>
              <div className="md:col-span-2"><Field label="Creation reason" hint="Stored in the append-only CMS command audit."><Textarea value={form.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Requested by merchandising plan BK-CAM-001" data-testid="banner-reason" /></Field></div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4">
              <Button type="button" variant="secondary" onClick={() => navigate("/merchandising")}>Cancel</Button>
              <Button type="submit" isLoading={createContent.isPending} data-testid="save-banner">Save draft</Button>
            </div>
          </Container>
        </form>
      </TwoColumnPage.Main>
      <TwoColumnPage.Sidebar>
        <Container className="divide-y p-0">
          <div className="px-6 py-4"><Heading level="h2">Preview</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">Text preview only; responsive creative is managed in the approved media library.</Text></div>
          <div className="space-y-3 px-6 py-6">
            <Text size="xsmall" className="uppercase text-ui-fg-muted">{form.audience} · {form.placement}</Text>
            <Heading level="h2">{form.title || "Banner title"}</Heading>
            <Text size="small" className="text-ui-fg-subtle">{form.subtitle || "Supporting campaign message appears here."}</Text>
            {form.ctaLabel ? <Button size="small" type="button">{form.ctaLabel}</Button> : null}
          </div>
        </Container>
        <Container className="p-5"><Heading level="h2">Ownership check</Heading><Text size="small" className="mt-2 text-ui-fg-subtle">This form controls editorial content only. Product prices, stock, seller terms and order behavior remain in their canonical systems.</Text></Container>
      </TwoColumnPage.Sidebar>
    </TwoColumnPage>
  );
}
