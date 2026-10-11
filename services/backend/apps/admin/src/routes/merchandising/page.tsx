import { useState } from "react";
import { Calendar, Plus, Spinner } from "@medusajs/icons";
import { Button, Container, Heading, Input, StatusBadge, Table, Text, toast } from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { Link } from "react-router-dom";
import { CmsLoading, CmsUnavailable } from "../../components/operations/cms-state";
import { PageHeader } from "../../components/operations/page-header";
import { useCmsContent, usePublishCmsContent, type CmsStatus } from "../../hooks/api/buildkart";

// The dashboard SDK requires route metadata to be exported beside the page component.
// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Merchandising",
  icon: Calendar,
  rank: 30,
};

function value(document: Record<string, unknown>, key: string, fallback = "—"): string {
  const current = document[key];
  return typeof current === "string" && current.trim() ? current : fallback;
}

function formatDate(input: unknown): string {
  if (typeof input !== "string" || !input) return "—";
  const date = new Date(input);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function MerchandisingPage() {
  const [status, setStatus] = useState<CmsStatus>("draft");
  const [reason, setReason] = useState("");
  const banners = useCmsContent("banners", status);
  const publication = usePublishCmsContent();

  const act = async (documentId: string) => {
    if (reason.trim().length < 3) {
      toast.error("Add a reason before changing publication status.");
      return;
    }
    try {
      await publication.mutateAsync({
        type: "banners",
        documentId,
        operation: status === "draft" ? "publish" : "unpublish",
        reason: reason.trim(),
      });
      toast.success(status === "draft" ? "Banner published" : "Banner returned to draft");
      setReason("");
    } catch (error) {
      toast.error("Content command failed", { description: (error as Error).message });
    }
  };

  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <PageHeader
            title="Merchandising"
            description="Plan and publish storefront content without changing prices, stock or seller terms."
            actions={
              <Button asChild size="small" data-testid="create-banner">
                <Link to="/merchandising/banners/new"><Plus />Create banner</Link>
              </Button>
            }
          />
          <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex gap-2">
              <Button size="small" variant={status === "draft" ? "primary" : "secondary"} onClick={() => setStatus("draft")} data-testid="show-drafts">Drafts</Button>
              <Button size="small" variant={status === "published" ? "primary" : "secondary"} onClick={() => setStatus("published")} data-testid="show-published">Published</Button>
            </div>
            <div className="w-full max-w-lg">
              <label htmlFor="publication-reason" className="txt-compact-small-plus text-ui-fg-subtle">Reason for publish/unpublish</label>
              <Input
                id="publication-reason"
                className="mt-1"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Example: Approved for Diwali trade campaign"
                data-testid="publication-reason"
              />
            </div>
          </div>
        </Container>

        {banners.isPending ? <CmsLoading /> : null}
        {banners.isError ? <CmsUnavailable detail={banners.error.message} /> : null}

        {banners.isSuccess ? (
          <Container className="divide-y p-0">
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <Heading level="h2">Storefront banners</Heading>
                <Text size="small" className="mt-1 text-ui-fg-subtle">B2C and B2B creative organized by placement and schedule.</Text>
              </div>
              <StatusBadge color={status === "published" ? "green" : "grey"}>{status}</StatusBadge>
            </div>
            {banners.data.data.length ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Banner</Table.HeaderCell>
                    <Table.HeaderCell>Audience</Table.HeaderCell>
                    <Table.HeaderCell>Placement</Table.HeaderCell>
                    <Table.HeaderCell>Schedule</Table.HeaderCell>
                    <Table.HeaderCell>Updated</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Action</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {banners.data.data.map((banner) => (
                    <Table.Row key={banner.documentId} data-testid={`banner-${banner.documentId}`}>
                      <Table.Cell>
                        <Text size="small" weight="plus">{value(banner, "title")}</Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">{value(banner, "contentKey")}</Text>
                      </Table.Cell>
                      <Table.Cell><StatusBadge color={value(banner, "audience") === "b2b" ? "purple" : "blue"}>{value(banner, "audience")}</StatusBadge></Table.Cell>
                      <Table.Cell>{value(banner, "placement")}</Table.Cell>
                      <Table.Cell>
                        <Text size="xsmall">{formatDate(banner.startsAt)}</Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">to {formatDate(banner.endsAt)}</Text>
                      </Table.Cell>
                      <Table.Cell>{formatDate(banner.updatedAt)}</Table.Cell>
                      <Table.Cell className="text-right">
                        <Button
                          size="small"
                          variant="secondary"
                          isLoading={publication.isPending && publication.variables?.documentId === banner.documentId}
                          onClick={() => void act(banner.documentId)}
                          data-testid={`${status === "draft" ? "publish" : "unpublish"}-${banner.documentId}`}
                        >
                          {publication.isPending && publication.variables?.documentId === banner.documentId ? <Spinner className="animate-spin" /> : null}
                          {status === "draft" ? "Publish" : "Unpublish"}
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <div className="px-6 py-12 text-center">
                <Heading level="h3">No {status} banners</Heading>
                <Text size="small" className="mt-2 text-ui-fg-subtle">Create a banner to start the governed review and publication flow.</Text>
              </div>
            )}
          </Container>
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Container className="p-5"><Heading level="h2">Campaigns</Heading><Text size="small" className="mt-2 text-ui-fg-subtle">Group banners and collections by objective, audience and schedule.</Text><StatusBadge color="blue" className="mt-4">Schema ready</StatusBadge></Container>
          <Container className="p-5"><Heading level="h2">Curated collections</Heading><Text size="small" className="mt-2 text-ui-fg-subtle">Order stable product references while Commerce supplies live selling data.</Text><StatusBadge color="blue" className="mt-4">Schema ready</StatusBadge></Container>
          <Container className="p-5"><Heading level="h2">Storefront layouts</Heading><Text size="small" className="mt-2 text-ui-fg-subtle">Compose approved modules separately for B2C and B2B.</Text><StatusBadge color="blue" className="mt-4">Schema ready</StatusBadge></Container>
        </div>
      </div>
    </SingleColumnPage>
  );
}
