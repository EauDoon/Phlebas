export const PREVIEW_EDUCATION_VERSION = "2026-09-01-1";
export const PREVIEW_EDUCATION_STORAGE_KEY = "phlebas.previewEducationVersion";

export const PREVIEW_EDUCATION_STEPS = [
  {
    title: "This is a no-value simulation.",
    body: "Prices, orders, pools, balances, and historical state-tour events are illustrative. Optional Arbitrum Sepolia wallet connection is sign-only by default and does not move mainnet funds.",
  },
  {
    title: "Pairs are native ZEC against USDC and USDT.",
    body: "This preview labels ZEC-USDC and ZEC-USDT. It is not live settlement, not shielded ZEC, and not a trustless bridge. USDT0 is abandoned. No mainnet funds move here.",
  },
  {
    title: "Preview actions stay in this browser.",
    body: "You can inspect order entry, pool math, and historical custody states. Session fills stay in this browser. Optional Sepolia signing does not move mainnet funds and is not a financial record.",
  },
] as const;

export function shouldShowPreviewEducation(
  storedVersion: string | null,
  currentVersion = PREVIEW_EDUCATION_VERSION,
): boolean {
  return storedVersion !== currentVersion;
}

export function isEducationForceQuery(value: string | undefined): boolean {
  return value === "1";
}

export function isEducationLastStep(step: number): boolean {
  return step === PREVIEW_EDUCATION_STEPS.length - 1;
}
