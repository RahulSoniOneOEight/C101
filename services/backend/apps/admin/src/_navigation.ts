import { defineNavigationConfig } from "@mercurjs/dashboard-sdk";

export default defineNavigationConfig({
  items: [
    { id: "orders", rank: 10 },
    { id: "customers", rank: 11 },
    { id: "products", label: "Catalogue", rank: 20 },
    { id: "categories", nested: "products", rank: 21 },
    { id: "collections", nested: "products", rank: 22 },
    { id: "price-lists", nested: "products", rank: 23 },
    { id: "promotions", rank: 25 },
    { id: "campaigns", hidden: true },
    { id: "stores", label: "Sellers", rank: 40 },
    { id: "offers", rank: 41 },
    { id: "inventory", hidden: true },
    { id: "reservations", hidden: true },
    { id: "payouts", hidden: true },
  ],
});
