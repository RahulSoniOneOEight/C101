import { NextResponse } from "next/server";
import { listProducts } from "@/lib/experience-api";

/**
 * Small catalogue projection for browser-local merchandising rails. It accepts an ordered id list
 * and returns only those products, preserving the caller's order.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 24);
  if (ids.length === 0) {
    return NextResponse.json({ products: [] }, { headers: { "cache-control": "no-store" } });
  }
  try {
    const catalogue = await listProducts(100);
    const byId = new Map(catalogue.map((product) => [product.id, product]));
    const products = ids
      .map((id) => byId.get(id))
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
    return NextResponse.json(
      { products },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { products: [], error: (error as Error).message },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
