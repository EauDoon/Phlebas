export const COPY_URI_PLACEHOLDER_OK = "Copied a placeholder ZIP 321 URI. Not payable.";
export const COPY_URI_TESTNET_OK = "Copied a Zcash testnet payment request. Not mainnet and not a mint.";
export const COPY_URI_UNAVAILABLE = "Clipboard is unavailable. The URI was not copied.";
export const COPY_URI_FAIL = "Clipboard copy failed. The URI was not copied. Nothing was sent.";

export async function copyUri(
  text: string,
  clipboard: { writeText(value: string): Promise<void> } | null | undefined,
  kind: "placeholder" | "testnet",
): Promise<string> {
  if (!clipboard?.writeText) {
    return COPY_URI_UNAVAILABLE;
  }
  try {
    await clipboard.writeText(text);
    return kind === "testnet" ? COPY_URI_TESTNET_OK : COPY_URI_PLACEHOLDER_OK;
  } catch {
    return COPY_URI_FAIL;
  }
}
