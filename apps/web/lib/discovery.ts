/**
 * Guided discovery prompts for the web storefront.
 *
 * The Flutter app introduces shopping with household tasks ("Paint a room"); the web store uses
 * the same prompts and resolves each one to a real catalogue aisle. The mapping is deterministic
 * on purpose: staging has no generative search service, so the UI never pretends to invent an
 * answer. It shows the closest stocked aisle and the shopper can refine from there.
 */
export interface GuidedPrompt {
  label: string;
  categorySlug: string;
  query: string;
  hint: string;
  keywords: string[];
}

export const GUIDED_PROMPTS: GuidedPrompt[] = [
  {
    label: "Paint a room",
    categorySlug: "paints-&-finishes",
    query: "",
    hint: "Paint, primer and finishes for a room refresh.",
    keywords: ["paint", "room", "wall", "emulsion"],
  },
  {
    label: "Fix a leaking pipe",
    categorySlug: "bathroom-&-plumbing",
    query: "",
    hint: "Taps, mixers and fittings for a plumbing repair.",
    keywords: ["pipe", "leak", "plumb", "tap", "bathroom"],
  },
  {
    label: "Drill into concrete",
    categorySlug: "tools-&-hardware",
    query: "",
    hint: "Drills, bits and hand tools for masonry work.",
    keywords: ["drill", "concrete", "masonry", "tool"],
  },
  {
    label: "Wire a new light",
    categorySlug: "lighting-electrical",
    query: "",
    hint: "Lighting and electrical fittings for the job.",
    keywords: ["light", "wire", "electrical", "switch", "fixture"],
  },
];

/**
 * Resolve a free-text task to a guided prompt. Exact label matches win; otherwise a keyword match
 * is used. Returns null when the text is ordinary product search, so callers fall back to the
 * regular query path.
 */
export function resolveGuidedPrompt(input: string): GuidedPrompt | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  const exact = GUIDED_PROMPTS.find((prompt) => prompt.label.toLowerCase() === value);
  if (exact) return exact;
  return (
    GUIDED_PROMPTS.find((prompt) =>
      prompt.keywords.some((keyword) => value.includes(keyword)),
    ) ?? null
  );
}

export function guidedSearchHref(prompt: GuidedPrompt): string {
  const params = new URLSearchParams({ mode: "guided", q: prompt.label });
  return `/search?${params.toString()}`;
}
