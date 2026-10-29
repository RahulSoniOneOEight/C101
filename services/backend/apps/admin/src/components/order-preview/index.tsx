/* eslint-disable react-refresh/only-export-components */
import { Button, Container, Heading, StatusBadge, Text } from "@medusajs/ui";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type PreviewMode = "admin" | "seller" | "app" | "web";
export type Tone = "green" | "orange" | "blue" | "red" | "grey" | "purple";

export function usePreviewMode(): PreviewMode {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("previewMode");
  if (mode === "seller" || mode === "app" || mode === "web") return mode;
  return "admin";
}

export function usePreviewModeUrl(mode: PreviewMode): string {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  if (mode === "admin") {
    next.delete("previewMode");
  } else {
    next.set("previewMode", mode);
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}

export function RoleModeSwitch() {
  const mode = usePreviewMode();
  const [searchParams] = useSearchParams();

  const modes: Array<{ id: PreviewMode; label: string }> = [
    { id: "admin", label: "Admin" },
    { id: "seller", label: "Seller" },
    { id: "app", label: "App" },
    { id: "web", label: "Web" },
  ];

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-1"
      role="group"
      aria-label="Preview mode"
    >
      {modes.map((item) => {
        const next = new URLSearchParams(searchParams);
        if (item.id === "admin") {
          next.delete("previewMode");
        } else {
          next.set("previewMode", item.id);
        }
        const query = next.toString();
        const href = query ? `?${query}` : "";
        const active = mode === item.id;
        return (
          <a
            key={item.id}
            href={href}
            data-discover="true"
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-ui-bg-base text-ui-fg-base shadow-sm"
                : "text-ui-fg-subtle hover:bg-ui-bg-base hover:text-ui-fg-base",
            ].join(" ")}
          >
            {item.label}
          </a>
        );
      })}
    </div>
  );
}

export function PerspectiveBanner({ mode }: { mode: PreviewMode }) {
  const copy: Record<PreviewMode, { title: string; body: string; tone: Tone }> = {
    admin: {
      title: "Admin view",
      body: "You see payment, delivery and return operations across the marketplace.",
      tone: "blue",
    },
    seller: {
      title: "Seller view",
      body: "Payment and refunds are managed by BuildKart Admin. You see only allocation, packaging and delivery.",
      tone: "orange",
    },
    app: {
      title: "Customer app view",
      body: "This is the simplified in-app experience the customer sees.",
      tone: "green",
    },
    web: {
      title: "Customer web view",
      body: "This is the owner-scoped web experience the customer sees.",
      tone: "green",
    },
  };
  const current = copy[mode];
  return (
    <div
      className={[
        "mb-4 rounded-lg border px-4 py-3 text-sm",
        mode === "seller"
          ? "border-ui-border-warning bg-ui-bg-warning text-ui-fg-warning"
          : "border-ui-border-base bg-ui-bg-subtle text-ui-fg-base",
      ].join(" ")}
      role="note"
    >
      <strong className="block text-xs font-semibold uppercase tracking-wide">
        {current.title}
      </strong>
      <span className="text-ui-fg-subtle">{current.body}</span>
    </div>
  );
}

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
      className="mb-4 flex items-center gap-2 overflow-x-auto border-b border-ui-border-base pb-2"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle">
        Jump to
      </span>
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-ui-fg-subtle hover:bg-ui-bg-subtle hover:text-ui-fg-base"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}

export function PaymentsCard({
  order,
  mode,
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
  mode: PreviewMode;
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

  const isSeller = mode === "seller";

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

        {isSeller ? (
          <div className="mt-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3 text-sm text-ui-fg-subtle">
            Payment capture and refunds are managed by BuildKart Admin. Seller actions are limited to
            fulfillment and return inspection.
          </div>
        ) : (
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
        )}
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
