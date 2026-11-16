import { expect, test } from "bun:test";
import { hasUnmanagedInventoryItems } from "../src/lib/order-inventory";

test("explains a linked offer whose Mercur inventory management is disabled", () => {
  expect(hasUnmanagedInventoryItems([
    { offer: { manage_inventory: false, inventory_item_link: [{}] } },
  ])).toBe(true);
});

test("does not describe a managed offer's missing reservation as intentional", () => {
  expect(hasUnmanagedInventoryItems([
    { offer: { manage_inventory: true, inventory_item_link: [{}] } },
  ])).toBe(false);
});

test("does not infer an inventory policy from a missing offer or link", () => {
  expect(hasUnmanagedInventoryItems(undefined)).toBe(false);
  expect(hasUnmanagedInventoryItems([{}])).toBe(false);
  expect(hasUnmanagedInventoryItems([
    { offer: { manage_inventory: false, inventory_item_link: [] } },
  ])).toBe(false);
});
