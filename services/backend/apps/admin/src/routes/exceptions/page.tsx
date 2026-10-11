import { ChartActivity } from "@medusajs/icons";
import { Container, Heading, StatusBadge, Text } from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { PageHeader } from "../../components/operations/page-header";
import { useCmsHealth } from "../../hooks/api/buildkart";

// The dashboard SDK requires route metadata to be exported beside the page component.
// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Exceptions",
  icon: ChartActivity,
  rank: 60,
};

function ServiceRow({ name, owner, status, note }: { name: string; owner: string; status: "online" | "unavailable" | "deferred"; note: string }) {
  return (
    <div className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div><Text size="small" weight="plus">{name}</Text><Text size="xsmall" className="text-ui-fg-subtle">{owner} · {note}</Text></div>
      <StatusBadge color={status === "online" ? "green" : status === "deferred" ? "grey" : "red"}>{status}</StatusBadge>
    </div>
  );
}

export default function SystemHealthPage() {
  const cms = useCmsHealth();
  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0"><PageHeader title="Exceptions" description="Dependency failures and operational boundaries requiring operator attention." /></Container>
        <Container className="divide-y p-0">
          <div className="px-6 py-4"><Heading level="h2">Connected services</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">A CMS outage never blocks commerce or marketplace work.</Text></div>
          <ServiceRow name="Commerce" owner="Medusa" status="online" note="Products, pricing, customers and orders" />
          <ServiceRow name="Marketplace" owner="Mercur" status="online" note="Sellers, offers and moderation" />
          <ServiceRow name="Editorial CMS" owner="Strapi" status={cms.isSuccess ? "online" : "unavailable"} note={cms.isSuccess ? "Merchandising content and publication" : "Content mutations are safely disabled"} />
          <ServiceRow name="ERP operations" owner="Tryton" status="deferred" note="Inventory, warehouse and accounting are outside this release" />
        </Container>
        <Container className="p-6"><Heading level="h2">Staging safety</Heading><Text size="small" className="mt-2 text-ui-fg-subtle">This environment contains test data and simulated providers. Production release remains unauthorized.</Text></Container>
      </div>
    </SingleColumnPage>
  );
}
