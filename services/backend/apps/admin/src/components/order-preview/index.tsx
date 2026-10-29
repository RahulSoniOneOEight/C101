import { Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui";
import { useMemo } from "react";

export type Tone = "green" | "orange" | "blue" | "red" | "grey" | "purple";

export type StatusStripItem = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

export function StatusStrip({ items }: { items: StatusStripItem[] }) {
  const toneClasses: Record<Tone, string> = {
    green: "bg-ui-bg-base text-ui-fg-base",
    orange: "bg-ui-bg-base text-ui-fg-base",
    blue: "bg-ui-bg-base text-ui-fg-base",
    red: "bg-ui-bg-base text-ui-fg-base",
    grey: "bg-ui-bg-base text-ui-fg-base",
    purple: "bg-ui-bg-base text-ui-fg-base",
  };

  const dotTone: Record<Tone, string> = {
    green: "bg-ui-tag-green-icon",
    orange: "bg-ui-tag-orange-icon",
    blue: "bg-ui-tag-blue-icon",
    red: "bg-ui-tag-red-icon",
    grey: "bg-ui-tag-neutral-icon",
    purple: "bg-ui-tag-purple-icon",
  };

  return (
    <section aria-label="Order status" className="mb-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className={[
              "rounded-lg border border-ui-border-base p-4 shadow-sm",
              toneClasses[item.tone],
            ].join(" ")}
          >
            <span className="text-xs font-medium text-ui-fg-subtle">{item.label}</span>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={["h-2 w-2 rounded-full", dotTone[item.tone]].join(" ")}
                aria-hidden="true"
              />
              <strong className="text-sm">{item.value}</strong>
            </div>
            <div className="mt-1 truncate text-xs text-ui-fg-subtle">{item.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export type AttentionItem = {
  tone: Tone;
  title: string;
  detail: string;
  action?: string;
  href?: string;
  onClick?: () => void;
};

export function AttentionStack({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Needs attention" className="mb-4 flex flex-col gap-3">
      {items.map((item) => (
        <div
          key={item.title}
          className={[
            "flex flex-wrap items-center gap-3 rounded-lg border-l-4 px-4 py-3",
            item.tone === "red"
              ? "border-l-ui-border-error bg-ui-bg-error text-ui-fg-error"
              : "border-l-ui-border-warning bg-ui-bg-warning text-ui-fg-warning",
          ].join(" ")}
        >
          <div className="min-w-0 flex-1">
            <strong className="text-sm">{item.title}</strong>
            <p className="text-xs text-ui-fg-subtle">{item.detail}</p>
          </div>
          {item.action ? (
            item.href ? (
              <Button variant="secondary" size="small" asChild>
                <a href={item.href}>{item.action}</a>
              </Button>
            ) : (
              <Button variant="secondary" size="small" onClick={item.onClick}>
                {item.action}
              </Button>
            )
          ) : null}
        </div>
      ))}
    </section>
  );
}

export function SectionNav({ sections }: { sections: Array<{ id: string; label: string }> }) {
  return (
    <nav
      aria-label="Order sections"
      className="mb-3 flex items-center gap-2 overflow-x-auto border-b border-ui-border-base pb-2 scrollbar-hide"
    >
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle">
        Jump to
      </span>
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-ui-fg-subtle hover:bg-ui-bg-subtle hover:text-ui-fg-base"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}

export function ReconciliationCard({
  rows,
}: {
  rows: Array<{ label: string; status: string; tone: Tone; detail?: string }>;
}) {
  return (
    <Container className="p-0" id="reconciliation">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ui-border-base px-5 py-4">
        <div>
          <Heading level="h2">System reconciliation</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            One flow, independently verifiable effects
          </Text>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <div>
                <Text size="small" className="font-medium">
                  {row.label}
                </Text>
                {row.detail ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {row.detail}
                  </Text>
                ) : null}
              </div>
              <StatusBadge color={row.tone === "orange" ? "orange" : row.tone === "green" ? "green" : row.tone === "red" ? "red" : row.tone === "blue" ? "blue" : "grey"}>
                {row.status}
              </StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}

export function PaymentsCard({
  order,
}: {
  order: {
    payment_status?: string | null;
    currency_code?: string | null;
    total?: number | null;
    summary?: {
      subtotal?: number | null;
      shipping_total?: number | null;
      tax_total?: number | null;
      discount_total?: number | null;
      total?: number | null;
      refunded_total?: number | null;
    } | null;
  };
}) {
  const currency = order.currency_code ?? "inr";
  const summary = order.summary ?? {};
  const total = summary.total ?? order.total ?? 0;
  const refunded = summary.refunded_total ?? 0;
  const paymentStatus = order.payment_status ?? "pending";

  // Derive money states from Medusa order summary
  const captured = paymentStatus === "captured" ? total : 0;
  const authorized = total;
  const outstanding = Math.max(0, total - captured);

  const rows = useMemo(
    () => [
      { label: "Authorized", value: formatMoney(authorized, currency), tone: "blue" as Tone },
      { label: "Captured", value: formatMoney(captured, currency), tone: "green" as Tone },
      { label: "Refunded", value: formatMoney(refunded, currency), tone: "grey" as Tone },
      { label: "Outstanding", value: formatMoney(outstanding, currency), tone: "orange" as Tone },
    ],
    [authorized, captured, refunded, outstanding, currency],
  );

  return (
    <Container className="p-0" id="payments">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ui-border-base px-5 py-4">
        <div>
          <Heading level="h2">Payments</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Authorized, captured, refunded and outstanding amounts
          </Text>
        </div>
        <StatusBadge color={paymentStatusColor(paymentStatus)}>
          {paymentStatusLabel(paymentStatus)}
        </StatusBadge>
      </div>
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3"
            >
              <span className="text-xs font-medium uppercase tracking-wide text-ui-fg-subtle">
                {row.label}
              </span>
              <div className="mt-1 text-sm font-semibold">{row.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
          <div className="min-w-0 flex-1">
            <Text size="small" weight="plus">
              Native Medusa payment controls
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              Capture and refund actions continue to use the built-in Medusa controls below.
            </Text>
          </div>
          <span className="rounded-full border border-ui-border-base bg-ui-bg-base px-2 py-1 text-xs font-medium text-ui-fg-subtle">
            Native
          </span>
        </div>
      </div>
    </Container>
  );
}

function formatMoney(amount: number, currencyCode: string) {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode.toUpperCase()} ${amount.toLocaleString("en-IN")}`;
  }
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    authorized: "Authorized",
    captured: "Captured",
    partially_refunded: "Partially Refunded",
    refunded: "Refunded",
    pending: "Pending",
    canceled: "Canceled",
  };
  return labels[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function paymentStatusColor(status: string): "green" | "orange" | "blue" | "red" | "grey" {
  if (status === "captured") return "green";
  if (status === "partially_refunded") return "orange";
  if (status === "refunded") return "grey";
  if (status === "authorized" || status === "pending") return "blue";
  if (status === "canceled") return "red";
  return "grey";
}
