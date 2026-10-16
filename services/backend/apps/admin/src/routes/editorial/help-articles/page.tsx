import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ContentPropertyPage } from "../../content/content-property-page";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Help and articles",
  rank: 4,
  nested: "/editorial",
};

export default function HelpArticlesPage() {
  return <ContentPropertyPage kind="faq-article" />;
}
