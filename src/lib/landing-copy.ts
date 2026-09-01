export const LANDING_HERO = {
  eyebrow: "Transparent ZEC markets",
  heading: "The custody line, drawn in public.",
  supporting:
    "Phlebas is a no-value implementation of ZEC/USDC and ZEC/USDT spot markets, auditable order sequencing, native atomic settlement, and wallet-held solver liquidity. Native labels are simulation names, not live settlement.",
  primaryAction: "Enter simulation",
  secondaryAction: "Understand native pairs",
  disclosure: "Illustrative data only. Nothing here can be bought, sold, deposited, withdrawn, or redeemed.",
} as const;

export const LANDING_LEDGER_HEADING = "Current system";

export const LANDING_LEDGER = [
  { label: "Product", value: "No-value preview" },
  { label: "Market data", value: "Illustrative fixtures" },
  { label: "Wallet connection", value: "Ethereum Mainnet sign-only" },
  { label: "Contracts", value: "Not deployed" },
  { label: "Custody", value: "Not operating" },
  { label: "Mainnet approval", value: "Not cleared" },
  { label: "Country access", value: "Deny by default" },
] as const;

export const LANDING_SKIP_LINKS = [
  { href: "#main-content", label: "Skip to main content" },
  { href: "#markets", label: "Skip to markets" },
  { href: "#exists-today", label: "Skip to evidence" },
  { href: "#pairs", label: "Skip to native pairs" },
  { href: "#terminal-preview", label: "Skip to terminal preview" },
  { href: "#journeys", label: "Skip to journeys" },
  { href: "#launch-gates", label: "Skip to launch gates" },
] as const;
