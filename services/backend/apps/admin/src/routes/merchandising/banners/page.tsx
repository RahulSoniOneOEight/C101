import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ContentPropertyPage } from "../../content/content-property-page";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Banners",
  rank: 2,
  nested: "/merchandising",
};

export default function BannersPage() {
  return <ContentPropertyPage kind="banner" />;
}
