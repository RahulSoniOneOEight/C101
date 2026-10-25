import { defineNavigationConfig } from "@mercurjs/dashboard-sdk";

export default defineNavigationConfig({
  items: [
    { id: "products", label: "Products" },
    { id: "offers", hidden: true },
    { id: "price-lists", label: "Price lists (advanced)", rank: 90 },
  ],
});
