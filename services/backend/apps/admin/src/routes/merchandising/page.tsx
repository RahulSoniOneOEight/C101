import { ArrowUpRightOnBox, SquaresPlus } from "@medusajs/icons";
import { Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../../lib/client";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Merchandising",
  icon: SquaresPlus,
  rank: 55,
};

const workspaceCards = [
  {
    title: "Editorial content",
    owner: "Editorial",
    ownerColor: "blue",
    description: "Manage every customer-facing editorial property from one native content library.",
    to: "/content",
    action: "Manage content",
  },
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
    description: "Maintain collection identity and product membership in the native collection editor.",
    to: "/collections",
    action: "Manage commerce collections",
  },
  {
    title: "Categories",
    owner: "Commerce",
    ownerColor: "grey",
    description: "Maintain category identity, hierarchy and product membership in the native category editor.",
    to: "/categories",
    action: "Manage categories",
  },
] as const;

const editorialKinds = [
  "storefront-layout",
  "banner",
  "curated-collection",
  "category-editorial",
  "product-editorial",
  "faq-article",
] as const;

type ContentResponse = InferClientOutput<typeof client.admin.buildkart.content.query>;

export default function MerchandisingPage() {
  const contentQueries = useQueries({
    queries: editorialKinds.map((kind) => ({
      queryKey: ["buildkart", "cms-content", kind, "en-IN"],
      queryFn: () => client.admin.buildkart.content.query({ kind, locale: "en-IN" }),
    })),
  });
  const contentDocuments = contentQueries.flatMap(
    (query) => (query.data as ContentResponse | undefined)?.documents ?? [],
  );
  const contentLoading = contentQueries.some((query) => query.isPending);
  const failedContentQueries = contentQueries.filter((query) => query.isError).length;
  const contentUnavailable = failedContentQueries === contentQueries.length;
  const publishedContent = contentDocuments.filter(
    (document) => document.publicationStatus === "published",
  ).length;
  const needsReview = contentDocuments.filter(
    (document) => document.publicationStatus === "modified",
  ).length;
  const draftOnly = contentDocuments.filter(
    (document) => document.publicationStatus === "draft",
  ).length;

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Merchandising</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
                <StatusBadge color="blue">Operator workspace</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Start with what needs attention, then open the one authoritative editor for the
                property. Editorial data stays in the private CMS; commerce stays in Medusa.
              </Text>
            </div>
            <Button asChild size="small">
              <Link to="/content">Manage editorial content</Link>
            </Button>
          </div>
          <div className="grid gap-4 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Needs editorial review</Text>
              <Text size="large" weight="plus">{contentLoading ? "—" : needsReview}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Published editorial items</Text>
              <Text size="large" weight="plus">{contentLoading ? "—" : publishedContent}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Draft editorial items</Text>
              <Text size="large" weight="plus">{contentLoading ? "—" : draftOnly}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Content service</Text>
              <div className="mt-1">
                <StatusBadge color={contentUnavailable ? "red" : failedContentQueries || contentLoading ? "orange" : "green"}>
                  {contentUnavailable
                    ? "Unavailable"
                    : failedContentQueries
                      ? "Partially available"
                      : contentLoading
                        ? "Checking"
                        : "Connected"}
                </StatusBadge>
              </div>
            </div>
          </div>
        </Container>

        <Container className="divide-y p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
            <div>
              <Heading level="h2">Needs attention</Heading>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                English (India) editorial items that are not currently published.
              </Text>
            </div>
            <Button asChild variant="secondary" size="small">
              <Link to="/content">Open content library</Link>
            </Button>
          </div>
          <div className="grid gap-3 px-6 py-5 md:grid-cols-2">
            <div className="flex items-start justify-between gap-4 rounded-md border border-ui-border-base p-4">
              <div>
                <Text size="small" weight="plus">{needsReview} modified drafts</Text>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Saved changes that are not yet customer-facing.
                </Text>
              </div>
              <Button asChild variant="secondary" size="small">
                <Link to="/content?status=modified">View</Link>
              </Button>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-md border border-ui-border-base p-4">
              <div>
                <Text size="small" weight="plus">{draftOnly} unpublished drafts</Text>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  New records awaiting validation and publication.
                </Text>
              </div>
              <Button asChild variant="secondary" size="small">
                <Link to="/content?status=draft">View</Link>
              </Button>
            </div>
          </div>
        </Container>

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

        <Container className="px-6 py-4">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Draft saves never publish automatically. Editorial publication stays explicit, while
            promotions, campaigns, collection membership and category hierarchy use native Medusa controls.
          </Text>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
