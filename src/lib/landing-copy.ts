export const LANDING_HERO = {
  eyebrow: "Transparent ZEC markets",
  heading: "Native ZEC. Native stables. No platform balance.",
  supporting:
    "Phlebas is a prelaunch order-book design for native transparent ZEC against Ethereum Mainnet USDC and USDT. Each future fill is designed to use one Zcash lock and one exact-token EVM lock, funded from the parties’ wallets. Contracts are not deployed, and the matcher never holds the assets.",
  primaryAction: "Open terminal",
  primaryHref: "/trade?view=trade",
  secondaryAction: "How settlement works",
  secondaryHref: "/trade?view=settlement",
  disclosure: "Nothing here can be bought, sold, deposited, withdrawn, or redeemed.",
} as const;

export const LANDING_BANNER = {
  label: "Product disclosure",
  kicker: "Public preview",
  body: "Ethereum Mainnet wallet connection is available. Signing, submission, and value movement are disabled until activation. Contracts are not deployed yet. This is not yet a live exchange.",
} as const;

export const LANDING_HEADER_STATUS = "Public preview";

export const LANDING_NAV = [
  { href: "#markets", label: "Markets" },
  { href: "/trade?view=trade", label: "Terminal" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/trade?view=architecture", label: "Docs" },
  { href: "/status", label: "Status" },
] as const;

export const PRODUCT_NAV = [
  { href: "/#markets", label: "Markets" },
  { href: "/trade?view=trade", label: "Terminal" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/trade?view=architecture", label: "Docs" },
  { href: "/status", label: "Status" },
] as const;

export const LANDING_LEDGER_HEADING = "Current system";

export const LANDING_LEDGER_PILL = "Public preview";

export const LANDING_LEDGER = [
  { label: "Product", value: "Public preview" },
  { label: "Market data", value: "Illustrative" },
  { label: "Wallet connection", value: "Ethereum Mainnet connection only" },
  { label: "Contracts", value: "Not deployed" },
  { label: "Custody", value: "None" },
  { label: "Mainnet", value: "Not cleared" },
  { label: "Country access", value: "Deny by default" },
] as const;

export const LANDING_LEDGER_NOTE = "Market data is illustrative until activation. Phlebas is not yet a live exchange.";

export const LANDING_STATUS_DETAILS = "Open status details";

export const LANDING_SKIP_LINKS = [
  { href: "#main-content", label: "Skip to main content" },
  { href: "#markets", label: "Skip to markets" },
  { href: "#terminal-preview", label: "Skip to terminal preview" },
  { href: "#settlement-how", label: "Skip to settlement" },
  { href: "#why-not-wrapped", label: "Skip to why not wrapped" },
  { href: "#paths", label: "Skip to paths" },
] as const;

export const LANDING_MARKETS_INTRO = {
  eyebrow: "Two markets",
  heading: "ZEC/USDC and ZEC/USDT, exactly identified.",
  supporting: "Quote assets use the exact issuer contracts on Ethereum Mainnet. USDT0 is abandoned and is not a listed settlement asset.",
} as const;

export const LANDING_MARKETS = [
  {
    kicker: "First settlement target",
    title: "ZEC / USDC",
    body: "Native transparent ZEC against exact Ethereum Mainnet USDC. Value-moving settlement remains disabled.",
    href: "/trade?view=settlement&market=ZEC%2FUSDC",
    action: "How settlement works",
  },
  {
    kicker: "Exact mainnet quote asset",
    title: "ZEC / USDT",
    body: "Native transparent ZEC against exact Ethereum Mainnet USDT. Value-moving settlement remains disabled.",
    href: "/trade?view=settlement&market=ZEC%2FUSDT",
    action: "Read settlement",
  },
] as const;

export const LANDING_SETTLEMENT_INTRO = {
  eyebrow: "How a fill settles",
  heading: "One Zcash lock. One exact-token lock.",
  supporting:
    "Each fill is funded from the parties’ wallets. Claim and refund are mutually exclusive. The matcher never holds the assets.",
} as const;

export const LANDING_SETTLEMENT_STEPS = [
  { title: "Signed order", detail: "Exact market, amount, price, and expiry." },
  { title: "Matched fill", detail: "Deterministic terms. Zero protocol fee." },
  {
    title: "ZEC lock, then stablecoin lock",
    detail: "One transparent Zcash lock and one exact-token EVM lock, funded from the parties’ wallets.",
  },
  {
    title: "Claim or refund",
    detail: "Evidence-gated. Mutually exclusive. The matcher never holds the assets.",
  },
] as const;

export const LANDING_WHY_NOT_WRAPPED_INTRO = {
  eyebrow: "Why not wrapped",
  heading: "No pZEC. No mint. No omnibus.",
  supporting: "Solvers keep inventory in their own wallets. There is no shared LP token and no platform balance.",
} as const;

export const LANDING_TERMINAL_PREVIEW = {
  eyebrow: "Terminal",
  heading: "The book and the ticket.",
  supporting: "This frame cannot submit, sign, or fill.",
  chip: "Public preview",
  lastLabel: "Last",
  marketDataLabel: "Market data",
  ticketEyebrow: "Order ticket",
  ticketSummary: "Buy · Limit · 10 ZEC",
  bound: "This frame cannot submit, sign, or fill.",
  cta: "Open terminal",
  href: "/trade?view=trade",
} as const;

export const LANDING_PATHS_INTRO = {
  eyebrow: "Choose a path",
  heading: "Trade. Provide quotes. Read settlement.",
} as const;

export const LANDING_FOOTER =
  "Phlebas is pre-launch. It is not yet a live exchange and is not an offer of financial services.";
