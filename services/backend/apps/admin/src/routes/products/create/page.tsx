import { Navigate } from "react-router-dom";

/** Retire the native create form from the product creation path. */
export default function NativeCreateRedirect() {
  return <Navigate to="/products/new" replace />;
}
