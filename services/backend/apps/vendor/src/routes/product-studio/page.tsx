import { DocumentText } from "@medusajs/icons";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { ProductStudioForm } from "./studio-form";

export const config: RouteConfig = {
  label: "Product studio",
  icon: DocumentText,
  rank: 20,
};

export default function VendorProductStudioPage() {
  return (
    <SingleColumnPage>
      <ProductStudioForm mode="vendor" />
    </SingleColumnPage>
  );
}
