import type { Market } from "./market-data.ts";
import { markets } from "./market-data.ts";
import type { SessionLogEvent } from "./replay.ts";

export function blotterEmptyOrdersCopy(settlementPair: Market["settlementPair"]): string {
  return `No open session orders. Settled as ${settlementPair}. Venue fixture levels remain on the book.`;
}

export function blotterEmptyFillsCopy(settlementPair: Market["settlementPair"]): string {
  return `No session fills yet. Settled as ${settlementPair}. Submitting a simulated order can trade against the fixture book.`;
}

export function blotterEmptyLogCopy(settlementPair: Market["settlementPair"]): string {
  return `No session events yet. Settled as ${settlementPair}. Replaying this log reconstructs the book and balances.`;
}

export function blotterLogCaptionCopy(settlementPair: Market["settlementPair"]): string {
  return `Append-only session event log. Current market settles as ${settlementPair}.`;
}

export function blotterLogEventCopy(event: SessionLogEvent): string {
  if (event.kind === "submit") {
    const expiry = !event.expiryUnix || event.expiryUnix === 0n ? "none" : event.expiryUnix.toString();
    return `${event.side} ${event.tif} ${event.id} expiry ${expiry}. Settled as ${markets[event.marketId].settlementPair}.`;
  }
  if (event.kind === "cancel") {
    return `${event.orderId}. Settled as ${markets[event.marketId].settlementPair}.`;
  }
  return "session reset";
}
