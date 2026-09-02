import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-loaded-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-loaded-mono",
  display: "swap",
});

const DESCRIPTION =
  "Public preview of a non-custodial protocol plan for native transparent ZEC against USDC and USDT. Illustrative data. No mainnet funds. Not an exchange or an offer of financial services.";

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
  themeColor: "#050816",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
