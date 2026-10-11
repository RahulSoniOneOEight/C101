import type { ReactNode } from "react";
import { Badge, Heading, Text } from "@medusajs/ui";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Heading level="h1">{title}</Heading>
          <Badge color="orange" size="2xsmall">Staging</Badge>
        </div>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          {description}
        </Text>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
