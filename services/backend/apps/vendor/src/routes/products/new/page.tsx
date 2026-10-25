import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { ProductStudioForm } from "../../product-studio/studio-form";

export default function NewProductPage() {
  return (
    <SingleColumnPage>
      <ProductStudioForm mode="vendor" />
    </SingleColumnPage>
  );
}
