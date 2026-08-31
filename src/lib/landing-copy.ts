export const LANDING_HERO = {
  eyebrow: "Transparent ZEC markets",
  heading: "The custody line, drawn in public.",
  supporting:
    "Phlebas is a production-minded design for ZEC/USDC and ZEC/USDT spot markets, an order book designed for auditable sequencing, and restrained onchain liquidity. Native labels are simulation names, not live settlement.",
  primaryAction: "Enter simulation",
  secondaryAction: "Understand native pairs",
  disclosure: "Illustrative data only. Nothing here can be bought, sold, deposited, withdrawn, or redeemed.",
} as const;

export const LANDING_LEDGER_HEADING = "Current system";

export const LANDING_LEDGER = [
  { label: "Product", value: "No-value preview" },
  { label: "Market data", value: "Illustrative fixtures" },
  { label: "Wallet connection", value: "Unavailable" },
  { label: "Contracts", value: "Not deployed" },
  { label: "Custody", value: "Not operating" },
  { label: "Mainnet approval", value: "Not cleared" },
  { label: "Country access", value: "Deny by default" },
] as const;

export const LANDING_PZEC = {
  eyebrow: "The custody boundary",
  heading: "pZEC would be a custody-backed receipt, not native ZEC.",
  body:
    "The candidate gateway would accept eligible transparent native ZEC and issue the same integer amount of 8-decimal pZEC on Arbitrum. A custody operator would control the native reserve and honor approved redemptions. Smart-contract self-custody after minting would not remove that reserve dependency.",
  negation: "pZEC is not native ZEC, shielded ZEC, or a trustless bridge asset.",
  disclosure: "No shielded deposit or withdrawal is planned for v1. Transparent Zcash and pZEC activity may be publicly linkable.",
  sourceLabel: "Read the ZIP 320 TEX address specification",
  sourceHref: "https://zips.z.cash/zip-0320",
  flow: [
    { title: "Transparent native ZEC", detail: "Eligible transparent Zcash only" },
    { title: "Planned custody and screening", detail: "Observation, screening, finality" },
    { title: "Planned pZEC mint on Arbitrum", detail: "Same integer amount, 8 decimals" },
    { title: "Order book or fixed LP pool", detail: "Offchain matcher or constrained pool" },
  ],
} as const;

export const LANDING_SKIP_LINKS = [
  { href: "#main-content", label: "Skip to main content" },
  { href: "#markets", label: "Skip to markets" },
  { href: "#exists-today", label: "Skip to evidence" },
  { href: "#pairs", label: "Skip to native pairs" },
  { href: "#terminal-preview", label: "Skip to terminal preview" },
  { href: "#journeys", label: "Skip to journeys" },
  { href: "#launch-gates", label: "Skip to launch gates" },
] as const;
