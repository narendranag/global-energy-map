import type { Metadata } from "next";
import { LegalDoc } from "@/components/ui/LegalDoc";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "Terms of use for the Global Energy Map: not advice, data licences and attribution, acceptable use, no warranty.",
};

export default function TermsPage() {
  return <LegalDoc file="terms" title="Terms of use" />;
}
