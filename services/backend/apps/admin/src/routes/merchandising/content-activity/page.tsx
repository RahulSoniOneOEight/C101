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
import { CONTENT_LOCALES, type ContentLocale } from "../../content/content-model";
import { useContentLibrary } from "../../content/use-content-library";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Content activity",
  rank: 5,
  nested: "/merchandising",
};

type ActivityView = "updated" | "published";

export default function ContentActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: ActivityView = searchParams.get("view") === "published" ? "published" : "updated";
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const { items, isPending, failedQueries, allUnavailable } = useContentLibrary(locale);
  const updatedItems = [...items].sort(
    (left, right) => new Date(right.document.updatedAt).getTime()
      - new Date(left.document.updatedAt).getTime(),
  );
  const publishedItems = items
    .filter((item) => item.document.publishedAt)
    .sort((left, right) => new Date(right.document.publishedAt ?? 0).getTime()
      - new Date(left.document.publishedAt ?? 0).getTime());
  const visibleItems = view === "published" ? publishedItems : updatedItems;
  const tabRoute = (nextView: ActivityView) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "updated") next.delete("view");
    else next.set("view", nextView);
    const query = next.toString();
    return `/merchandising/content-activity${query ? `?${query}` : ""}`;
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
                <Heading level="h1">Content activity</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Browse current CMS timestamps for recent updates and publications. This is not a
                complete actor-level audit trail and does not replace governed audit evidence.
              </Text>
            </div>
            <div className="min-w-48">
              <Label htmlFor="activity-locale" size="xsmall">Working locale</Label>
              <Select value={locale} onValueChange={updateLocale}>
                <Select.Trigger id="activity-locale" aria-label="Activity locale">
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
        </Container>

        <Container className="overflow-hidden p-0">
          <PageTabs
            label="Content activity view"
            active={view}
            tabs={[
              { value: "updated", label: "Recently updated", count: updatedItems.length, to: tabRoute("updated") },
              { value: "published", label: "Recently published", count: publishedItems.length, to: tabRoute("published") },
            ]}
          />
          {isPending && items.length === 0 ? (
            <Text size="small" className="px-6 py-10 text-ui-fg-subtle">Loading content activity…</Text>
          ) : allUnavailable ? (
            <div className="px-6 py-10">
              <Heading level="h3">Content activity is unavailable</Heading>
              <Text size="small" className="mt-1 text-ui-fg-error">
                The private CMS editor API could not be reached or this account lacks permission.
              </Text>
            </div>
          ) : (
            <ContentOperationsTable
              items={visibleItems}
              locale={locale}
              dateField={view === "published" ? "publishedAt" : "updatedAt"}
              dateLabel={view === "published" ? "Published" : "Updated"}
              emptyTitle={view === "published" ? "No publication activity" : "No update activity"}
              emptyDescription="No current CMS records are available for this activity view and locale."
            />
          )}
          {failedQueries > 0 && !allUnavailable ? (
            <Text size="xsmall" className="border-t border-ui-border-base px-6 py-4 text-ui-fg-subtle">
              Some content types could not be loaded; this snapshot may be incomplete.
            </Text>
          ) : null}
        </Container>

        <Container className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Actor, operation, before/after diff and correlation-id history remain available only in
            governed server-side audit records until a permissioned audit API is approved.
          </Text>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
