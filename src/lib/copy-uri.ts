export const COPY_URI_OK = "Copied a Zcash testnet payment request. Not mainnet and not a mint.";
export const COPY_URI_FAIL = "Could not copy. The request is still visible above. Nothing was sent.";

export async function copyUri(
  text: string,
  clipboard?: { writeText(value: string): Promise<void> } | null,
): Promise<string> {
  if (!clipboard?.writeText) {
    return COPY_URI_FAIL;
  }
  try {
    await clipboard.writeText(text);
    return COPY_URI_OK;
  } catch {
    return COPY_URI_FAIL;
  }
}
