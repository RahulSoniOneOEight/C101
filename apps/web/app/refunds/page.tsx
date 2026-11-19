export const dynamic = "force-static";

import { PolicyPage } from "../components/policy-page";
import { getPolicy, policyMetadata } from "@/lib/policies";

export const metadata = policyMetadata("refunds");

export default function RefundsPage() {
  return <PolicyPage policy={getPolicy("refunds")} />;
}
