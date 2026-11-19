import type { ComposedProduct } from "./experience-api";

export interface CatalogueCategory {
  slug: string;
  name: string;
  blurb: string;
  keywords: string[];
}

/**
 * Lightweight merchandising taxonomy over the composed catalogue. Product titles are the only
 * stable text the public list endpoint returns, so matching stays deliberately simple and
 * transparent: a product belongs to a category when its title contains one of the keywords.
 */
export const CATEGORIES: CatalogueCategory[] = [
  {
    slug: "building",
    name: "Building materials",
    blurb: "Cement, boards, plywood and mesh",
    keywords: ["cement", "board", "plywood", "mesh", "wire"],
  },
  {
    slug: "paint",
    name: "Paint & finishes",
    blurb: "Exterior emulsions and premium finishes",
    keywords: ["paint", "emulsion", "apcolite", "ace"],
  },
  {
    slug: "tools",
    name: "Tools & hardware",
    blurb: "Hand tools, socket sets and adhesives",
    keywords: ["socket", "allen", "pliers", "hammer", "tape", "tool"],
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    blurb: "Taps, mixers and showers",
    keywords: ["tap", "cock", "shower", "mixer", "basin"],
  },
  {
    slug: "lighting",
    name: "Lighting",
    blurb: "Downlights and statement pendants",
    keywords: ["light", "downlight", "pendant"],
  },
  {
    slug: "tyres",
    name: "Tyres & wheels",
    blurb: "Road-ready rubber for every load",
    keywords: ["ranger", "tyre", "tire"],
  },
];

export function categoryBySlug(slug: string | undefined): CatalogueCategory | undefined {
  if (!slug) return undefined;
  return CATEGORIES.find((category) => category.slug === slug);
}

export function matchesCategory(product: ComposedProduct, category: CatalogueCategory): boolean {
  const haystack = `${product.title} ${product.description ?? ""} ${product.handle ?? ""}`.toLowerCase();
  return category.keywords.some((keyword) => haystack.includes(keyword));
}

export function productsInCategory(
  products: ComposedProduct[],
  category: CatalogueCategory,
): ComposedProduct[] {
  return products.filter((product) => matchesCategory(product, category));
}

export function searchProducts(
  products: ComposedProduct[],
  query: string,
  category?: CatalogueCategory,
): ComposedProduct[] {
  const scope = category ? productsInCategory(products, category) : products;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return scope;
  return scope.filter((product) => {
    const haystack = productSearchText(product);
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Searchable projection of a composed product. Seller and category names are included because
 * shoppers search "UrbanBuild" or "plywood" as often as they search a title.
 */
export function productSearchText(product: ComposedProduct): string {
  const metadata = product.metadata ?? {};
  const brand = typeof metadata.brand === "string" ? metadata.brand : "";
  const categoryL1 = typeof metadata.category_l1 === "string" ? metadata.category_l1 : "";
  const categoryL2 = typeof metadata.category_l2 === "string" ? metadata.category_l2 : "";
  const categories = (product.categories ?? []).map((category) => category.name).join(" ");
  return [
    product.title,
    product.description ?? "",
    product.handle ?? "",
    brand,
    categoryL1,
    categoryL2,
    categories,
    product.best_price?.seller_name ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function categoryForProduct(product: ComposedProduct): CatalogueCategory | undefined {
  return CATEGORIES.find((category) => matchesCategory(product, category));
}
