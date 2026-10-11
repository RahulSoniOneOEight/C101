import type { ComponentType } from "react";
import { Container, Text } from "@medusajs/ui";
import { Link } from "react-router-dom";

interface SummaryCardProps {
  label: string;
  value: number | string;
  description: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  testId: string;
}

export function SummaryCard({ label, value, description, to, icon: Icon, testId }: SummaryCardProps) {
  return (
    <Link to={to} className="block" data-testid={testId}>
      <Container className="h-full p-5 transition-shadow hover:shadow-elevation-card-hover">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Text size="small" weight="plus" className="text-ui-fg-subtle">
              {label}
            </Text>
            <Text className="mt-2 text-3xl font-semibold tabular-nums text-ui-fg-base">
              {value}
            </Text>
          </div>
          <div className="rounded-lg bg-ui-bg-subtle p-2 text-ui-fg-subtle">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <Text size="xsmall" className="mt-3 text-ui-fg-muted">
          {description}
        </Text>
      </Container>
    </Link>
  );
}
