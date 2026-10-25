import { Navigate } from "react-router-dom";

/** The canonical product-create route is /products/new. */
export default function ProductStudioRedirect() {
  return <Navigate to="/products/new" replace />;
}
