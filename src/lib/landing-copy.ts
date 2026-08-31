export const LANDING_HERO = {
  eyebrow: "A transparent pZEC market design",
  heading: "An order book for pZEC, with the custody line drawn in public.",
  supporting:
    "Phlebas models ZEC / USDC and ZEC / USDT spot markets that would settle with pZEC against USDC and USDT0, plus small constant-product pools. The current product is a no-value simulation. pZEC does not exist today, and no native ZEC or stablecoin enters this application.",
  primaryAction: "Enter simulation",
  secondaryAction: "Understand pZEC",
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
  { href: "#pzec", label: "Skip to pZEC" },
  { href: "#terminal-preview", label: "Skip to terminal preview" },
  { href: "#journeys", label: "Skip to journeys" },
  { href: "#launch-gates", label: "Skip to launch gates" },
] as const;
