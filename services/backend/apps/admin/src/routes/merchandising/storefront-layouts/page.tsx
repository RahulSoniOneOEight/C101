import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ContentPropertyPage } from "../../content/content-property-page";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Storefront layouts",
  rank: 3,
  nested: "/merchandising",
};

export default function StorefrontLayoutsPage() {
  return <ContentPropertyPage kind="storefront-layout" />;
}
