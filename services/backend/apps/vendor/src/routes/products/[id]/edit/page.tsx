import { Navigate, useParams } from "react-router-dom";

/**
 * Seller parity: the row menu "Edit" must land in the Product Studio used by Create.
 */
export default function VendorProductEditRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/products" replace />;
  return <Navigate to={`/product-studio/${id}`} replace />;
}
