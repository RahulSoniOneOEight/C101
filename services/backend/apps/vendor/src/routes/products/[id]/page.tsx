import { Navigate, useParams } from "react-router-dom";

/**
 * Seller parity: opening a product from the list must land in the same Product Studio flow used by
 * Create, not on a separate native record.
 */
export default function VendorProductDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/products" replace />;
  return <Navigate to={`/product-studio/${id}`} replace />;
}
