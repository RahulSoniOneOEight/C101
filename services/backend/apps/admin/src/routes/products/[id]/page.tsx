import { Navigate, useParams } from "react-router-dom";

/**
 * One product-edit entry point.
 *
 * The Products list links to the native Medusa record, which only offered a bridge widget to the
 * workspace. Redirect straight into the Product Studio so "Edit" always opens the same flow as
 * "Create".
 */
export default function ProductDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/products" replace />;
  return <Navigate to={`/product-studio/${id}`} replace />;
}
