import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

// Self-hosted brand fonts. next/font/local emits static assets at
// build time so there is no runtime call to Google Fonts — no CSP
// connect-src exception and no user-IP leakage.
// The .woff2 / .ttf files live in app/fonts/ and are fetched once
// via `npm run fonts:fetch`.

const interBody = localFont({
  src: [
    { path: "./fonts/InterVariable.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/InterVariable-Italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const interTightDisplay = localFont({
  src: [
    { path: "./fonts/InterTight-Variable.ttf", weight: "100 900", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Syncit — AR for MSME Distributors",
  description:
    "Payment follow-up and accounts receivable for Indian MSME distributors selling on credit.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interBody.variable} ${interTightDisplay.variable}`}
    >
      <body className="font-syncit-body">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
