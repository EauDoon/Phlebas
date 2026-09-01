import type { Market } from "./market-data.ts";
import { markets } from "./market-data.ts";
import type { SessionLogEvent } from "./replay.ts";
import { ticketReviewRefundCopy } from "./ticket-review-copy.ts";

export function blotterEmptyOrdersCopy(settlementPair: Market["settlementPair"]): string {
  return `No open session orders. Settled as ${settlementPair}.`;
}

export function blotterEmptyFillsCopy(settlementPair: Market["settlementPair"]): string {
  return `No session fills yet. Settled as ${settlementPair}.`;
}

export function blotterEmptyLogCopy(settlementPair: Market["settlementPair"]): string {
  return `No session events yet. Settled as ${settlementPair}.`;
}

export function blotterLogCaptionCopy(settlementPair: Market["settlementPair"]): string {
  return `Append-only session event log. Current market settles as ${settlementPair}.`;
}

export function blotterCancelRefundCopy(): string {
  return `Cancel returns reserved size. ${ticketReviewRefundCopy()}`;
}

export function blotterLogEventCopy(event: SessionLogEvent): string {
  if (event.kind === "submit") {
    const expiry = !event.expiryUnix || event.expiryUnix === 0n ? "none" : event.expiryUnix.toString();
    return `${event.side} ${event.tif} expiry ${expiry}. Settled as ${markets[event.marketId].settlementPair}.`;
  }
  if (event.kind === "cancel") {
    return `Cancelled. Settled as ${markets[event.marketId].settlementPair}.`;
  }
  return "session reset";
}
