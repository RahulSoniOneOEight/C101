import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { ContentPropertyPage } from "../../content/content-property-page";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Collections & trade lists",
  rank: 3,
  nested: "/editorial",
};

export default function CollectionPresentationPage() {
  return <ContentPropertyPage kind="curated-collection" />;
}
