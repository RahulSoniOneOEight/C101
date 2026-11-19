/** Formats a minor-unit amount. Server-composed prices remain authoritative. */
export function formatMoney(amountMinor: number, currencyCode: string): string {
  const major = amountMinor / 100;
  switch (currencyCode.toUpperCase()) {
    case "INR":
      return `₹${new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(major)}`;
    case "USD":
      return `$${new Intl.NumberFormat("en-US", {
        minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(major)}`;
    default:
      return `${currencyCode.toUpperCase()} ${major.toFixed(Number.isInteger(major) ? 0 : 2)}`;
  }
}
