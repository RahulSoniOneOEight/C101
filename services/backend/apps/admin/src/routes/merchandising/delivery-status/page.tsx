import {
  Container,
  Heading,
  Label,
  Select,
  StatusBadge,
  Text,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useSearchParams } from "react-router-dom";
import { ContentOperationsTable, PageTabs } from "../../content/content-operations";
import {
  CONTENT_KINDS,
  CONTENT_LOCALES,
  type ContentLocale,
} from "../../content/content-model";
import { useContentLibrary } from "../../content/use-content-library";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Delivery status",
  rank: 4,
  nested: "/merchandising",
};

type DeliveryView = "coverage" | "published" | "gaps";

export default function DeliveryStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: DeliveryView = requestedView === "published" || requestedView === "gaps"
    ? requestedView
    : "coverage";
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const {
    items,
    typeCounts,
    isPending,
    failedQueries,
    allUnavailable,
  } = useContentLibrary(locale);
  const publishedItems = items
    .filter((item) => item.document.publicationStatus === "published")
    .sort((left, right) => new Date(right.document.publishedAt ?? 0).getTime()
      - new Date(left.document.publishedAt ?? 0).getTime());
  const gapKinds = CONTENT_KINDS.filter((item) => item.delivery !== "Live");
  const tabRoute = (nextView: DeliveryView) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "coverage") next.delete("view");
    else next.set("view", nextView);
    const query = next.toString();
    return `/merchandising/delivery-status${query ? `?${query}` : ""}`;
  };
  const updateLocale = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "en-IN") next.delete("locale");
    else next.set("locale", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Delivery status</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                See CMS editor availability, published eligibility and declared consumer coverage.
                Storefront projection receipts and webhook diagnostics are not yet available here.
              </Text>
            </div>
            <div className="min-w-48">
              <Label htmlFor="delivery-locale" size="xsmall">Working locale</Label>
              <Select value={locale} onValueChange={updateLocale}>
                <Select.Trigger id="delivery-locale" aria-label="Delivery locale">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {CONTENT_LOCALES.map((item) => (
                    <Select.Item key={item.value} value={item.value}>{item.label}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-3">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">CMS editor API</Text>
              <div className="mt-1">
                <StatusBadge color={allUnavailable ? "red" : failedQueries || isPending ? "orange" : "green"}>
                  {allUnavailable ? "Unavailable" : failedQueries ? "Partially available" : isPending ? "Checking" : "Connected"}
                </StatusBadge>
              </div>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Published records</Text>
              <Text size="large" weight="plus">{isPending ? "—" : publishedItems.length}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Coverage gaps</Text>
              <Text size="large" weight="plus">{gapKinds.length}</Text>
            </div>
          </div>
        </Container>

        <Container className="overflow-hidden p-0">
          <PageTabs
            label="Delivery status view"
            active={view}
            tabs={[
              { value: "coverage", label: "Content-type coverage", count: CONTENT_KINDS.length, to: tabRoute("coverage") },
              { value: "published", label: "Published eligibility", count: publishedItems.length, to: tabRoute("published") },
              { value: "gaps", label: "Coverage gaps", count: gapKinds.length, to: tabRoute("gaps") },
            ]}
          />
          {view === "coverage" ? (
            <div className="grid gap-3 p-6 md:grid-cols-2 xl:grid-cols-3">
              {CONTENT_KINDS.map((item) => {
                const published = items.filter(
                  (candidate) => candidate.kind === item.kind
                    && candidate.document.publicationStatus === "published",
                ).length;
                return (
                  <div key={item.kind} className="rounded-md border border-ui-border-base p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Heading level="h3">{item.label}</Heading>
                      <StatusBadge color={item.deliveryColor}>{item.delivery}</StatusBadge>
                    </div>
                    <Text size="small" className="mt-2 text-ui-fg-subtle">{item.description}</Text>
                    <div className="mt-4 flex gap-4">
                      <Text size="xsmall"><strong>{typeCounts[item.kind]}</strong> records</Text>
                      <Text size="xsmall"><strong>{published}</strong> published</Text>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : view === "published" ? (
            <ContentOperationsTable
              items={publishedItems}
              locale={locale}
              dateField="publishedAt"
              dateLabel="Published"
              emptyTitle="No published records"
              emptyDescription="No content is currently published for the selected locale."
            />
          ) : (
            <div className="grid gap-3 p-6 md:grid-cols-2">
              {gapKinds.map((item) => (
                <div key={item.kind} className="rounded-md border border-ui-border-base p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Heading level="h3">{item.label}</Heading>
                    <StatusBadge color={item.deliveryColor}>{item.delivery}</StatusBadge>
                  </div>
                  <Text size="small" className="mt-2 text-ui-fg-subtle">{item.description}</Text>
                  <Text size="xsmall" className="mt-3 text-ui-fg-subtle">
                    This status describes the approved consumer implementation, not a live delivery receipt.
                  </Text>
                </div>
              ))}
            </div>
          )}
        </Container>

        <Container className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-subtle">
            “Published” means eligible for CMS delivery. It does not prove that every storefront
            projection, cache refresh or webhook completed successfully.
          </Text>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
