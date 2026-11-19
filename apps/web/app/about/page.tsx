export const dynamic = "force-static";

import { PolicyPage } from "../components/policy-page";
import { getPolicy, policyMetadata } from "@/lib/policies";

export const metadata = policyMetadata("about");

export default function AboutPage() {
  return <PolicyPage policy={getPolicy("about")} />;
}
