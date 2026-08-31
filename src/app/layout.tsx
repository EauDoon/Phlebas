import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const DESCRIPTION =
  "No-value simulation and non-custodial protocol plan for native transparent ZEC against USDC and USDT. Legacy pZEC surfaces are simulation only. Not an exchange or an offer of financial services.";

export const metadata: Metadata = {
  title: {
    default: "Phlebas",
    template: "%s | Phlebas",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "Phlebas",
    description: DESCRIPTION,
    siteName: "Phlebas",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Phlebas",
    description: DESCRIPTION,
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
