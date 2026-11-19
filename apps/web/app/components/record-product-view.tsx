"use client";

import { useEffect } from "react";
import { recordRecentlyViewed } from "@/lib/recently-viewed";

/** Records a product view for the customer-local "Recently viewed" rail. */
export function RecordProductView({ productId }: { productId: string }) {
  useEffect(() => {
    recordRecentlyViewed(productId);
  }, [productId]);
  return null;
}
