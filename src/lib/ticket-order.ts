import { eip712DigestHex, sepoliaDomain, timeInForceCode, venuesBitmask, type TypedOrder } from "./eip712.ts";
import type { TimeInForce } from "./matcher.ts";
import type { TerminalMode } from "./terminal-mode.ts";
import { quoteTokenAddress, TESTNET } from "./testnet.ts";
import {
  effectiveTicketOrderType,
  effectiveTicketTif,
  type TicketOrderType,
  type TicketSide,
  type TicketTif,
} from "./ticket-groups.ts";
import { worstPriceTicks } from "./units.ts";

export { parseExpiryUnix } from "./ticket-expiry.ts";

export const TIF_SALT = {
  GTC: 1n,
  IOC: 2n,
  FOK: 3n,
} as const;

export const TICKET_POSITIVE_PRICE_SIZE_COPY = "Price and size must be positive.";
export const TICKET_SLIPPAGE_RANGE_COPY =
  "Enter maximum slippage from 0 up to, but not including, 100 percent.";

export type TicketInstruction = {
  orderType: TicketOrderType;
  tif: TicketTif;
  priceTicks: bigint;
  expiryUnix: bigint;
};

export function ticketOrderPriceTicks(input: {
  orderType: TicketOrderType;
  side: TicketSide;
  limitPriceTicks: bigint;
  lastTicks: bigint;
  slippageHundredths: bigint;
}): bigint {
  if (input.orderType === "market") {
    return worstPriceTicks(input.lastTicks, input.side, input.slippageHundredths);
  }
  return input.limitPriceTicks;
}

export function ticketOrderExpiryUnix(mode: TerminalMode, expiryUnix: bigint): bigint {
  return mode === "simple" ? 0n : expiryUnix;
}

export function ticketInstruction(input: {
  mode: TerminalMode;
  orderType: TicketOrderType;
  tif: TicketTif;
  side: TicketSide;
  limitPriceTicks: bigint;
  lastTicks: bigint;
  slippageHundredths: bigint;
  expiryUnix: bigint;
}): TicketInstruction {
  const orderType = effectiveTicketOrderType(input.mode, input.orderType);
  return {
    orderType,
    tif: effectiveTicketTif(input.mode, input.orderType, input.tif),
    priceTicks: ticketOrderPriceTicks({
      orderType,
      side: input.side,
      limitPriceTicks: input.limitPriceTicks,
      lastTicks: input.lastTicks,
      slippageHundredths: input.slippageHundredths,
    }),
    expiryUnix: ticketOrderExpiryUnix(input.mode, input.expiryUnix),
  };
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
    timeInForce: timeInForceCode(input.tif),
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
