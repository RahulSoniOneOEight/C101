import { chg049ImageQualityScores } from "./image-quality-scores.generated.js";

export function imageQualityScore(productId: string): number {
  return chg049ImageQualityScores[productId] ?? 0;
}

/**
 * Stable descending display-fitness order for the governed CHG-049 fixture.
 * Unknown products keep their original relative order after scored products.
 */
export function orderByImageQuality<T extends { id: string }>(products: T[]): T[] {
  return products
    .map((product, index) => ({ product, index }))
    .sort((left, right) => {
      const compared = imageQualityScore(right.product.id) - imageQualityScore(left.product.id);
      return compared === 0 ? left.index - right.index : compared;
    })
    .map(({ product }) => product);
}
