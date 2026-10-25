import { Container, Heading, Text } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { Link } from "react-router-dom";

type WidgetProduct = {
  id?: string;
};

type WidgetProps = {
  data?: unknown;
};

/**
 * Bridge from the native product record to the consolidated product workspace.
 *
 * The native detail remains available for advanced Medusa fields (including
 * SEO); the workspace owns the section-wise detail, variant, pricing, inventory
 * and review flow.
 */
function ProductWorkspaceLink({ data }: WidgetProps) {
  const product = (data ?? {}) as WidgetProduct;
  if (!product.id) return null;

  return (
    <Container className="p-0">
      <div className="px-6 py-5">
        <Heading level="h2">Product workspace</Heading>
        <Text size="small" className="mt-1 max-w-sm text-ui-fg-subtle">
          Edit details, tags, variants, B2C and B2B pricing, review inventory and
          publish readiness in one place.
        </Text>
        <Link
          to={`/product-studio/${product.id}`}
          className="mt-3 inline-flex h-8 items-center justify-center rounded-md bg-ui-bg-interactive px-3 text-sm font-medium text-ui-fg-on-color transition-opacity hover:opacity-90"
          data-testid="open-product-workspace"
        >
          Open product workspace
        </Link>
      </div>
    </Container>
  );
}

// The config export is required by the dashboard SDK discovery.
// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "product.detail.side.after",
});

export default ProductWorkspaceLink;
