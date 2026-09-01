export const PREVIEW_CHIP_TEXT =
  "Public preview · illustrative data · no mainnet funds" as const;

export const PREVIEW_CHIP_HREF = "/status" as const;

export const PREVIEW_CHIP_STORAGE_KEY = "phlebas.previewChipAnnounced" as const;

export function isPreviewChipAnnounced(
  moduleAnnounced: boolean,
  storageValue: string | null | undefined,
): boolean {
  return moduleAnnounced || storageValue === "1";
}

export function previewChipStatusRole(alreadyAnnounced: boolean): "status" | undefined {
  return alreadyAnnounced ? undefined : "status";
}
