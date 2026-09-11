import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppErrorBoundary } from "@/components/errors/AppErrorBoundary";
import { GlobalErrorListener } from "@/components/errors/GlobalErrorListener";
import { AUTHOR_NAME, AUTHOR_URL, PRACTICE_NAME } from "@/components/ui/provenance";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_NAME = "Global Energy Map";
const SITE_DESCRIPTION =
  "An interactive open-source map of the world's oil and gas system — reserves, extraction, pipelines, refining, LNG and trade — with chokepoint disruption scenarios.";

export const metadata: Metadata = {
  metadataBase: new URL("https://energymap.marain.space"),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  authors: [{ name: AUTHOR_NAME, url: AUTHOR_URL }],
  creator: AUTHOR_NAME,
  publisher: PRACTICE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-ink">
        <AppErrorBoundary>{children}</AppErrorBoundary>
        <GlobalErrorListener />
        {/* Vercel Web Analytics: cookieless page views; a no-op until enabled
            in the Vercel project. No other trackers. */}
        <Analytics />
      </body>
    </html>
  );
}
