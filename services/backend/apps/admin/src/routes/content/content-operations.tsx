import { Button, Heading, StatusBadge, Table, Text } from "@medusajs/ui";
import { Link } from "react-router-dom";
import {
  contentDocumentRoute,
  statusColor,
  statusLabel,
  type ContentLocale,
} from "./content-model";
import {
  contentItemDate,
  contentItemKey,
  contentItemTitle,
  type ContentLibraryItem,
} from "./use-content-library";

const OPERATIONS_REFERENCE_TIME = Date.now();

export function PageTabs({
  label,
  active,
  tabs,
}: {
  label: string;
  active: string;
  tabs: Array<{ value: string; label: string; to: string; count?: number }>;
}) {
  return (
    <div className="overflow-x-auto border-b border-ui-border-base px-4 pt-3">
      <div className="flex min-w-max gap-1" role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <Button
            key={tab.value}
            asChild
            variant={active === tab.value ? "secondary" : "transparent"}
            size="small"
          >
            <Link
              to={tab.to}
              role="tab"
              aria-selected={active === tab.value}
            >
              {tab.label}
              {tab.count === undefined ? null : (
                <span className="text-ui-fg-subtle">{tab.count}</span>
              )}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

function timingLabel(item: ContentLibraryItem): string {
  const startsAt = contentItemDate(item, "startsAt") ?? contentItemDate(item, "effectiveAt");
  const endsAt = contentItemDate(item, "endsAt");
  if (startsAt && startsAt.getTime() > OPERATIONS_REFERENCE_TIME) {
    return `Starts ${startsAt.toLocaleString("en-IN")}`;
  }
  if (endsAt && endsAt.getTime() > OPERATIONS_REFERENCE_TIME) {
    return `Ends ${endsAt.toLocaleString("en-IN")}`;
  }
  if (startsAt) return `Started ${startsAt.toLocaleDateString("en-IN")}`;
  return "No schedule";
}

export function ContentOperationsTable({
  items,
  locale,
  emptyTitle,
  emptyDescription,
  limit = 20,
  dateField = "updatedAt",
  dateLabel = "Updated",
}: {
  items: ContentLibraryItem[];
  locale: ContentLocale;
  emptyTitle: string;
  emptyDescription: string;
  limit?: number;
  dateField?: "updatedAt" | "publishedAt";
  dateLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="px-6 py-10">
        <Heading level="h3">{emptyTitle}</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">{emptyDescription}</Text>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[52rem]">
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Content</Table.HeaderCell>
            <Table.HeaderCell>Type</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Timing</Table.HeaderCell>
            <Table.HeaderCell>{dateLabel}</Table.HeaderCell>
            <Table.HeaderCell className="sticky right-0 w-28 bg-ui-bg-base">
              <span className="sr-only">Action</span>
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.slice(0, limit).map((item) => (
            <Table.Row key={`${item.kind}:${item.document.documentId}`}>
              <Table.Cell>
                <Link
                  to={contentDocumentRoute(item.kind, item.document.documentId, locale)}
                  className="block max-w-72 hover:text-ui-fg-interactive"
                >
                  <Text size="small" weight="plus">{contentItemTitle(item)}</Text>
                  <Text size="xsmall" className="truncate text-ui-fg-subtle">
                    {contentItemKey(item)}
                  </Text>
                </Link>
              </Table.Cell>
              <Table.Cell><Text size="small">{item.kindLabel}</Text></Table.Cell>
              <Table.Cell>
                <StatusBadge color={statusColor(item.document.publicationStatus)}>
                  {statusLabel(item.document.publicationStatus)}
                </StatusBadge>
              </Table.Cell>
              <Table.Cell>
                <Text size="xsmall" className="text-ui-fg-subtle">{timingLabel(item)}</Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {contentItemDate(item, dateField)?.toLocaleString("en-IN") ?? "—"}
                </Text>
              </Table.Cell>
              <Table.Cell className="sticky right-0 bg-ui-bg-base">
                <Button asChild variant="secondary" size="small">
                  <Link to={contentDocumentRoute(item.kind, item.document.documentId, locale)}>
                    Edit draft
                  </Link>
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </div>
  );
}
