import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ContentPropertyPage } from "../../content/content-property-page";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Product editorial",
  rank: 2,
  nested: "/editorial",
};

export default function ProductEditorialPage() {
  return <ContentPropertyPage kind="product-editorial" />;
}
