import { defineNavigationConfig } from "@mercurjs/dashboard-sdk";

export default defineNavigationConfig({
  items: [
    { id: "products", label: "Catalogue" },
    { id: "offers", label: "Seller products" },
    { id: "price-lists", hidden: true },
  ],
});
