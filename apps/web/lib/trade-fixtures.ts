/**
 * Staging trade-credit fixture.
 *
 * The Flutter B2B credit screen is a pilot fixture, not an API-backed ledger. The web surface mirrors
 * the same values so parity can be reviewed without inventing production credit data. Every screen
 * that renders this fixture labels it as staging test data.
 */
export const TRADE_CREDIT = {
  gstin: "27ABCDE1234F1Z5",
  sanctionedMinor: 20_000_000,
  utilisedMinor: 2_845_000,
  availableMinor: 17_155_000,
  overdueMinor: 5_970_000,
  utilisationPercent: 14,
  averageDaysDue: 18,
  nextDue: {
    date: "15 Sep",
    amountMinor: 7_500_000,
    invoice: "INV-2024",
  },
  totalInvoices: 5,
  totalInvoiceValueMinor: 18_300_000,
  invoices: [
    { id: "INV-2024", amountMinor: 7_500_000, due: "15 Sep", status: "due" },
    { id: "INV-9904", amountMinor: 9_630_000, due: "Overdue", status: "overdue" },
  ],
  overdueInvoiceCount: 3,
} as const;
