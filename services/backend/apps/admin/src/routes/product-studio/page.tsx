import { DocumentText } from "@medusajs/icons";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { ProductStudioForm } from "./studio-form";

export const config: RouteConfig = {
  label: "Product Studio",
  icon: DocumentText,
  rank: 20,
  nested: "products",
};

export default function ProductStudioPage() {
  return (
    <SingleColumnPage>
      <ProductStudioForm mode="admin" />
    </SingleColumnPage>
  );
}
