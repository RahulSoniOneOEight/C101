import { ExclamationCircle, Spinner } from "@medusajs/icons";
import { Container, Heading, Text } from "@medusajs/ui";

export function CmsLoading() {
  return (
    <Container className="flex items-center gap-3 p-6" data-testid="cms-loading">
      <Spinner className="animate-spin" />
      <Text size="small" className="text-ui-fg-subtle">Loading merchandising content…</Text>
    </Container>
  );
}

export function CmsUnavailable({ detail }: { detail?: string }) {
  return (
    <Container className="border-ui-border-error bg-ui-bg-base p-6" data-testid="cms-unavailable">
      <div className="flex items-start gap-3">
        <ExclamationCircle className="mt-0.5 text-ui-fg-error" />
        <div>
          <Heading level="h2">Merchandising service unavailable</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Commerce and marketplace operations are still available. Content changes are disabled until the CMS recovers.
          </Text>
          {detail ? <Text size="xsmall" className="mt-2 text-ui-fg-muted">{detail}</Text> : null}
        </div>
      </div>
    </Container>
  );
}
