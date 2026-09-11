import type { Metadata } from "next";
import { LegalDoc } from "@/components/ui/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Privacy policy for the Global Energy Map: no accounts or cookies, cookieless Vercel analytics, OpenFreeMap basemap tiles.",
};

export default function PrivacyPage() {
  return <LegalDoc file="privacy" title="Privacy" />;
}
