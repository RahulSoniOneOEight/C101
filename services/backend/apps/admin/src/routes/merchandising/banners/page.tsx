import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { BannerStudioPage } from "../../content/banner-studio/banner-studio-page";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Banners",
  rank: 2,
  nested: "/merchandising",
};

export default function BannersPage() {
  return <BannerStudioPage />;
}
