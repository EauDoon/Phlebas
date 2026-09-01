export const PREVIEW_EDUCATION_VERSION = "2026-09-01-2";
export const PREVIEW_EDUCATION_STORAGE_KEY = "phlebas.previewEducationVersion";

export const PREVIEW_EDUCATION_STEPS = [
  {
    title: "This public preview uses illustrative data.",
    body: "No chain is connected.",
  },
  {
    title: "Pairs are native ZEC against USDC and USDT.",
    body: "Not live settlement, not shielded, not a trustless bridge. USDT0 is abandoned.",
  },
  {
    title: "Actions stay in this browser.",
    body: "Until wallets and contracts are enabled, preview actions stay in this browser.",
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
