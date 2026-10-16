import { Button } from "@medusajs/ui";
import { Link } from "react-router-dom";

// The content operations table that lived here belonged to the Merchandising Overview, Review queue,
// Delivery status and Content activity pages. Those retired once Merchandising became the storefront
// composition surface, and the table had no remaining caller, so it went with them rather than
// lingering as dead code. PageTabs is still shared by the property pages.

export function PageTabs({
  label,
  active,
  tabs,
}: {
  label: string;
  active: string;
  tabs: Array<{ value: string; label: string; to: string; count?: number }>;
}) {
  return (
    <div className="overflow-x-auto border-b border-ui-border-base px-4 pt-3">
      <div className="flex min-w-max gap-1" role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <Button
            key={tab.value}
            asChild
            variant={active === tab.value ? "secondary" : "transparent"}
            size="small"
          >
            <Link
              to={tab.to}
              role="tab"
              aria-selected={active === tab.value}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <span className="text-ui-fg-subtle">{tab.count}</span>
              )}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
