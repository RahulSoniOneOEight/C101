import { Button, Heading, StatusBadge, Text } from "@medusajs/ui";
import { useState, type ReactNode } from "react";
import type { ContentLocale } from "../content-model";
import {
  ELIGIBILITY_COLORS,
  ELIGIBILITY_LABELS,
  localeLabel,
  type BannerPreviewResponse,
  type EffectiveCategoryCopy,
  type PreviewDevice,
} from "./banner-model";

const FRAME_WIDTH: Record<PreviewDevice, string> = {
  app: "max-w-[360px]",
  mobile: "max-w-[390px]",
  desktop: "max-w-3xl",
};

const PAGE_LABEL: Record<PreviewDevice, string> = {
  app: "BazarBee app · 390px",
  mobile: "Web · 390px",
  desktop: "Web · 1440px",
};

type Surface = "home" | "category" | "welcome";

function surfaceOf(placement?: string): Surface {
  const value = placement?.split(".")[1];
  return value === "category" || value === "welcome" ? value : "home";
}

function copyProvenance(copy: EffectiveCategoryCopy): string {
  const heading = copy.labelSource === "banner"
    ? "Heading from this banner."
    : "No banner heading, so the heading comes from Category details.";
  const supporting = copy.shortTextSource === "banner"
    ? "Supporting text from this banner."
    : copy.shortTextSource === "editorial"
      ? "Supporting text from Category details."
      : "No supporting text is delivered.";
  return `${heading} ${supporting}`;
}

function ProductSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded border border-ui-border-base">
          <div className="aspect-square bg-ui-bg-subtle" />
          <div className="space-y-1 p-2">
            <div className="h-1.5 w-4/5 rounded bg-ui-bg-subtle" />
            <div className="h-1.5 w-1/2 rounded bg-ui-bg-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PageChrome({
  device,
  surface,
  channel,
  children,
}: {
  device: PreviewDevice;
  surface: Surface;
  channel: "b2c" | "b2b";
  children: ReactNode;
}) {
  const url = channel === "b2b"
    ? surface === "welcome" ? "app-staging…/sign-in?next=/trade" : "app-staging…/trade"
    : surface === "welcome" ? "app-staging…/sign-in" : surface === "category" ? "app-staging…/search?cat=…" : "app-staging…/";

  return (
    <div className="overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-subtle">
      <div className="flex items-center gap-2 border-b border-ui-border-base bg-ui-bg-base px-3 py-2">
        <div className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-ui-fg-muted" />
          <span className="h-2 w-2 rounded-full bg-ui-fg-muted" />
          <span className="h-2 w-2 rounded-full bg-ui-fg-muted" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded bg-ui-bg-subtle px-2 py-1 text-[10px] text-ui-fg-subtle">
          {device === "app" ? "BazarBee app" : url}
        </div>
      </div>
      <div className={`mx-auto w-full ${FRAME_WIDTH[device]}`}>
        <div className="bg-ui-bg-base">
          <div className="flex items-center justify-between gap-2 border-b border-ui-border-base px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-tight">BazarBee</span>
              <span className="rounded bg-ui-bg-subtle px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ui-fg-subtle">
                {channel === "b2b" ? "Trade" : "Shop"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-ui-fg-subtle">
              <span>Search</span>
              <span>Cart</span>
              <span>Account</span>
            </div>
          </div>
          <div className="px-3 py-3">{children}</div>
          {device === "app" ? (
            <div className="flex items-center justify-around border-t border-ui-border-base px-2 py-1.5 text-[9px] text-ui-fg-subtle">
              <span>Home</span>
              <span>Categories</span>
              <span>Cart</span>
              <span>Account</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BannerPreview({
  locale,
  device,
  placement,
  preview,
  isPending,
  isError,
  errorMessage,
  categoryCopy,
}: {
  locale: ContentLocale;
  device: PreviewDevice;
  placement?: string;
  preview?: BannerPreviewResponse | null;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  /** Present only for a category placement, where delivery reads two records with a precedence. */
  categoryCopy?: EffectiveCategoryCopy;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const presentation = preview?.presentation ?? null;
  const eligibility = preview?.eligibility;
  const imageUri = presentation?.image_uri;
  const imageAlt = presentation?.image_alt;
  const showImage = Boolean(imageUri) && !imageFailed;
  const surface = surfaceOf(placement);
  const channel = placement?.startsWith("b2b") ? "b2b" : "b2c";

  const banner = (
    <div className="overflow-hidden rounded border border-ui-border-base bg-ui-bg-base">
      <div className="relative flex min-h-32 flex-col justify-end">
        {showImage && imageUri ? (
          <img
            src={imageUri}
            alt={imageAlt ?? ""}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-ui-bg-subtle">
            <Text size="xsmall" className="text-ui-fg-subtle">
              {imageUri ? "Creative reference could not be loaded here" : "No creative reference"}
            </Text>
          </div>
        )}
        <div className="relative flex flex-col gap-y-1 bg-ui-bg-base/95 px-3 py-3">
          {isPending ? (
            <Text size="small" className="text-ui-fg-subtle">Building preview…</Text>
          ) : isError ? (
            <Text size="small" className="text-ui-fg-error">
              {errorMessage ?? "Preview is unavailable. The delivery service could not be reached."}
            </Text>
          ) : categoryCopy ? (
            <>
              {categoryCopy.label ? (
                <Text
                  size="large"
                  weight="plus"
                  className="whitespace-pre-line leading-snug"
                  data-testid="banner-preview-heading"
                >
                  {categoryCopy.label}
                </Text>
              ) : (
                <Text
                  size="small"
                  className="text-ui-fg-subtle"
                  data-testid="banner-preview-heading"
                >
                  No heading here and no Category details label. Delivery falls back to the governed
                  seed and then the category name, so only the image is shown.
                </Text>
              )}
              {categoryCopy.shortText ? (
                <Text size="small" className="text-ui-fg-muted">{categoryCopy.shortText}</Text>
              ) : null}
              <Text size="xsmall" className="text-ui-fg-subtle">{copyProvenance(categoryCopy)}</Text>
            </>
          ) : !presentation ? (
            <Text size="small" className="text-ui-fg-subtle">
              Add a heading, placement and key to complete the preview.
            </Text>
          ) : (
            <>
              <Text
                size="large"
                weight="plus"
                className="whitespace-pre-line leading-snug"
                data-testid="banner-preview-heading"
              >
                {presentation.title}
              </Text>
              {presentation.body ? (
                <Text size="small" className="text-ui-fg-muted">{presentation.body}</Text>
              ) : null}
              {presentation.action_label && presentation.action_uri ? (
                <div className="pt-1">
                  <Button
                    size="small"
                    variant="secondary"
                    disabled
                    title={`Preview destination: ${presentation.action_uri}`}
                  >
                    {presentation.action_label}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h3">Full-page preview</Heading>
        <div className="flex items-center gap-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            {localeLabel(locale)} · {PAGE_LABEL[device]}
          </Text>
          {eligibility ? (
            <StatusBadge color={ELIGIBILITY_COLORS[eligibility]}>
              {ELIGIBILITY_LABELS[eligibility]}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <PageChrome device={device} surface={surface} channel={channel}>
        {surface === "welcome" ? (
          <div className="grid gap-3">
            {banner}
            <div className="mx-auto w-full max-w-xs rounded border border-ui-border-base p-3">
              <Text size="small" weight="plus">Sign in to BazarBee</Text>
              <Text size="xsmall" className="mb-2 text-ui-fg-subtle">
                Email code or magic link. No password.
              </Text>
              <div className="h-7 rounded border border-ui-border-base bg-ui-bg-subtle" />
              <div className="mt-2 h-7 rounded bg-ui-bg-highlight" />
            </div>
          </div>
        ) : surface === "category" ? (
          <div className="grid gap-2">
            <Text size="small" weight="plus">Category</Text>
            {banner}
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <span
                  key={index}
                  className={`h-3 rounded-full ${index === 0 ? "w-10 bg-ui-bg-highlight" : "w-8 bg-ui-bg-subtle"}`}
                />
              ))}
            </div>
            <ProductSkeleton />
          </div>
        ) : (
          <div className="grid gap-2">
            {placement?.endsWith("campaign-strip") ? (
              <div className="h-10 rounded bg-ui-bg-highlight" />
            ) : null}
            {banner}
            <div className="flex gap-1 overflow-hidden">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-8 w-10 shrink-0 rounded bg-ui-bg-subtle" />
              ))}
            </div>
            <ProductSkeleton />
          </div>
        )}
      </PageChrome>

      <Text size="xsmall" className="text-ui-fg-subtle">
        Page context uses the current draft banner and the published page shell. Typography and image
        crops are applied by the customer surface, so open the live page before release.
      </Text>
    </div>
  );
}
