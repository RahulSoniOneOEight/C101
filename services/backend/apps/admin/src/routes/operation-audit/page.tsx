import { DocumentText } from "@medusajs/icons";
import { Container, Heading, StatusBadge, Table, Text } from "@medusajs/ui";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { CmsLoading, CmsUnavailable } from "../../components/operations/cms-state";
import { PageHeader } from "../../components/operations/page-header";
import { useCmsAudit } from "../../hooks/api/buildkart";

// The dashboard SDK requires route metadata to be exported beside the page component.
// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Operation audit",
  icon: DocumentText,
  rank: 70,
};

export default function OperationAuditPage() {
  const audit = useCmsAudit();
  return (
    <SingleColumnPage>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0"><PageHeader title="Operation audit" description="Append-only evidence for governed merchandising commands." /></Container>
        {audit.isPending ? <CmsLoading /> : null}
        {audit.isError ? <CmsUnavailable detail={audit.error.message} /> : null}
        {audit.isSuccess ? (
          <Container className="divide-y p-0">
            <div className="px-6 py-4"><Heading level="h2">Recent commands</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">Latest 100 CMS actions, newest first.</Text></div>
            {audit.data.data.length ? (
              <Table>
                <Table.Header><Table.Row><Table.HeaderCell>Action</Table.HeaderCell><Table.HeaderCell>Entity</Table.HeaderCell><Table.HeaderCell>Operator</Table.HeaderCell><Table.HeaderCell>Reason</Table.HeaderCell><Table.HeaderCell>Time</Table.HeaderCell><Table.HeaderCell>Outcome</Table.HeaderCell></Table.Row></Table.Header>
                <Table.Body>
                  {audit.data.data.map((record) => (
                    <Table.Row key={record.commandId} data-testid={`audit-${record.commandId}`}>
                      <Table.Cell><Text size="small" weight="plus">{record.action}</Text><Text size="xsmall" className="text-ui-fg-muted">{record.commandId}</Text></Table.Cell>
                      <Table.Cell><Text size="small">{record.entityType}</Text><Text size="xsmall" className="text-ui-fg-muted">{record.entityId ?? "—"}</Text></Table.Cell>
                      <Table.Cell>{record.actorId}</Table.Cell>
                      <Table.Cell className="max-w-xs"><Text size="small" className="truncate">{record.reason}</Text></Table.Cell>
                      <Table.Cell>{record.createdAt ? new Date(record.createdAt).toLocaleString("en-IN") : "—"}</Table.Cell>
                      <Table.Cell><StatusBadge color={record.outcome === "succeeded" ? "green" : "red"}>{record.outcome}</StatusBadge></Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : <div className="px-6 py-12 text-center"><Text size="small" className="text-ui-fg-subtle">No merchandising commands recorded yet.</Text></div>}
          </Container>
        ) : null}
      </div>
    </SingleColumnPage>
  );
}
