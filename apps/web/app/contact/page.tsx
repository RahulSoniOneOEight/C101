export const dynamic = "force-static";

import { PolicyPage } from "../components/policy-page";
import { getPolicy, policyMetadata } from "@/lib/policies";

export const metadata = policyMetadata("contact");

export default function ContactPage() {
  return <PolicyPage policy={getPolicy("contact")} />;
}
