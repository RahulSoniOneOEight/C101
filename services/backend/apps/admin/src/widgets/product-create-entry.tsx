import { Button, Container, Heading, Text } from "@medusajs/ui";
import { defineWidgetConfig } from "@mercurjs/dashboard-sdk";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * One visible product-creation entry point on the Products list.
 *
 * The built-in list still renders its own native "Create" link. That link is
 * hidden and intercepted so the list CTA and the native header action cannot
 * open two different creation forms. The native `/products/create` route also
 * redirects to the canonical Product Studio create route.
 */
function ProductCreateEntry() {
  const navigate = useNavigate();

  useEffect(() => {
    const hideNativeCreate = () => {
      document
        .querySelectorAll<HTMLAnchorElement>('a[href$="/products/create"]')
        .forEach((anchor) => {
          anchor.style.display = "none";
          anchor.setAttribute("aria-hidden", "true");
          anchor.setAttribute("tabindex", "-1");
        });
    };

    hideNativeCreate();
    const observer = new MutationObserver(hideNativeCreate);
    observer.observe(document.body, { childList: true, subtree: true });

    const intercept = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href$="/products/create"]');
      if (!anchor) return;
      event.preventDefault();
      navigate("/products/new");
    };
    document.addEventListener("click", intercept, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", intercept, true);
    };
  }, [navigate]);

  return (
    <Container className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">Create a product</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Use the complete Product Studio journey: details, variants, B2C/B2B
            pricing, inventory and review.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={() => navigate("/products/import")}
            data-testid="product-import-cta"
          >
            Import CSV
          </Button>
          <Button
            size="small"
            onClick={() => navigate("/products/new")}
            data-testid="product-create-cta"
        >
            Create product
          </Button>
        </div>
      </div>
    </Container>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const config = defineWidgetConfig({
  zone: "products.list.before",
});

export default ProductCreateEntry;
