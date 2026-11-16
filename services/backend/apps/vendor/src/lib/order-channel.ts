// Checkout stores the buyer channel in metadata because the store publishable key
// links both buyer types to the same Medusa sales channel.
export function orderChannelLabel(metadata: Record<string, unknown> | null | undefined): string | null {
  if (metadata?.channel === "b2b") return "B2B";
  if (metadata?.channel === "b2c") return "B2C";
  return null;
}
