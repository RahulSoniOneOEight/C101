import { ArrowUpRightOnBox } from "@medusajs/icons";
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
import {
  CONTENT_LOCALES,
  type ContentLocale,
} from "../../content/content-model";
import {
  contentItemDate,
  useContentLibrary,
} from "../../content/use-content-library";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Overview",
  rank: 1,
  nested: "/merchandising",
};

const workspaceCards = [
  {
    title: "Promotions",
    owner: "Commerce",
    ownerColor: "grey",
    description: "Create discount mechanics, eligibility rules, usage limits and activation status.",
    to: "/promotions",
    action: "Manage promotions",
  },
  {
    title: "Campaigns",
    owner: "Commerce",
    ownerColor: "grey",
    description: "Manage promotion groups, commercial schedules and marketplace-funded budgets.",
    to: "/campaigns",
    action: "Manage campaigns",
  },
  {
    title: "Commerce collections",
    owner: "Commerce",
    ownerColor: "grey",
    description: "Maintain collection identity and product membership in the native editor.",
    to: "/collections",
    action: "Manage collections",
  },
  {
    title: "Categories",
    owner: "Commerce",
    ownerColor: "grey",
    description: "Maintain category identity, hierarchy and product membership in the native editor.",
    to: "/categories",
    action: "Manage categories",
  },
] as const;

type OverviewView = "attention" | "scheduled" | "recent";
const OVERVIEW_REFERENCE_TIME = Date.now();

export default function MerchandisingOverviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: OverviewView = requestedView === "scheduled" || requestedView === "recent"
    ? requestedView
    : "attention";
  const locale: ContentLocale = searchParams.get("locale") === "hi-IN" ? "hi-IN" : "en-IN";
  const {
    items,
    isPending,
    failedQueries,
    allUnavailable,
  } = useContentLibrary(locale);
  const attentionItems = items
    .filter((item) => item.document.publicationStatus !== "published")
    .sort((left, right) => new Date(right.document.updatedAt).getTime()
      - new Date(left.document.updatedAt).getTime());
  const scheduledItems = items
    .filter((item) => {
      const startsAt = contentItemDate(item, "startsAt") ?? contentItemDate(item, "effectiveAt");
      return startsAt && startsAt.getTime() > OVERVIEW_REFERENCE_TIME;
    })
    .sort((left, right) => {
      const leftDate = contentItemDate(left, "startsAt") ?? contentItemDate(left, "effectiveAt");
      const rightDate = contentItemDate(right, "startsAt") ?? contentItemDate(right, "effectiveAt");
      return (leftDate?.getTime() ?? 0) - (rightDate?.getTime() ?? 0);
    });
  const recentItems = [...items].sort(
    (left, right) => new Date(right.document.updatedAt).getTime()
      - new Date(left.document.updatedAt).getTime(),
  );
  const visibleItems = view === "scheduled"
    ? scheduledItems
    : view === "recent"
      ? recentItems
      : attentionItems;
  const publishedCount = items.filter(
    (item) => item.document.publicationStatus === "published",
  ).length;
  const modifiedCount = items.filter(
    (item) => item.document.publicationStatus === "modified",
  ).length;
  const draftCount = items.filter(
    (item) => item.document.publicationStatus === "draft",
  ).length;

  const updateLocale = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "en-IN") next.delete("locale");
    else next.set("locale", value);
    setSearchParams(next, { replace: true });
  };
  const tabRoute = (nextView: OverviewView) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "attention") next.delete("view");
    else next.set("view", nextView);
    const query = next.toString();
    return `/merchandising/overview${query ? `?${query}` : ""}`;
  };

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Merchandising overview</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Start with operator work here, then use the left menu to move between editorial,
                review, delivery and activity views.
              </Text>
            </div>
            <div className="min-w-48">
              <Label htmlFor="overview-locale" size="xsmall">Working locale</Label>
              <Select value={locale} onValueChange={updateLocale}>
                <Select.Trigger id="overview-locale" aria-label="Working locale">
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
          <div className="grid grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Changes not published</Text>
              <Text size="large" weight="plus">{isPending ? "—" : modifiedCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Draft only</Text>
              <Text size="large" weight="plus">{isPending ? "—" : draftCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Published</Text>
              <Text size="large" weight="plus">{isPending ? "—" : publishedCount}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">CMS editor API</Text>
              <div className="mt-1">
                <StatusBadge color={allUnavailable ? "red" : failedQueries || isPending ? "orange" : "green"}>
                  {allUnavailable
                    ? "Unavailable"
                    : failedQueries
                      ? "Partially available"
                      : isPending
                        ? "Checking"
                        : "Connected"}
                </StatusBadge>
              </div>
            </div>
          </div>
        </Container>

        <Container className="overflow-hidden p-0">
          <PageTabs
            label="Overview view"
            active={view}
            tabs={[
              { value: "attention", label: "Needs attention", count: attentionItems.length, to: tabRoute("attention") },
              { value: "scheduled", label: "Scheduled", count: scheduledItems.length, to: tabRoute("scheduled") },
              { value: "recent", label: "Recently changed", count: recentItems.length, to: tabRoute("recent") },
            ]}
          />
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ui-border-base px-6 py-4">
            <div>
              <Heading level="h2">
                {view === "attention" ? "Editorial work requiring attention" : view === "scheduled" ? "Recorded future starts" : "Recently changed content"}
              </Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                {view === "scheduled"
                  ? "Future start times recorded on content. This is not a scheduling control or delivery confirmation."
                  : `Showing ${locale} editorial records from the private CMS.`}
              </Text>
            </div>
            <Button asChild variant="secondary" size="small">
              <Link to={`/merchandising/review-queue?locale=${locale}`}>Open review queue</Link>
            </Button>
          </div>
          {isPending && items.length === 0 ? (
            <Text size="small" className="px-6 py-10 text-ui-fg-subtle">Loading editorial work…</Text>
          ) : allUnavailable ? (
            <div className="px-6 py-10">
              <Heading level="h3">Editorial work is unavailable</Heading>
              <Text size="small" className="mt-1 text-ui-fg-error">
                The private CMS editor API could not be reached or this account lacks permission.
              </Text>
            </div>
          ) : (
            <ContentOperationsTable
              items={visibleItems}
              locale={locale}
              limit={10}
              emptyTitle={view === "attention" ? "Nothing needs editorial attention" : view === "scheduled" ? "No future starts recorded" : "No recent content"}
              emptyDescription={view === "attention" ? "There are no draft-only or modified records in this locale." : view === "scheduled" ? "No content in this locale has a future start time." : "No editorial records are available in this locale."}
            />
          )}
        </Container>

        <div>
          <div className="mb-3 px-1">
            <Heading level="h2">Authoritative commerce controls</Heading>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              Editorial properties are available directly in the left menu. Use these native
              Medusa controls for commerce-owned rules and membership.
            </Text>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspaceCards.map((card) => (
            <Container key={card.title} className="flex flex-col justify-between gap-5 p-6">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Heading level="h2">{card.title}</Heading>
                  <StatusBadge color={card.ownerColor}>{card.owner}</StatusBadge>
                </div>
                <Text size="small" className="mt-2 text-ui-fg-subtle">{card.description}</Text>
              </div>
              <Button asChild variant="secondary" size="small" className="self-start">
                <Link to={card.to}>
                  {card.action}
                  <ArrowUpRightOnBox />
                </Link>
              </Button>
            </Container>
          ))}
          </div>
        </div>

        <Container className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Draft saves never publish automatically. Promotions, campaigns, collection membership
            and category hierarchy remain in their native Medusa controls.
          </Text>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
