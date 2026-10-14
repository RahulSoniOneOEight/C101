import {
  Button,
  Container,
  Heading,
  Label,
  Select,
  StatusBadge,
  Text,
} from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { Link, useSearchParams } from "react-router-dom";
import { ContentOperationsTable, PageTabs } from "../../content/content-operations";
import { CONTENT_LOCALES, type ContentLocale } from "../../content/content-model";
import { useContentLibrary } from "../../content/use-content-library";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Review queue",
  rank: 3,
  nested: "/merchandising",
};

type ReviewView = "all" | "modified" | "draft";

export default function ReviewQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: ReviewView = requestedView === "modified" || requestedView === "draft"
    ? requestedView
    : "all";
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const { items, isPending, failedQueries, allUnavailable } = useContentLibrary(locale);
  const modifiedItems = items.filter((item) => item.document.publicationStatus === "modified");
  const draftItems = items.filter((item) => item.document.publicationStatus === "draft");
  const pendingItems = [...modifiedItems, ...draftItems].sort(
    (left, right) => new Date(right.document.updatedAt).getTime()
      - new Date(left.document.updatedAt).getTime(),
  );
  const visibleItems = view === "modified"
    ? modifiedItems
    : view === "draft"
      ? draftItems
      : pendingItems;
  const tabRoute = (nextView: ReviewView) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    const query = next.toString();
    return `/merchandising/review-queue${query ? `?${query}` : ""}`;
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
                <Heading level="h1">Review queue</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Review real draft-only and modified CMS records. Editing and publication remain
                separate actions; diff and reviewer assignment are not yet available.
              </Text>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-48">
                <Label htmlFor="review-locale" size="xsmall">Working locale</Label>
                <Select value={locale} onValueChange={updateLocale}>
                  <Select.Trigger id="review-locale" aria-label="Review locale">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {CONTENT_LOCALES.map((item) => (
                      <Select.Item key={item.value} value={item.value}>{item.label}</Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <Button asChild variant="secondary" size="small">
                <Link to={`/content?locale=${locale}&status=${view === "all" ? "modified" : view}`}>
                  Open publication controls
                </Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-3">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Total pending</Text>
              <Text size="large" weight="plus">{isPending ? "—" : pendingItems.length}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Changes not published</Text>
              <Text size="large" weight="plus">{isPending ? "—" : modifiedItems.length}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Draft only</Text>
              <Text size="large" weight="plus">{isPending ? "—" : draftItems.length}</Text>
            </div>
          </div>
        </Container>

        <Container className="overflow-hidden p-0">
          <PageTabs
            label="Review queue view"
            active={view}
            tabs={[
              { value: "all", label: "All pending", count: pendingItems.length, to: tabRoute("all") },
              { value: "modified", label: "Changes not published", count: modifiedItems.length, to: tabRoute("modified") },
              { value: "draft", label: "Draft only", count: draftItems.length, to: tabRoute("draft") },
            ]}
          />
          {isPending && items.length === 0 ? (
            <Text size="small" className="px-6 py-10 text-ui-fg-subtle">Loading review queue…</Text>
          ) : allUnavailable ? (
            <div className="px-6 py-10">
              <Heading level="h3">Review queue is unavailable</Heading>
              <Text size="small" className="mt-1 text-ui-fg-error">
                The private CMS editor API could not be reached or this account lacks permission.
              </Text>
            </div>
          ) : (
            <ContentOperationsTable
              items={visibleItems}
              locale={locale}
              emptyTitle="No records in this queue"
              emptyDescription="There are no editorial records with this publication state in the selected locale."
            />
          )}
          {failedQueries > 0 && !allUnavailable ? (
            <Text size="xsmall" className="border-t border-ui-border-base px-6 py-4 text-ui-fg-subtle">
              Some content types could not be loaded; counts and rows may be incomplete.
            </Text>
          ) : null}
        </Container>
      </div>
    </SingleColumnPage>
  );
}
