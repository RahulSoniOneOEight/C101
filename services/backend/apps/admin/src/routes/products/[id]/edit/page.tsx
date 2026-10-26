import { Navigate, useParams } from "react-router-dom";

/**
 * The Products list row menu links to the native edit route. Send it to the Product Studio so
 * "Edit" always opens the same flow as "Create".
 */
export default function ProductEditRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/products" replace />;
  return <Navigate to={`/product-studio/${id}`} replace />;
}
