export const dynamic = "force-static";

import { PolicyPage } from "../components/policy-page";
import { getPolicy, policyMetadata } from "@/lib/policies";

export const metadata = policyMetadata("shipping");

export default function ShippingPage() {
  return <PolicyPage policy={getPolicy("shipping")} />;
}
