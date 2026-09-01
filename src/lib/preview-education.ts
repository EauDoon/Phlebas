export const PREVIEW_EDUCATION_VERSION = "2026-09-01-3";
export const PREVIEW_EDUCATION_STORAGE_KEY = "phlebas.previewEducationVersion";

export const PREVIEW_EDUCATION_STEPS = [
  {
    title: "This public preview uses illustrative data.",
    body: "An Ethereum Mainnet wallet can connect for identity. It does not sign or submit a transaction.",
  },
  {
    title: "Pairs are native ZEC against USDC and USDT.",
    body: "Not live settlement, not shielded, not a trustless bridge. USDT0 is abandoned.",
  },
  {
    title: "Actions stay in this browser.",
    body: "Contracts are not deployed. Preview actions stay in this browser; no signing, submission, or asset movement is enabled.",
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
