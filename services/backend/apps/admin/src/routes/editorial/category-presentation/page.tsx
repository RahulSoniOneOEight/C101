import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ContentPropertyPage } from "../../content/content-property-page";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Category presentation",
  rank: 1,
  nested: "/editorial",
};

export default function CategoryPresentationPage() {
  return <ContentPropertyPage kind="category-editorial" />;
}
