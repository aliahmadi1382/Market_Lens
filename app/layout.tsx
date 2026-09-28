import type { Metadata } from "next";
import "./globals.css";
import "./glass.css";

export const metadata: Metadata = {
  title: "MarketLens | Seat Cover Intelligence",
  description: "Competitor pricing, product variations, and catalog coverage from public product pages.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><a href="#research-workspace" className="skip-link">Skip to research</a>{children}</body>
    </html>
  );
}
