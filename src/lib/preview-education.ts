export const PREVIEW_EDUCATION_VERSION = "2026-09-01-2";
export const PREVIEW_EDUCATION_STORAGE_KEY = "phlebas.previewEducationVersion";

export const PREVIEW_EDUCATION_STEPS = [
  {
    title: "This is a no-value simulation.",
    body: "Prices, orders, pools, balances, and historical state-tour events are illustrative. Optional Ethereum Mainnet wallet connection is read-and-sign only in this preview and cannot submit a transaction.",
  },
  {
    title: "Pairs are native ZEC against USDC and USDT.",
    body: "This preview labels ZEC-USDC and ZEC-USDT. It is not live settlement, not shielded ZEC, and not a trustless bridge. USDT0 is abandoned. No mainnet funds move here.",
  },
  {
    title: "Preview actions stay in this browser.",
    body: "You can inspect order entry, pool math, and historical custody states. Session fills stay in this browser. Optional Ethereum Mainnet signing cannot move funds and is not a financial record.",
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
