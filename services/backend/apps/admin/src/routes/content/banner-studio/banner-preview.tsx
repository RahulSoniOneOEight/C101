import { Button, Heading, StatusBadge, Text } from "@medusajs/ui";
import { useState } from "react";
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
  app: "max-w-xs",
  mobile: "max-w-sm",
  desktop: "max-w-2xl",
};

const FRAME_HEIGHT: Record<PreviewDevice, string> = {
  app: "min-h-64",
  mobile: "min-h-64",
  desktop: "min-h-48",
};

/**
 * Where the text the operator is looking at actually comes from. A category preview must never show
 * a heading that delivery ignores, so the source is stated rather than implied.
 */
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

export function BannerPreview({
  locale,
  device,
  preview,
  isPending,
  isError,
  errorMessage,
  categoryCopy,
}: {
  locale: ContentLocale;
  device: PreviewDevice;
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

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h3">Customer preview</Heading>
        <div className="flex items-center gap-2">
          <Text size="xsmall" className="text-ui-fg-subtle">{localeLabel(locale)}</Text>
          {eligibility ? (
            <StatusBadge color={ELIGIBILITY_COLORS[eligibility]}>
              {ELIGIBILITY_LABELS[eligibility]}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <div
        className={`mx-auto w-full ${FRAME_WIDTH[device]} overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base`}
      >
        <div className={`relative flex ${FRAME_HEIGHT[device]} flex-col justify-end`}>
          {showImage && imageUri ? (
            <img
              src={imageUri}
              alt={imageAlt ?? ""}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center border-b border-ui-border-base bg-ui-bg-subtle">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {imageUri ? "Creative reference could not be loaded here" : "No creative reference"}
              </Text>
            </div>
          )}

          <div className="relative flex flex-col gap-y-2 bg-ui-bg-base px-4 py-4">
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
                    No heading here and no Category details label for this category. Delivery falls
                    back to the governed seed and then the category name, so only the image is shown.
                  </Text>
                )}
                {categoryCopy.shortText ? (
                  <Text size="small" className="text-ui-fg-muted">{categoryCopy.shortText}</Text>
                ) : null}
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {copyProvenance(categoryCopy)}
                </Text>
                {imageAlt ? (
                  <Text size="xsmall" className="text-ui-fg-subtle">Alt text: {imageAlt}</Text>
                ) : null}
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

      <Text size="xsmall" className="text-ui-fg-subtle">
        Illustrative preview built from the delivery mapping rules. Exact typography and crop are
        applied by the customer app, so check the real surface before release.
      </Text>
    </div>
  );
}
