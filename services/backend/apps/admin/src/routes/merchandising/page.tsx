import { ArrowUpRightOnBox, SquaresPlus } from "@medusajs/icons";
import { Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useQuery } from "@tanstack/react-query";
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
    owner: "Strapi",
    description: "Edit layouts, banners, curated references, category copy, product guidance and help content.",
    to: "/content",
    action: "Manage content",
  },
  {
    title: "Promotions",
    owner: "Medusa",
    description: "Create and update discount mechanics, eligibility rules, usage limits and activation status.",
    to: "/promotions",
    action: "Manage promotions",
  },
  {
    title: "Campaigns",
    owner: "Medusa",
    description: "Manage promotion groups, schedules and marketplace-funded staging budgets.",
    to: "/campaigns",
    action: "Manage campaigns",
  },
  {
    title: "Collections and categories",
    owner: "Commerce + CMS",
    description: "Maintain commerce taxonomy in Medusa and editorial collection references in Content.",
    to: "/collections",
    action: "Manage commerce collections",
  },
] as const;

export default function MerchandisingPage() {
  const presetsQuery = useQuery({
    queryKey: ["buildkart", "staging-merchandising-presets"],
    queryFn: () => client.admin.buildkart.merchandisingPresets.query({}),
  });
  const offersQuery = useQuery({
    queryKey: ["buildkart", "staging-merchandising-offers"],
    queryFn: () => client.admin.buildkart.merchandisingOffers.query({}),
  });
  const presets = presetsQuery.data;
  const offers = offersQuery.data?.offers ?? [];
  const configuredPromotions = [
    ...(presets?.promotions ?? []),
    ...offers,
  ].filter((item) => item.live !== null).length;
  const declaredPromotions = (presets?.promotions.length ?? 0) + offers.length;

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level="h1">Merchandising</Heading>
                <StatusBadge color="orange">Staging</StatusBadge>
                <StatusBadge color="blue">Common admin workspace</StatusBadge>
              </div>
              <Text size="small" className="mt-1 text-ui-fg-subtle">
                Review and update storefront presentation from one workspace. Editorial fields stay
                in Strapi; discounts, budgets, taxonomy and transactional rules stay in Medusa.
              </Text>
            </div>
            <Button asChild variant="secondary" size="small">
              <Link to="/merchandising-presets">Review governed presets</Link>
            </Button>
          </div>
          <div className="grid gap-4 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Preset promotions configured</Text>
              <Text size="large" weight="plus">{configuredPromotions}/{declaredPromotions}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Governed campaigns</Text>
              <Text size="large" weight="plus">{(presets?.campaigns.length ?? 0) + (offersQuery.data ? 1 : 0)}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Editorial locales</Text>
              <Text size="large" weight="plus">2</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">Discount ceiling</Text>
              <Text size="large" weight="plus">{presets?.discount_ceiling_percent ?? 10}%</Text>
            </div>
          </div>
        </Container>

        <div className="grid gap-3 md:grid-cols-2">
          {workspaceCards.map((card) => (
            <Container key={card.title} className="flex flex-col justify-between gap-5 p-6">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <Heading level="h2">{card.title}</Heading>
                  <StatusBadge color={card.owner === "Strapi" ? "blue" : "grey"}>{card.owner}</StatusBadge>
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

        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">How updates work</Heading>
          </div>
          <div className="grid gap-5 px-6 py-5 md:grid-cols-3">
            <div>
              <Text size="small" weight="plus">1. Edit</Text>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">Save editorial changes as drafts or update commerce records in their native Medusa forms.</Text>
            </div>
            <div>
              <Text size="small" weight="plus">2. Review</Text>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">Compare draft status, live record status and governed preset safety limits before activation.</Text>
            </div>
            <div>
              <Text size="small" weight="plus">3. Publish or activate</Text>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">Publish CMS content explicitly; use Medusa activation controls for promotions and campaigns.</Text>
            </div>
          </div>
        </Container>
      </div>
    </SingleColumnPage>
  );
}
