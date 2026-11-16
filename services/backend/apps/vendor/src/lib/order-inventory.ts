type OrderItem = {
  offer?: {
    manage_inventory?: boolean | null;
    inventory_item_link?: unknown[] | null;
  } | null;
};

/** Mercur does not reserve linked stock when the offer opts out of inventory management. */
export function hasUnmanagedInventoryItems(items: OrderItem[] | null | undefined): boolean {
  return Boolean(
    items?.some(
      (item) =>
        item.offer?.manage_inventory === false &&
        Array.isArray(item.offer.inventory_item_link) &&
        item.offer.inventory_item_link.length > 0,
    ),
  );
}
