import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Phlebas",
    template: "%s | Phlebas",
  },
  description:
    "A simulation and protocol plan for transparent ZEC markets against USDC and USDT0.",
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
