import { eip712DigestHex, sepoliaDomain, venuesBitmask, type TypedOrder } from "./eip712.ts";
import type { TimeInForce } from "./matcher.ts";
import { quoteTokenAddress, TESTNET } from "./testnet.ts";

export const TIF_SALT = {
  GTC: 1n,
  IOC: 2n,
  FOK: 3n,
} as const;

export function parseExpiryUnix(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "0") return 0n;
  if (!/^[0-9]{1,20}$/.test(trimmed)) {
    throw new Error("Expiry must be a whole unix time, or 0 for none.");
  }
  return BigInt(trimmed);
}

export function typedOrderFromTicket(input: {
  maker: string;
  recipient?: string;
  side: "buy" | "sell";
  quote: "USDC" | "USDT";
  sizeAtoms: bigint;
  priceTicks: bigint;
  nonce: bigint;
  accountEpoch: bigint;
  tif: TimeInForce;
  expiry?: bigint;
}): TypedOrder {
  return {
    maker: input.maker,
    side: input.side === "buy" ? 0 : 1,
    baseAsset: TESTNET.zec,
    quoteAsset: quoteTokenAddress(input.quote),
    baseAmount: input.sizeAtoms,
    limitPriceTicks: input.priceTicks,
    nonce: input.nonce,
    accountEpoch: input.accountEpoch,
    expiry: input.expiry ?? 0n,
    salt: TIF_SALT[input.tif],
    recipient: input.recipient ?? input.maker,
    maximumFeeBps: 30,
    allowedVenues: venuesBitmask("clob"),
  };
}

export function settlementDigest(order: TypedOrder): string {
  return eip712DigestHex(sepoliaDomain(TESTNET.settlement), order);
}
