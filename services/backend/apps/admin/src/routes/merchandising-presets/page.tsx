import { Tag } from "@medusajs/icons";
import { Container, Heading, StatusBadge, Table, Text } from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import type { InferClientOutput } from "@mercurjs/client";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../lib/client";

// The dashboard SDK requires route metadata beside the page component.
// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Merchandising presets",
  icon: Tag,
  rank: 61,
};

type CatalogueResponse = InferClientOutput<
  typeof client.admin.buildkart.merchandisingPresets.query
>;

const money = (minor: number, currencyCode: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(minor / 100);

export default function MerchandisingPresetsPage() {
  const query = useQuery({
    queryKey: ["buildkart", "staging-merchandising-presets"],
    queryFn: () => client.admin.buildkart.merchandisingPresets.query({}),
  });
  const catalogue = query.data as CatalogueResponse | undefined;
  const promotions = catalogue?.promotions ?? [];
  const campaigns = catalogue?.campaigns ?? [];
  const collections = catalogue?.collections ?? [];
  const content = catalogue?.content ?? [];

  const deferred = promotions.flatMap((promotion) =>
    promotion.deferred_conditions.map((condition) => ({
      promotion: promotion.code,
      ...condition,
    })),
  );

  const offersQuery = useQuery({
    queryKey: ["buildkart", "staging-merchandising-offers"],
    queryFn: () => client.admin.buildkart.merchandisingOffers.query({}),
  });
  const offers = offersQuery.data?.offers ?? [];

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <div className="flex flex-col gap-3 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">Merchandising presets</Heading>
              <StatusBadge color="orange">Simulated staging data</StatusBadge>
              <StatusBadge color="blue">Marketplace-funded</StatusBadge>
              <StatusBadge color="grey">No seller funding</StatusBadge>
            </div>
            <Text size="small" className="max-w-3xl text-ui-fg-subtle">
              Read-only view of the reviewed staging preset pack. Promotions are evaluated by the
              Medusa discount engine and are funded by the marketplace, so no seller is charged.
              Free shipping applies only to carts at or above ₹10,000. This page cannot create,
              activate or discount anything.
            </Text>
          </div>
          <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-4">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Collections
              </Text>
              <Text size="large" weight="plus">
                {collections.length}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Promotions
              </Text>
              <Text size="large" weight="plus">
                {promotions.length}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Campaigns
              </Text>
              <Text size="large" weight="plus">
                {campaigns.length}
              </Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Discount ceiling
              </Text>
              <Text size="large" weight="plus">
                {catalogue?.discount_ceiling_percent ?? 0}%
              </Text>
            </div>
          </div>
        </Container>

        {query.isPending ? (
          <Container className="p-0">
            <Text size="small" className="px-6 py-8 text-ui-fg-subtle">
              Loading presets…
            </Text>
          </Container>
        ) : query.isError || !catalogue ? (
          <Container className="p-0">
            <Text size="small" className="px-6 py-8 text-ui-fg-error">
              Merchandising presets are unavailable outside bounded staging.
            </Text>
          </Container>
        ) : (
          <>
            {deferred.length > 0 ? (
              <Container className="p-0">
                <div className="border-b border-ui-border-base px-6 py-4">
                  <Heading level="h2">Conditions the engine does not enforce</Heading>
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    Recorded policy intent that the Medusa promotion engine cannot evaluate. These
                    are not applied and must not be assumed active.
                  </Text>
                </div>
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Promotion</Table.HeaderCell>
                      <Table.HeaderCell>Condition</Table.HeaderCell>
                      <Table.HeaderCell>Intended value</Table.HeaderCell>
                      <Table.HeaderCell>Reason</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {deferred.map((item) => (
                      <Table.Row key={`${item.promotion}-${item.condition}`}>
                        <Table.Cell>
                          <Text size="small" weight="plus">
                            {item.promotion}
                          </Text>
                        </Table.Cell>
                        <Table.Cell>{item.condition}</Table.Cell>
                        <Table.Cell>{item.value}</Table.Cell>
                        <Table.Cell>
                          <Text size="small" className="text-ui-fg-subtle">
                            {item.reason}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </Container>
            ) : null}

            <Container className="overflow-hidden p-0">
              <div className="border-b border-ui-border-base px-6 py-4">
                <Heading level="h2">Promotions</Heading>
              </div>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Code</Table.HeaderCell>
                    <Table.HeaderCell>Method</Table.HeaderCell>
                    <Table.HeaderCell>Target</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Value</Table.HeaderCell>
                    <Table.HeaderCell>Trigger</Table.HeaderCell>
                    <Table.HeaderCell>Campaign</Table.HeaderCell>
                    <Table.HeaderCell>Enforced condition</Table.HeaderCell>
                    <Table.HeaderCell>Funding</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {promotions.map((promotion) => (
                    <Table.Row key={promotion.code}>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {promotion.code}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{promotion.application_method}</Table.Cell>
                      <Table.Cell>
                        {promotion.target.reference}
                        {promotion.target.customer_group
                          ? ` · ${promotion.target.customer_group}`
                          : ""}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {promotion.application_method === "free_shipping"
                          ? "free shipping"
                          : `${promotion.value}%`}
                      </Table.Cell>
                      <Table.Cell>{promotion.automatic ? "automatic" : "code"}</Table.Cell>
                      <Table.Cell>{promotion.campaign_key}</Table.Cell>
                      <Table.Cell>
                        <Text size="small" className="text-ui-fg-subtle">
                          {promotion.rules.length
                            ? promotion.rules
                                .map(
                                  (rule) =>
                                    `${rule.attribute} ${rule.operator} ${rule.values.join("/")}`,
                                )
                                .join("; ")
                            : "—"}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge color="blue">{promotion.funding_source}</StatusBadge>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </Container>

            <Container className="overflow-hidden p-0">
              <div className="border-b border-ui-border-base px-6 py-4">
                <Heading level="h2">Campaigns</Heading>
              </div>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Campaign</Table.HeaderCell>
                    <Table.HeaderCell>Promotions</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Budget</Table.HeaderCell>
                    <Table.HeaderCell>Window</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {campaigns.map((campaign) => (
                    <Table.Row key={campaign.campaign_key}>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {campaign.campaign_key}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {campaign.title}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{campaign.promotion_codes.join(", ")}</Table.Cell>
                      <Table.Cell className="text-right">
                        {money(campaign.budget_amount_minor, campaign.currency_code)}
                      </Table.Cell>
                      <Table.Cell>
                        {new Date(campaign.starts_at).toLocaleDateString("en-IN")} –{" "}
                        {new Date(campaign.ends_at).toLocaleDateString("en-IN")}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </Container>

            <Container className="overflow-hidden p-0">
              <div className="border-b border-ui-border-base px-6 py-4">
                <Heading level="h2">Collections</Heading>
              </div>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Key</Table.HeaderCell>
                    <Table.HeaderCell>Title</Table.HeaderCell>
                    <Table.HeaderCell>Categories</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {collections.map((collection) => (
                    <Table.Row key={collection.collection_key}>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {collection.collection_key}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{collection.title}</Table.Cell>
                      <Table.Cell>{collection.categories.join(", ")}</Table.Cell>
                      <Table.Cell>
                        <StatusBadge color="green">{collection.status}</StatusBadge>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </Container>

            <Container className="overflow-hidden p-0">
              <div className="border-b border-ui-border-base px-6 py-4">
                <Heading level="h2">Campaign content</Heading>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Editorial only. Content cannot determine discount eligibility.
                </Text>
              </div>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Placement</Table.HeaderCell>
                    <Table.HeaderCell>Type</Table.HeaderCell>
                    <Table.HeaderCell>Locale</Table.HeaderCell>
                    <Table.HeaderCell>Title</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {content.map((element) => (
                    <Table.Row key={element.id}>
                      <Table.Cell>
                        <Text size="small" weight="plus">
                          {element.placement}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>{element.content_type}</Table.Cell>
                      <Table.Cell>{element.locale}</Table.Cell>
                      <Table.Cell>{element.title}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </Container>

            <Container className="overflow-hidden p-0">
              <div className="border-b border-ui-border-base px-6 py-4">
                <Heading level="h2">Offer lab</Heading>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  Engine-verified offer patterns. Each row states the mechanic it maps to, whether
                  it is automatic or code-triggered, and the conditions the engine enforces.
                </Text>
              </div>
              {offersQuery.isError || offers.length === 0 ? (
                <Text size="small" className="px-6 py-6 text-ui-fg-subtle">
                  The offer lab is unavailable outside bounded staging.
                </Text>
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Offer</Table.HeaderCell>
                      <Table.HeaderCell>Mechanic</Table.HeaderCell>
                      <Table.HeaderCell>Trigger</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">Value</Table.HeaderCell>
                      <Table.HeaderCell>Target</Table.HeaderCell>
                      <Table.HeaderCell>Enforced condition</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {offers.map((offer) => {
                      const conditions = [
                        offer.subtotal_threshold !== null
                          ? `subtotal >= ${offer.subtotal_threshold}`
                          : null,
                        offer.min_quantity !== null ? `line qty >= ${offer.min_quantity}` : null,
                        offer.customer_group !== null
                          ? `group = ${offer.customer_group}`
                          : null,
                        offer.apply_to_quantity !== null
                          ? `free ${offer.apply_to_quantity} of ${offer.buy_rules_min_quantity}`
                          : null,
                      ].filter(Boolean);

                      return (
                        <Table.Row key={offer.code}>
                          <Table.Cell>
                            <Text size="small" weight="plus">
                              {offer.code}
                            </Text>
                            <Text size="xsmall" className="text-ui-fg-muted">
                              {offer.title}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>{offer.mechanic}</Table.Cell>
                          <Table.Cell>
                            <StatusBadge
                              color={offer.trigger === "automatic" ? "green" : "grey"}
                            >
                              {offer.trigger}
                            </StatusBadge>
                          </Table.Cell>
                          <Table.Cell className="text-right">
                            {offer.mechanic === "free-shipping"
                              ? "free shipping"
                              : offer.mechanic === "items-fixed"
                                ? money(offer.value, "inr")
                                : `${offer.value}%`}
                          </Table.Cell>
                          <Table.Cell>
                            {offer.target.reference ?? offer.target.type}
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="small" className="text-ui-fg-subtle">
                              {conditions.length ? conditions.join("; ") : "—"}
                            </Text>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table>
              )}
            </Container>
          </>
        )}
      </div>
    </SingleColumnPage>
  );
}
