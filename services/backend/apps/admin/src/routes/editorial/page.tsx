import { DocumentText } from "@medusajs/icons";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Navigate } from "react-router-dom";

// The home for editors displaced from Merchandising. Merchandising is the storefront composition
// surface (Banners and Storefront layouts); the individual content types live here, so the two menus
// stay honest about what each one is for.
// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Editorial",
  icon: DocumentText,
  rank: 56,
};

export default function EditorialPage() {
  return <Navigate to="/editorial/category-presentation" replace />;
}
