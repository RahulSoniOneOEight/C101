/** Formats a minor-unit amount. Server-composed prices remain authoritative. */
export function formatMoney(amountMinor: number, currencyCode: string): string {
  const major = amountMinor / 100;
  const text = Number.isInteger(major) ? major.toString() : major.toFixed(2);
  switch (currencyCode.toUpperCase()) {
    case "INR":
      return `₹${text}`;
    case "USD":
      return `$${text}`;
    default:
      return `${currencyCode.toUpperCase()} ${text}`;
  }
}
