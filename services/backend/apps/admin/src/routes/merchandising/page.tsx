import { SquaresPlus } from "@medusajs/icons";
import type { RouteConfig } from "@mercurjs/dashboard-sdk";
import { Navigate } from "react-router-dom";

// eslint-disable-next-line react-refresh/only-export-components
export const config: RouteConfig = {
  label: "Merchandising",
  icon: SquaresPlus,
  rank: 55,
};

export default function MerchandisingPage() {
  return <Navigate to="/merchandising/overview" replace />;
}
