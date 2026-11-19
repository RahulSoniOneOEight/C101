export const dynamic = "force-static";

import { PolicyPage } from "../components/policy-page";
import { getPolicy, policyMetadata } from "@/lib/policies";

export const metadata = policyMetadata("privacy");

export default function PrivacyPage() {
  return <PolicyPage policy={getPolicy("privacy")} />;
}
