/** Turns a server-owned business account id into a readable trade identity. */
export function readableBusinessName(value: string | null | undefined): string {
  if (!value) return "Trade account";
  return value
    .replace(/^business_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
