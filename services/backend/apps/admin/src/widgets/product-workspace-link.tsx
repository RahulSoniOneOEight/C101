import { Button, Container, Heading, Text } from "@medusajs/ui";
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
          Edit details, tags, variants, B2C and B2B pricing, inventory and
          publish readiness in one place.
        </Text>
        <Link to={`/product-studio/${product.id}`}>
          <Button
            size="small"
            className="mt-3"
            data-testid="open-product-workspace"
          >
            Open product workspace
          </Button>
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
