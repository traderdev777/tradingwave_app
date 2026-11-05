import type { Metadata, Viewport } from "next";
import { ThemeScript } from "@/components/ThemeScript";
import "@/styles/fonts.css";
import "@/styles/tokens.css";
import "@/styles/landing.css";
import "@/styles/app.css";
import "@/styles/strategy.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title: "TradingWave · Say it. Test it. Trade it.",
  description:
    "Describe a trading strategy in plain words. TradingWave turns it into clear rules you approve, tests it on paper with real Indian costs, then runs it on your own broker account with risk limits.",
  openGraph: {
    title: "TradingWave · Say it. Test it. Trade it.",
    description: "Plain-language algo trading for India's markets. Join the early access list.",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "any" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = { themeColor: "#0B1424", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
