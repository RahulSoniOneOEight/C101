import { useMemo, useState } from "react";
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
const asTags = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join(", ")
    : asText(value);

/**
 * Search, brand and SEO fields live on product.metadata.
 * The native collection/category/type/tags fields stay in Product organization.
 */
function SearchMetadataForm({ product }: { product: WidgetProduct }) {
  const [brand, setBrand] = useState(() => asText(product.metadata?.brand));
  const [seoTitle, setSeoTitle] = useState(() => asText(product.metadata?.seo_title));
  const [seoDescription, setSeoDescription] = useState(() => asText(product.metadata?.seo_description));
  const [searchTags, setSearchTags] = useState(() => asTags(product.metadata?.search_tags));
  const [saving, setSaving] = useState(false);

  const tags = useMemo(
    () =>
      Array.from(
        new Set(
          searchTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ),
    [searchTags],
  );

  const save = async () => {
    if (!product.id) return;
    setSaving(true);
    try {
      await client.admin.products.$id.mutate({
        $id: product.id,
        metadata: {
          ...(product.metadata ?? {}),
          brand: brand.trim(),
          seo_title: seoTitle.trim(),
          seo_description: seoDescription.trim(),
          search_tags: tags,
        },
      });
      toast.success("Search and brand details saved");
    } catch (error) {
      toast.error("Could not save search metadata", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Search &amp; brand</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Stored on product metadata. No schema change. Collection, category,
          type and tags stay in Product organization.
        </Text>
      </div>

      <div className="flex flex-col gap-4 px-6 py-4">
        <label className="flex flex-col gap-1">
          <Text size="small" className="font-medium">
            Brand
          </Text>
          <Input
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            placeholder="WoodWise"
          />
        </label>

        <label className="flex flex-col gap-1">
          <Text size="small" className="font-medium">
            Search tags
          </Text>
          <Input
            value={searchTags}
            onChange={(event) => setSearchTags(event.target.value)}
            placeholder="laminboard, wood sheet, 18mm board"
          />
          <Text size="small" className="text-ui-fg-muted">
            Comma-separated synonyms for admin search and SEO. Not used as
            storefront facets.
          </Text>
        </label>

        <label className="flex flex-col gap-1">
          <Text size="small" className="font-medium">
            SEO title
          </Text>
          <Input
            value={seoTitle}
            onChange={(event) => setSeoTitle(event.target.value)}
            placeholder="WoodWise Laminboard | 18 mm laminated boards"
          />
          <Text
            size="small"
            className={seoTitle.length > 60 ? "text-ui-fg-error" : "text-ui-fg-muted"}
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
          />
          <Text
            size="small"
            className={
              seoDescription.length > 155 ? "text-ui-fg-error" : "text-ui-fg-muted"
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
          >
            Save search metadata
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
