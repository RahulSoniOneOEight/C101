import { BookOpen, BuildingStorefront, ChartBar, ShoppingCart, Tag } from "@medusajs/icons";
import { Container, Heading, StatusBadge, Text } from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { Link } from "react-router-dom";
import { CmsUnavailable } from "../../components/operations/cms-state";
import { PageHeader } from "../../components/operations/page-header";
import { SummaryCard } from "../../components/operations/summary-card";
import { useCmsContent, useCmsHealth, useOperationsSnapshot } from "../../hooks/api/buildkart";

// The dashboard SDK requires route metadata to be exported beside the page component.
// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Command Centre",
  icon: ChartBar,
  rank: 0,
};

function QueueLink({ to, label, detail }: { to: string; label: string; detail: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-ui-bg-base-hover">
      <div>
        <Text size="small" weight="plus">{label}</Text>
        <Text size="xsmall" className="mt-0.5 text-ui-fg-subtle">{detail}</Text>
      </div>
      <Text size="small" className="text-ui-fg-interactive">Open</Text>
    </Link>
  );
}

export default function CommandCentrePage() {
  const snapshot = useOperationsSnapshot();
  const cmsHealth = useCmsHealth();
  const draftBanners = useCmsContent("banners", "draft");
  const values = snapshot.data ?? { orders: 0, products: 0, sellers: 0, offers: 0 };
  const loadingValue = snapshot.isPending ? "—" : undefined;

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <PageHeader
            title="Good operations start with the right queue"
            description="Commerce, marketplace and merchandising work—organized by task, not backend provider."
          />
          <div className="px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge color="green">Commerce online</StatusBadge>
              <StatusBadge color="green">Marketplace online</StatusBadge>
              <StatusBadge color={cmsHealth.isSuccess ? "green" : cmsHealth.isPending ? "orange" : "red"}>
                {cmsHealth.isSuccess ? "CMS online" : cmsHealth.isPending ? "Checking CMS" : "CMS unavailable"}
              </StatusBadge>
              <StatusBadge color="grey">Tryton deferred</StatusBadge>
            </div>
          </div>
        </Container>

        {cmsHealth.isError ? <CmsUnavailable detail={cmsHealth.error.message} /> : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Orders" value={loadingValue ?? values.orders} description="Customer and trade orders" to="/orders" icon={ShoppingCart} testId="summary-orders" />
          <SummaryCard label="Catalogue" value={loadingValue ?? values.products} description="Master products and variants" to="/products" icon={BookOpen} testId="summary-products" />
          <SummaryCard label="Sellers" value={loadingValue ?? values.sellers} description="Marketplace participants" to="/stores" icon={BuildingStorefront} testId="summary-sellers" />
          <SummaryCard label="Offers" value={loadingValue ?? values.offers} description="Seller listings and terms" to="/offers" icon={Tag} testId="summary-offers" />
          <SummaryCard label="Content drafts" value={draftBanners.isPending ? "—" : draftBanners.data?.meta.count ?? 0} description="Banners awaiting review" to="/merchandising" icon={ChartBar} testId="summary-content" />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Container className="divide-y p-0 xl:col-span-2">
            <div className="px-6 py-4">
              <Heading level="h2">Operator workspaces</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">Start with a focused queue and keep context while you work.</Text>
            </div>
            <QueueLink to="/orders" label="Run the order queue" detail="Review status, payment and seller allocation using the canonical commerce workflow." />
            <QueueLink to="/products" label="Improve catalogue quality" detail="Resolve product, category, pricing and publication gaps without duplicating master data." />
            <QueueLink to="/stores" label="Review sellers" detail="Approve and manage seller lifecycle through Mercur's governed marketplace workflow." />
            <QueueLink to="/offers" label="Review offers" detail="Inspect seller price, SKU and availability records against the shared catalogue." />
            <QueueLink to="/merchandising" label="Schedule storefront content" detail="Create B2C/B2B banners, preview them and publish with an operator reason." />
          </Container>

          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Ownership guardrails</Heading>
              <Text size="small" className="mt-1 text-ui-fg-subtle">The console feels unified; the data remains correctly owned.</Text>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div><Text size="small" weight="plus">Medusa</Text><Text size="xsmall" className="text-ui-fg-subtle">Products, prices, orders and customers</Text></div>
              <div><Text size="small" weight="plus">Mercur</Text><Text size="xsmall" className="text-ui-fg-subtle">Sellers, offers and marketplace moderation</Text></div>
              <div><Text size="small" weight="plus">Strapi</Text><Text size="xsmall" className="text-ui-fg-subtle">Editorial content and merchandising layouts</Text></div>
              <div><Text size="small" weight="plus">No direct database writes</Text><Text size="xsmall" className="text-ui-fg-subtle">All actions use authenticated APIs and explicit commands.</Text></div>
            </div>
          </Container>
        </div>
      </div>
    </SingleColumnPage>
  );
}
