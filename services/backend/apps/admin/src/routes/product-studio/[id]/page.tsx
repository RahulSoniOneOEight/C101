import { SingleColumnPage } from "@mercurjs/dashboard-shared";
import { useParams } from "react-router-dom";
import { ProductStudioForm } from "../studio-form";

export default function ProductStudioEditPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <SingleColumnPage>
      <ProductStudioForm mode="admin" productId={id} />
    </SingleColumnPage>
  );
}
