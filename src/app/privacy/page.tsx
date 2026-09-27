import type { Metadata } from "next";
import { LegalDoc } from "@/components/ui/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Privacy policy for the Global Energy Map: no accounts, Vercel and Google Analytics, OpenFreeMap basemap tiles, and SQL that never leaves your browser.",
};

export default function PrivacyPage() {
  return <LegalDoc file="privacy" title="Privacy" />;
}
