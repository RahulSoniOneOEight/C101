import { defineNavigationConfig } from "@mercurjs/dashboard-sdk";

export default defineNavigationConfig({
  items: [
    { id: "products", label: "Catalogue" },
    { id: "price-lists", hidden: true },
  ],
});
