import { useState } from "react";
import {
  Button,
  Container,
  Heading,
  Input,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { client } from "../lib/client";

type WidgetProduct = {
  id?: string;
  metadata?: Record<string, unknown> | null;
};

type WidgetProps = {
  data?: unknown;
};

const asText = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * SEO remains on the native product detail. Brand and search tags are owned by
 * Product Studio so there is one editing surface for the listing.
 */
function SearchMetadataForm({ product }: { product: WidgetProduct }) {
  const [seoTitle, setSeoTitle] = useState(() =>
    asText(product.metadata?.seo_title),
  );
  const [seoDescription, setSeoDescription] = useState(() =>
    asText(product.metadata?.seo_description),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!product.id) return;
    setSaving(true);
    try {
      await client.admin.products.$id.mutate({
        $id: product.id,
        metadata: {
          ...(product.metadata ?? {}),
          seo_title: seoTitle.trim(),
          seo_description: seoDescription.trim(),
        },
      });
      toast.success("SEO details saved");
    } catch (error) {
      toast.error("Could not save SEO details", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="divide-y p-0" data-testid="product-search-metadata">
      <div className="px-6 py-4">
        <Heading level="h2">SEO</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Brand and search tags are edited in Product Studio.
        </Text>
      </div>

      <div className="flex flex-col gap-4 px-6 py-4">
        <label className="flex flex-col gap-1">
          <Text size="small" className="font-medium">
            SEO title
          </Text>
          <Input
            value={seoTitle}
            onChange={(event) => setSeoTitle(event.target.value)}
            placeholder="WoodWise Laminboard | 18 mm laminated boards"
            data-testid="product-seo-title"
          />
          <Text
            size="small"
            className={
              seoTitle.length > 60 ? "text-ui-fg-error" : "text-ui-fg-muted"
            }
          >
            {seoTitle.length}/60
          </Text>
        </label>

        <label className="flex flex-col gap-1">
          <Text size="small" className="font-medium">
            Meta description
          </Text>
          <Textarea
            value={seoDescription}
            onChange={(event) => setSeoDescription(event.target.value)}
            rows={3}
            placeholder="Moisture-resistant 18 mm laminboard in brown, white and grey."
            data-testid="product-seo-description"
          />
          <Text
            size="small"
            className={
              seoDescription.length > 155
                ? "text-ui-fg-error"
                : "text-ui-fg-muted"
            }
          >
            {seoDescription.length}/155
          </Text>
        </label>

        <div className="flex justify-end">
          <Button
            size="small"
            variant="primary"
            isLoading={saving}
            disabled={!product.id || saving}
            onClick={save}
            data-testid="save-product-search-metadata"
          >
            Save SEO details
          </Button>
        </div>
      </div>
    </Container>
  );
}

function ProductSearchMetadata({ data }: WidgetProps) {
  const product = (data ?? {}) as WidgetProduct;
  return <SearchMetadataForm key={product.id ?? "new"} product={product} />;
}

// The config export is required by the dashboard SDK discovery.
// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "product.detail.side.after",
});

export default ProductSearchMetadata;
