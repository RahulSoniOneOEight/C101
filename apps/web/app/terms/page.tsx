export const dynamic = "force-static";

import { PolicyPage } from "../components/policy-page";
import { getPolicy, policyMetadata } from "@/lib/policies";

export const metadata = policyMetadata("terms");

export default function TermsPage() {
  return <PolicyPage policy={getPolicy("terms")} />;
}
