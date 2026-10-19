import { Button, Container, Heading, Text, toast } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";

/**
 * The customer link for a collection.
 *
 * Every collection is addressable at `/collections/<handle>`, resolved by delivery from commerce. This
 * shows the link where an operator already has the collection open, so sharing it does not depend on
 * knowing the handle convention. Read-only: it adds no editing surface to the native collections page.
 */

// The storefront host is deployment configuration, not a fact about this repository. Staging is the
// default so the link is usable there; a production build sets VITE_STOREFRONT_BASE_URL.
const STOREFRONT_BASE = (
  (import.meta.env.VITE_STOREFRONT_BASE_URL as string | undefined) ??
  "https://buildkart-staging.web.app"
).replace(/\/+$/, "");

type CollectionContext = {
  handle?: string | null;
  title?: string | null;
};

const CollectionCustomerLink = ({ data }: { data?: CollectionContext }) => {
  const handle = data?.handle?.trim();
  if (!handle) {
    // Without a handle there is no address to give anyone, and guessing one would produce a dead link.
    return null;
  }

  // The storefront is a hash-routed Flutter app; a path-only URL loads the shell but not the route.
  const url = `${STOREFRONT_BASE}/#/collections/${encodeURIComponent(handle)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Customer link copied");
    } catch {
      toast.error("Could not copy the link. Select it and copy manually.");
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Customer link</Heading>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <Text size="small" weight="plus" className="truncate" data-testid="collection-customer-url">
            {url}
          </Text>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Opens this collection in the storefront. Customers see only published products.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={copy}>
          Copy link
        </Button>
      </div>
    </Container>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "collections.detail.main.after",
});

export default CollectionCustomerLink;
