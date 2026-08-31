export type CanonicalOrder = {
  maker: "session";
  side: "buy" | "sell";
  baseAsset: "ZEC";
  quoteAsset: "USDC" | "USDT";
  baseAmountAtoms: string;
  limitPriceTicks: string;
  nonce: string;
  accountEpoch: string;
  expiry: string;
  salt: string;
  recipient: "session";
  maximumFeeBps: "30";
  allowedVenues: "clob" | "amm" | "clob,amm";
  chainId: "42161";
  verifyingContract: "not-deployed";
};

const FIELD_ORDER: Array<keyof CanonicalOrder> = [
  "maker",
  "side",
  "baseAsset",
  "quoteAsset",
  "baseAmountAtoms",
  "limitPriceTicks",
  "nonce",
  "accountEpoch",
  "expiry",
  "salt",
  "recipient",
  "maximumFeeBps",
  "allowedVenues",
  "chainId",
  "verifyingContract",
];

export function encodeCanonicalOrder(order: CanonicalOrder): string {
  return FIELD_ORDER.map((field) => `${field}=${order[field]}`).join("\n");
}

export async function digestCanonicalOrder(order: CanonicalOrder): Promise<string> {
  const encoded = encodeCanonicalOrder(order);
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(encoded);
    const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(encoded).digest("hex");
}
