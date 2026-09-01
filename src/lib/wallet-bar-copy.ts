export type IssuedTex = {
  tex: string;
  request: string;
};

export const NO_TEX_ISSUED = "No TEX issued";
export const COPY_TEX_LABEL = "Copy TEX";
export const COPY_TEX_UNAVAILABLE_LABEL = "Copy TEX unavailable. No TEX issued.";
export const EVM_ADDRESS_LABEL = "Connected EVM address";
export const ZEC_DESTINATION_LABEL = "ZEC destination";

export function issuedTexAddress(issued: IssuedTex | null | undefined): string | null {
  const tex = issued?.tex.trim() ?? "";
  return tex.length > 0 ? tex : null;
}

export function texDestinationStatus(issued: IssuedTex | null | undefined): string {
  return issuedTexAddress(issued) ?? NO_TEX_ISSUED;
}

export function canCopyTex(issued: IssuedTex | null | undefined): boolean {
  return Boolean(issuedTexAddress(issued) && issued?.request.trim());
}

export function shortenTexDisplay(tex: string): string {
  const value = tex.trim();
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function shortenEvmDisplay(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function copyTexAriaLabel(issued: IssuedTex | null | undefined): string {
  return canCopyTex(issued) ? COPY_TEX_LABEL : COPY_TEX_UNAVAILABLE_LABEL;
}

export function texStatusDisplay(issued: IssuedTex | null | undefined): string {
  const tex = issuedTexAddress(issued);
  return tex ? shortenTexDisplay(tex) : NO_TEX_ISSUED;
}
