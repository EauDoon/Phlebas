import type { TicketOrderType, TicketSide } from "./ticket-groups.ts";
import { sizeAtomsForQuote, worstPriceTicks } from "./units.ts";

export const TICKET_MAX_LIMIT_PRICE_COPY = "Set a positive limit price before using size shortcuts.";
export const TICKET_MAX_SLIPPAGE_COPY = "Set a positive maximum slippage before using Max.";
export const TICKET_MAX_EMPTY_ZEC_COPY = "Session ZEC inventory is empty.";
export const TICKET_MAX_EMPTY_QUOTE_COPY = "Session quote inventory cannot fund this size.";

export function ticketInventoryShare(availableAtoms: bigint, sharePercent: bigint): bigint {
  return (availableAtoms * sharePercent) / 100n;
}

export function ticketMaxUnavailableCopy(side: TicketSide): string {
  return side === "sell" ? TICKET_MAX_EMPTY_ZEC_COPY : TICKET_MAX_EMPTY_QUOTE_COPY;
}

export function ticketMaxPriceTicks(options: {
  side: TicketSide;
  orderType: TicketOrderType;
  limitPriceTicks: bigint;
  lastTicks: bigint;
  slippageHundredths: bigint;
}): bigint {
  if (options.side === "sell") {
    return 1n;
  }
  if (options.orderType === "limit") {
    if (options.limitPriceTicks <= 0n) {
      throw new Error(TICKET_MAX_LIMIT_PRICE_COPY);
    }
    return options.limitPriceTicks;
  }
  return worstPriceTicks(options.lastTicks, options.side, options.slippageHundredths);
}

export function maxTicketSizeAtoms(options: {
  side: TicketSide;
  availableZecAtoms: bigint;
  availableQuoteAtoms: bigint;
  priceTicks: bigint;
}): bigint {
  if (options.side === "sell") {
    return options.availableZecAtoms > 0n ? options.availableZecAtoms : 0n;
  }
  if (options.availableQuoteAtoms <= 0n || options.priceTicks <= 0n) {
    return 0n;
  }
  return sizeAtomsForQuote(options.availableQuoteAtoms, options.priceTicks);
}

export function maxTicketSizeAtomsForShare(options: {
  side: TicketSide;
  availableZecAtoms: bigint;
  availableQuoteAtoms: bigint;
  priceTicks: bigint;
  sharePercent: bigint;
}): bigint {
  return maxTicketSizeAtoms({
    side: options.side,
    availableZecAtoms: ticketInventoryShare(options.availableZecAtoms, options.sharePercent),
    availableQuoteAtoms: ticketInventoryShare(options.availableQuoteAtoms, options.sharePercent),
    priceTicks: options.priceTicks,
  });
}
